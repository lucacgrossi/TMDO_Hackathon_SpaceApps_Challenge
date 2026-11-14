import json
from pathlib import Path

import httpx
import numpy as np

from app.satelite import cobertura, grilla, pc, raster
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _servidor_fixtures(pedidos, grilla_ok=True):
    def handler(request):
        pedidos.append(request)
        if request.url.path.endswith("/stac/v1/search"):
            return httpx.Response(200, json={"features": json.loads((FIX / "worldcover_busqueda.json").read_text())})
        if request.url.path.endswith("/item/statistics"):
            return httpx.Response(200, json=json.loads((FIX / "worldcover_stats.json").read_text()))
        if "/item/bbox/" in request.url.path and grilla_ok:  # WorldCover real del 14/11, mode, 42 × 30
            return httpx.Response(200, content=(FIX / "grilla_worldcover.npy").read_bytes())
        return httpx.Response(404)
    return handler


def test_lote_demo_en_grilla(monkeypatch):
    """WorldCover real sobre la grilla común: 93,9 % de cultivo, igual a la media de la capa."""
    pedidos = []
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(_servidor_fixtures(pedidos))))
    r = cobertura.calcular(LOTE_EJEMPLO)
    assert CLAVES <= r["cultivo_pct"].keys()
    assert r["cultivo_pct"]["valor"] == 93.9 and r["es_agricola"] is True
    assert "1155 de 1230" in r["cultivo_pct"]["nota"] and "1″" in r["cultivo_pct"]["resolucion"]
    assert abs(sum(c["pct"] for c in r["clases"]) - 100) < 0.5
    bbox = [p for p in pedidos if "/item/bbox/" in p.url.path]
    assert len(bbox) == 1 and bbox[0].url.params["resampling"] == "mode"
    assert "2021_v200" in bbox[0].url.params["item"]
    assert not [p for p in pedidos if p.url.path.endswith("/item/statistics")]

    mapa, g = r["mapa"], grilla.crear(LOTE_EJEMPLO)
    assert r["grilla"] == g.a_dict() and mapa["bounds"] == g.bounds and (mapa["alto"], mapa["ancho"]) == (30, 42)
    assert mapa["resumen"]["media"] == mapa["resumen"]["valor_lote"] == r["cultivo_pct"]["valor"]
    assert mapa["resumen"]["pixeles"] == int(grilla.mascara(g, LOTE_EJEMPLO).sum())
    v = raster.descuantizar(mapa["valores"], mapa["factor"], mapa["nodata"], mapa["alto"], mapa["ancho"])
    assert set(np.unique(v[np.isfinite(v)])) == {0.0, 100.0}


def test_lote_demo(monkeypatch):
    """Si la grilla falla, el % sale de item/statistics (10 m, fixture del 14/11): 94 %, sin capa."""
    pedidos = []
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(
        _servidor_fixtures(pedidos, grilla_ok=False))))
    r = cobertura.calcular(LOTE_EJEMPLO)
    assert CLAVES <= r["cultivo_pct"].keys()
    assert 93 <= r["cultivo_pct"]["valor"] <= 95
    assert r["es_agricola"] is True and r["aviso"] is None
    assert r["clase_principal"] == {"codigo": 40, "nombre": "Cultivo", "pct": r["cultivo_pct"]["valor"]}
    assert abs(sum(c["pct"] for c in r["clases"]) - 100) < 0.5
    # La búsqueda trae 2020 v100 y 2021 v200: solo se piden estadísticas de 2021 v200, en modo categórico.
    stats = [p for p in pedidos if p.url.path.endswith("/item/statistics")]
    assert len(stats) == 1
    assert "2021_v200" in stats[0].url.params["item"] and stats[0].url.params["categorical"] == "true"
    assert r["mapa"] is None and "HTTP 404" in r["mapa_motivo"] and "sin capa" in r["cultivo_pct"]["nota"]


def _con_histograma(monkeypatch, *histogramas):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": f"ESA_WorldCover_10m_2021_v200_T{i}"}
                                                       for i in range(len(histogramas))])
    it = iter(histogramas)
    monkeypatch.setattr(pc, "estadisticas", lambda *a, **k: {"histogram": next(it)})

    def sin_grilla(*a, **k):
        raise pc.ErrorPC("Planetary Computer respondió con error HTTP 404")
    monkeypatch.setattr(pc, "raster_en_grilla", sin_grilla)


def test_lote_urbano_avisa(monkeypatch):
    _con_histograma(monkeypatch, [[19879, 236, 10], [50, 30, 40]])
    r = cobertura.calcular(LOTE_EJEMPLO)
    assert r["es_agricola"] is False
    assert r["cultivo_pct"]["valor"] == 0.0          # 10 de 20.125 píxeles
    assert r["clase_principal"]["nombre"] == "Construido"
    assert r["aviso"].startswith("Marcá un lote de campo") and "construido" in r["aviso"]


def test_suma_teselas_en_el_borde(monkeypatch):
    """Lote que cruza el borde de una tesela de 3°: se suman los píxeles de las dos."""
    _con_histograma(monkeypatch, [[151, 8489], [30, 40]], [[89, 8, 8543], [10, 30, 40]])
    r = cobertura.calcular(LOTE_EJEMPLO)
    assert r["cultivo_pct"]["valor"] == round(100 * (8489 + 8543) / 17280, 1)
    assert "17032 de 17280" in r["cultivo_pct"]["nota"]


def test_umbral_configurable(monkeypatch):
    _con_histograma(monkeypatch, [[45, 55], [40, 30]])
    assert cobertura.calcular(LOTE_EJEMPLO)["es_agricola"] is False
    monkeypatch.setattr(cobertura, "UMBRAL_AGRICOLA_PCT", 40.0)
    _con_histograma(monkeypatch, [[45, 55], [40, 30]])
    assert cobertura.calcular(LOTE_EJEMPLO)["es_agricola"] is True


def test_falla_no_rompe(monkeypatch):
    def explota(*a, **k):
        raise pc.ErrorPC("Planetary Computer no respondió en 10 s")
    monkeypatch.setattr(pc, "buscar", explota)
    r = cobertura.calcular(LOTE_EJEMPLO)
    ind = r["cultivo_pct"]
    assert ind["valor"] is None and ind["confianza"] == "sin_dato" and "no respondió" in ind["motivo"]
    assert r["es_agricola"] is None and r["aviso"] is None


def test_sin_items_ni_pixeles(monkeypatch):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "ESA_WorldCover_10m_2020_v100_S36W066"}])
    assert cobertura.calcular(LOTE_EJEMPLO)["cultivo_pct"]["confianza"] == "sin_dato"
    _con_histograma(monkeypatch, [[], []])
    r = cobertura.calcular(LOTE_EJEMPLO)
    assert r["cultivo_pct"]["valor"] is None and "píxeles válidos" in r["cultivo_pct"]["motivo"]


def test_suma_teselas_en_la_grilla(monkeypatch):
    """Lote que cruza el borde de una tesela: cada píxel de la grilla toma el dato de la tesela que lo tiene."""
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "ESA_WorldCover_10m_2021_v200_A"},
                                                       {"id": "ESA_WorldCover_10m_2021_v200_B"}])

    def raster_en_grilla(coleccion, item, g, **k):
        a = np.full((g.alto, g.ancho), np.nan)
        if item.endswith("A"):
            a[:, : g.ancho // 2] = 40           # mitad oeste: cultivo
        else:
            a[:, g.ancho // 2:] = 30            # mitad este: pastizal
        return a
    monkeypatch.setattr(pc, "raster_en_grilla", raster_en_grilla)
    r = cobertura.calcular(LOTE_EJEMPLO)
    g = grilla.crear(LOTE_EJEMPLO)
    m = grilla.mascara(g, LOTE_EJEMPLO)
    esperado = round(100 * m[:, : g.ancho // 2].sum() / m.sum(), 1)
    assert r["cultivo_pct"]["valor"] == esperado == r["mapa"]["resumen"]["media"]
