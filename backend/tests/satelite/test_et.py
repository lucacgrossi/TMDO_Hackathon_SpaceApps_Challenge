import json
from pathlib import Path

import httpx
import numpy as np

from app.satelite import et, pc
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _servidor_fixtures(request):
    if request.url.path.endswith("/stac/v1/search"):
        return httpx.Response(200, json={"features": json.loads((FIX / "et_busqueda.json").read_text())})
    if request.url.path.endswith("/item/feature.npy"):
        item = request.url.params["item"]
        if item.startswith(("MOD16A3GF.A2025", "MYD16A3GF.A2025")):
            return httpx.Response(200, content=(FIX / f"et_{item[:3].lower()}_2025.npy").read_bytes())
    return httpx.Response(404)


def test_lote_demo(monkeypatch):
    """Respuesta real de MODIS ET del 14/11 (fixture): 2025, Terra 600 mm y Aqua 614 mm."""
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(_servidor_fixtures)))
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert CLAVES <= r.keys()
    assert r["anios"] == "2025"                      # el último año completo, no 2024
    assert 550 <= r["valor"] <= 700
    assert r["unidad"] == "mm/año" and r["resolucion"] == "500 m" and r["confianza"] == "media"
    assert "Terra" in r["nota"] and "Aqua" in r["nota"]


def _item(sat, anio, fin=None):
    return {"id": f"{sat}16A3GF.A{anio}001.h12v12.061.X",
            "properties": {"start_datetime": f"{anio}-01-01T00:00:00Z",
                           "end_datetime": fin or f"{anio}-12-31T23:59:59Z"}}


def _arr(*vals):
    v = np.array([vals], dtype=np.uint16)
    return v, np.ones_like(v, dtype=bool), [0, 0, 1, 1]


def test_anio_en_curso_no_cuenta(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [_item("MOD", 2024), _item("MOD", 2999)])
    pedidos = []

    def array(coleccion, item, *a, **k):
        pedidos.append(item)
        return _arr(5000)
    monkeypatch.setattr(pc, "array_poligono", array)
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["anios"] == "2024" and r["valor"] == 500 and pedidos == [_item("MOD", 2024)["id"]]


def test_descarta_relleno_y_promedia_satelites(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [_item("MOD", 2025), _item("MYD", 2025)])
    arrays = {"MOD": _arr(6000, 65530), "MYD": _arr(6400, 6400)}
    monkeypatch.setattr(pc, "array_poligono", lambda c, item, *a, **k: arrays[item[:3]])
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["valor"] == 620                         # (600 + 640) / 2; el 65530 es relleno
    assert "Terra 600 mm y Aqua 640 mm" in r["nota"]


def test_un_satelite_falla_usa_el_otro(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [_item("MOD", 2025), _item("MYD", 2025)])

    def array(c, item, *a, **k):
        if item.startswith("MYD"):
            raise pc.ErrorPC("Planetary Computer no respondió en 10 s")
        return _arr(6000)
    monkeypatch.setattr(pc, "array_poligono", array)
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["valor"] == 600 and "solo Terra" in r["nota"]


def test_lote_solo_relleno(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [_item("MOD", 2025)])
    monkeypatch.setattr(pc, "array_poligono", lambda *a, **k: _arr(65530, 65530))
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["valor"] is None and r["confianza"] == "sin_dato" and "zona urbana" in r["motivo"]
    assert r["anios"] == "2025"


def test_falla_no_rompe(monkeypatch):
    def explota(*a, **k):
        raise pc.ErrorPC("Planetary Computer no respondió en 10 s")
    monkeypatch.setattr(pc, "buscar", explota)
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["valor"] is None and r["confianza"] == "sin_dato" and "no respondió" in r["motivo"]


def test_todos_los_pedidos_fallan(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [_item("MOD", 2025), _item("MYD", 2025)])

    def explota(*a, **k):
        raise pc.ErrorPC("Planetary Computer respondió con error HTTP 503")
    monkeypatch.setattr(pc, "array_poligono", explota)
    r = et.calcular(LOTE_EJEMPLO)["et_real_anual"]
    assert r["valor"] is None and "HTTP 503" in r["motivo"]


def test_sin_items(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [])
    assert et.calcular(LOTE_EJEMPLO)["et_real_anual"]["confianza"] == "sin_dato"
