import json
import math
from pathlib import Path

import httpx
import numpy as np
import pytest

from app.satelite import elevacion, grilla, pc, raster, terrario
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _servidor_fixtures(request):
    if request.url.path.endswith("/stac/v1/search"):
        return httpx.Response(200, json={"features": json.loads((FIX / "nasadem_busqueda.json").read_text())})
    if "/item/bbox/" in request.url.path:  # NASADEM real del 14/11 sobre la grilla ampliada (52 × 40)
        return httpx.Response(200, content=(FIX / "grilla_nasadem.npy").read_bytes())
    return httpx.Response(404)


def _aws_fixture(request):
    """Sirve la tesela terrarium real (zoom 12) que cubre el lote demo."""
    if request.url.path.endswith("/terrarium/12/1317/2449.png"):
        return httpx.Response(200, content=(FIX / "terrario_12_1317_2449.png").read_bytes())
    return httpx.Response(404)


@pytest.fixture
def aws_fixture(monkeypatch):
    monkeypatch.setattr(terrario, "ZOOM_MAX", 12)      # con zoom 12 el lote demo entra en 1 tesela
    monkeypatch.setattr(terrario, "_cliente", httpx.Client(transport=httpx.MockTransport(_aws_fixture)))


@pytest.fixture
def aws_caido(monkeypatch):
    monkeypatch.setattr(terrario, "_cliente", httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(503))))


def _nasadem_falla(monkeypatch, motivo="Planetary Computer no respondió en 10 s"):
    def explota(*a, **k):
        raise pc.ErrorPC(motivo)
    monkeypatch.setattr(pc, "buscar", explota)


def test_lote_demo(monkeypatch):
    """Respuesta real de NASADEM del 14/11 (fixture): el prototipo da ~0,6 %."""
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(_servidor_fixtures)))
    r = elevacion.calcular(LOTE_EJEMPLO)
    general, maxima = r["pendiente_general"], r["pendiente_maxima"]
    assert CLAVES <= general.keys() and CLAVES <= maxima.keys()
    assert general["valor"] == 0.6 and maxima["valor"] == 2.6
    assert general["unidad"] == "%" and general["confianza"] == "alta"
    assert general["fuente"].startswith("NASADEM")


def test_lote_demo_capa_coherente(monkeypatch):
    """La capa sale del mismo raster y la misma máscara que el valor de la tabla."""
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(_servidor_fixtures)))
    r = elevacion.calcular(LOTE_EJEMPLO)
    mapa, g = r["mapa"], grilla.crear(LOTE_EJEMPLO)
    assert r["mapa_motivo"] is None and r["grilla"] == g.a_dict()
    assert mapa["bounds"] == g.bounds and (mapa["alto"], mapa["ancho"]) == (g.alto, g.ancho) == (30, 42)
    # mismo número que la tabla, y el plano usa los mismos píxeles que la capa
    assert mapa["resumen"]["valor_lote"] == r["pendiente_general"]["valor"]
    pixeles = int(grilla.mascara(g, LOTE_EJEMPLO).sum())
    assert mapa["resumen"]["pixeles"] == pixeles == 1230
    assert f"{pixeles} píxeles" in r["pendiente_general"]["nota"]
    # la pendiente máxima es el percentil 95 de los valores de la capa
    valores = raster.descuantizar(mapa["valores"], mapa["factor"], mapa["nodata"], mapa["alto"], mapa["ancho"])
    assert np.isfinite(valores).sum() == pixeles
    assert round(float(np.nanpercentile(valores, 95)), 1) == r["pendiente_maxima"]["valor"]
    assert mapa["id"] == "pendiente" and mapa["escala"]["cortes"] == [0.0, 1.0, 2.5, 4.0, 6.0]


def _plano_en_grilla(pend_x: float, pend_y: float):
    """raster_en_grilla falso: un plano z = 350 + pend_x·x + pend_y·y sobre la grilla que le pidan."""
    def raster_en_grilla(coleccion, item, g, **k):
        lat0 = (g.sur + g.norte) / 2
        m_lon = elevacion.M_POR_GRADO_LON_ECUADOR * math.cos(math.radians(lat0))
        x = (g.lons()[None, :] - g.lons().mean()) * m_lon
        y = (g.lats()[:, None] - lat0) * elevacion.M_POR_GRADO_LAT
        return 350 + pend_x * x + pend_y * y
    return raster_en_grilla


LOTE_L = {"type": "Polygon", "coordinates": [[
    [-64.250, -33.248], [-64.244, -33.248], [-64.244, -33.254], [-64.235, -33.254],
    [-64.235, -33.260], [-64.250, -33.260], [-64.250, -33.248]]]}


def test_plano_sintetico_en_l(monkeypatch):
    """Un plano con 2 % de pendiente y un lote en L tiene que dar 2,0 % (y la capa ~2 % en todo el lote)."""
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "sintetico"}])
    monkeypatch.setattr(pc, "raster_en_grilla", _plano_en_grilla(0.012, 0.016))   # hypot(1,2 %, 1,6 %) = 2,0 %
    r = elevacion.calcular(LOTE_L)
    assert r["pendiente_general"]["valor"] == 2.0
    assert abs(r["pendiente_maxima"]["valor"] - 2.0) <= 0.1
    res = r["mapa"]["resumen"]
    assert abs(res["min"] - 2.0) <= 0.1 and abs(res["max"] - 2.0) <= 0.1
    assert res["pixeles"] == int(grilla.mascara(grilla.crear(LOTE_L), LOTE_L).sum())


def test_lote_grande_usa_grilla_de_2_segundos(monkeypatch):
    monkeypatch.setattr(grilla, "MAX_PIXELES", 500)
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "sintetico"}])
    pedidos = []

    def raster_en_grilla(coleccion, item, g, **k):
        pedidos.append(k)
        return _plano_en_grilla(0.012, 0.016)(coleccion, item, g)
    monkeypatch.setattr(pc, "raster_en_grilla", raster_en_grilla)
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["mapa"]["resolucion_grilla"] == "2″ (~60 m)" and "2″" in r["mapa"]["nota"]
    assert "2″" in r["pendiente_general"]["nota"] and r["pendiente_general"]["valor"] == 2.0
    assert pedidos[0]["resampling"] == "average"   # a 1″ es "nearest" (la grilla de NASADEM)


def test_nasadem_falla_usa_aws(monkeypatch, aws_fixture):
    """NASADEM no responde → SRTM vía AWS (tesela real): parecido a NASADEM (0,6 %)."""
    _nasadem_falla(monkeypatch)
    r = elevacion.calcular(LOTE_EJEMPLO)
    general, maxima = r["pendiente_general"], r["pendiente_maxima"]
    assert CLAVES <= general.keys()
    assert 0.4 <= general["valor"] <= 0.8
    assert r["mapa"] is None and "AWS" in r["mapa_motivo"]   # el respaldo da solo el valor del lote
    assert general["fuente"] == "SRTM vía AWS Terrain Tiles" and general["resolucion"] == "~30 m"
    assert general["confianza"] == "media"
    assert "NASADEM falló" in general["nota"] and "no respondió" in general["nota"]
    assert maxima["valor"] is not None and maxima["fuente"] == general["fuente"]


def test_nasadem_sin_items_usa_aws(monkeypatch, aws_fixture):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [])
    r = elevacion.calcular(LOTE_EJEMPLO)["pendiente_general"]
    assert r["fuente"] == "SRTM vía AWS Terrain Tiles" and "sin datos" in r["nota"]


def test_fallan_los_dos(monkeypatch, aws_caido):
    _nasadem_falla(monkeypatch)
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["mapa"] is None and "NASADEM" in r["mapa_motivo"]
    for ind in (r["pendiente_general"], r["pendiente_maxima"]):
        assert ind["valor"] is None and ind["confianza"] == "sin_dato"
        assert "NASADEM" in ind["motivo"] and "AWS Terrain Tiles" in ind["motivo"] and "HTTP 503" in ind["motivo"]


def test_error_inesperado_no_rompe(monkeypatch, aws_caido):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "raster_en_grilla", lambda *a, **k: 1 / 0)
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["valor"] is None
    assert "ZeroDivisionError" in r["pendiente_general"]["motivo"]


def test_lote_sin_pixeles(monkeypatch, aws_caido):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "raster_en_grilla", lambda c, i, g, **k: np.full((g.alto, g.ancho), np.nan))
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["confianza"] == "sin_dato"
    assert "pocos píxeles" in r["pendiente_general"]["motivo"]


def test_poligono_roto_no_rompe():
    r = elevacion.calcular({"type": "Point"})
    assert r["pendiente_general"]["valor"] is None and r["pendiente_general"]["motivo"]
