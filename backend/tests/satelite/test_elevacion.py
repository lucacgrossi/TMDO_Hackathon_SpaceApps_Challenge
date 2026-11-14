import json
import math
from pathlib import Path

import httpx
import numpy as np

from app.satelite import elevacion, pc
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _servidor_fixtures(request):
    if request.url.path.endswith("/stac/v1/search"):
        return httpx.Response(200, json={"features": json.loads((FIX / "nasadem_busqueda.json").read_text())})
    if request.url.path.endswith("/item/feature.npy"):
        return httpx.Response(200, content=(FIX / "nasadem_lote_demo.npy").read_bytes())
    return httpx.Response(404)


def test_lote_demo(monkeypatch):
    """Respuesta real de NASADEM del 14/11 (fixture): el prototipo da ~0,6 %."""
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(_servidor_fixtures)))
    r = elevacion.calcular(LOTE_EJEMPLO)
    general, maxima = r["pendiente_general"], r["pendiente_maxima"]
    assert CLAVES <= general.keys() and CLAVES <= maxima.keys()
    assert 0.4 <= general["valor"] <= 0.8
    assert general["unidad"] == "%" and general["confianza"] == "alta"
    assert maxima["valor"] >= general["valor"]


def test_plano_sintetico_en_l(monkeypatch):
    """Un plano con 2 % de pendiente y una máscara en L tiene que dar 2,0 %."""
    h, w = 40, 50
    caja = [-64.25, -33.26, -64.235, -33.248]
    oeste, sur, este, norte = caja
    m_lon = elevacion.M_POR_GRADO_LON_ECUADOR * math.cos(math.radians(-33.254))
    lons = oeste + (np.arange(w) + 0.5) * (este - oeste) / w
    lats = norte - (np.arange(h) + 0.5) * (norte - sur) / h
    x = (lons[None, :] - lons.mean()) * m_lon
    y = (lats[:, None] - lats.mean()) * elevacion.M_POR_GRADO_LAT
    z = 350 + 0.012 * x + 0.016 * y          # hypot(1,2 %, 1,6 %) = 2,0 %
    adentro = np.ones((h, w), dtype=bool)
    adentro[: h // 2, w // 2:] = False       # forma de L

    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "sintetico"}])
    monkeypatch.setattr(pc, "array_poligono", lambda *a, **k: (z, adentro, caja))
    poligono = {"type": "Polygon", "coordinates": [[[oeste, norte], [este, norte], [este, sur],
                                                     [oeste, sur], [oeste, norte]]]}
    r = elevacion.calcular(poligono)
    assert r["pendiente_general"]["valor"] == 2.0
    assert abs(r["pendiente_maxima"]["valor"] - 2.0) <= 0.1


def test_falla_no_rompe(monkeypatch):
    def explota(*a, **k):
        raise pc.ErrorPC("Planetary Computer no respondió en 10 s")
    monkeypatch.setattr(pc, "buscar", explota)
    r = elevacion.calcular(LOTE_EJEMPLO)
    for ind in r.values():
        assert ind["valor"] is None and ind["confianza"] == "sin_dato" and "no respondió" in ind["motivo"]


def test_error_inesperado_no_rompe(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "array_poligono", lambda *a, **k: 1 / 0)
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["valor"] is None
    assert "ZeroDivisionError" in r["pendiente_general"]["motivo"]


def test_sin_items(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [])
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["valor"] is None and r["pendiente_general"]["motivo"]


def test_lote_sin_pixeles(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "array_poligono",
                        lambda *a, **k: (np.full((3, 3), 360), np.zeros((3, 3), dtype=bool),
                                         [-64.2, -33.2, -64.19, -33.19]))
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["confianza"] == "sin_dato"
    assert "pocos píxeles" in r["pendiente_general"]["motivo"]
