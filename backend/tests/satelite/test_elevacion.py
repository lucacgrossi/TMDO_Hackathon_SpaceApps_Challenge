import json
import math
from pathlib import Path

import httpx
import numpy as np
import pytest

from app.satelite import elevacion, pc, terrario
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _servidor_fixtures(request):
    if request.url.path.endswith("/stac/v1/search"):
        return httpx.Response(200, json={"features": json.loads((FIX / "nasadem_busqueda.json").read_text())})
    if request.url.path.endswith("/item/feature.npy"):
        return httpx.Response(200, content=(FIX / "nasadem_lote_demo.npy").read_bytes())
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
    assert general["valor"] == 0.6 and maxima["valor"] == 2.4
    assert general["unidad"] == "%" and general["confianza"] == "alta"
    assert general["fuente"].startswith("NASADEM")


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


def test_nasadem_falla_usa_aws(monkeypatch, aws_fixture):
    """NASADEM no responde → SRTM vía AWS (tesela real): parecido a NASADEM (0,6 %)."""
    _nasadem_falla(monkeypatch)
    r = elevacion.calcular(LOTE_EJEMPLO)
    general, maxima = r["pendiente_general"], r["pendiente_maxima"]
    assert CLAVES <= general.keys()
    assert 0.4 <= general["valor"] <= 0.8
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
    for ind in r.values():
        assert ind["valor"] is None and ind["confianza"] == "sin_dato"
        assert "NASADEM" in ind["motivo"] and "AWS Terrain Tiles" in ind["motivo"] and "HTTP 503" in ind["motivo"]


def test_error_inesperado_no_rompe(monkeypatch, aws_caido):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "array_poligono", lambda *a, **k: 1 / 0)
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["valor"] is None
    assert "ZeroDivisionError" in r["pendiente_general"]["motivo"]


def test_lote_sin_pixeles(monkeypatch, aws_caido):
    monkeypatch.setattr(pc, "buscar", lambda *a, **k: [{"id": "x"}])
    monkeypatch.setattr(pc, "array_poligono",
                        lambda *a, **k: (np.full((3, 3), 360), np.zeros((3, 3), dtype=bool),
                                         [-64.2, -33.2, -64.19, -33.19]))
    r = elevacion.calcular(LOTE_EJEMPLO)
    assert r["pendiente_general"]["confianza"] == "sin_dato"
    assert "pocos píxeles" in r["pendiente_general"]["motivo"]


def test_poligono_roto_no_rompe():
    r = elevacion.calcular({"type": "Point"})
    assert r["pendiente_general"]["valor"] is None and r["pendiente_general"]["motivo"]
