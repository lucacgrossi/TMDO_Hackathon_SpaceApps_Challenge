import io

import httpx
import numpy as np
import pytest
from PIL import Image

from app.satelite import terrario


def _png(elev: np.ndarray) -> bytes:
    """Codifica una grilla de elevación (m) en formato terrarium."""
    v = elev + 32768
    r = np.floor(v / 256)
    g = np.floor(v - r * 256)
    b = np.round((v - r * 256 - g) * 256)
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, format="PNG")
    return buf.getvalue()


def _cliente(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_decodifica_terrarium(monkeypatch):
    elev = np.full((256, 256), 361.5)
    elev[0, 0] = -10.25
    monkeypatch.setattr(terrario, "_cliente", _cliente(lambda r: httpx.Response(200, content=_png(elev))))
    out = terrario._bajar(14, 0, 0)
    assert out.shape == (256, 256)
    assert out[1, 1] == 361.5 and out[0, 0] == -10.25


def test_mosaico_cubre_el_bbox_con_lons_y_lats(monkeypatch):
    caja = [-64.2381, -33.2517, -64.2268, -33.2436]
    pedidas = []

    def handler(request):
        pedidas.append(request.url.path)
        return httpx.Response(200, content=_png(np.full((256, 256), 360.0)))
    monkeypatch.setattr(terrario, "_cliente", _cliente(handler))
    elev, lons, lats, z = terrario.elevacion_bbox(caja, margen_m=200, zoom=14)
    assert z == 14 and elev.shape == (len(lats), len(lons)) and (elev == 360).all()
    assert lons[0] < caja[0] and lons[-1] > caja[2]           # el margen queda afuera del bbox
    assert lats[0] > caja[3] and lats[-1] < caja[1]           # filas de norte a sur
    assert len(pedidas) == 4                                  # el lote demo + margen: 2 × 2 teselas


def test_baja_el_zoom_en_lotes_grandes():
    chico = [-64.2381, -33.2517, -64.2268, -33.2436]
    grande = [-64.309, -33.311, -64.156, -33.184]             # ~20.000 ha
    assert terrario.elegir_zoom(chico, 200) == terrario.ZOOM_MAX
    assert terrario.elegir_zoom(grande, 200) < terrario.ZOOM_MAX


def test_tamano_pixel():
    assert abs(terrario.tamano_pixel_m(0, 14) - 156543.03392 / 2 ** 14) < 1e-6


def test_404_no_reintenta(monkeypatch):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(404)
    monkeypatch.setattr(terrario, "_cliente", _cliente(handler))
    with pytest.raises(terrario.ErrorTerrario, match="HTTP 404"):
        terrario._bajar(14, 0, 0)
    assert len(pedidos) == 1


def test_timeout_reintenta_y_falla(monkeypatch):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        raise httpx.ReadTimeout("lento", request=request)
    monkeypatch.setattr(terrario, "_cliente", _cliente(handler))
    with pytest.raises(terrario.ErrorTerrario, match="no respondió"):
        terrario._bajar(14, 0, 0)
    assert len(pedidos) == terrario.REINTENTOS + 1


def test_png_roto(monkeypatch):
    monkeypatch.setattr(terrario, "_cliente", _cliente(lambda r: httpx.Response(200, content=b"no es png")))
    with pytest.raises(terrario.ErrorTerrario, match="leer"):
        terrario._bajar(14, 0, 0)
