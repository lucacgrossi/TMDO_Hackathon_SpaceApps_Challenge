import io

import httpx
import numpy as np
import pytest

from app.satelite import pc
from app.satelite.lote import LOTE_EJEMPLO


def _cliente(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), timeout=pc.TIMEOUT)


def _npy(arr):
    b = io.BytesIO()
    np.save(b, arr)
    return b.getvalue()


def test_timeout_es_error_pc(monkeypatch):
    intentos = []

    def handler(request):
        intentos.append(request)
        raise httpx.ReadTimeout("lento", request=request)
    monkeypatch.setattr(pc, "_cliente", _cliente(handler))
    with pytest.raises(pc.ErrorPC, match="no respondió"):
        pc.buscar("nasadem", LOTE_EJEMPLO)
    assert len(intentos) == pc.REINTENTOS + 1


def test_http_500_es_error_pc(monkeypatch):
    monkeypatch.setattr(pc, "_cliente", _cliente(lambda r: httpx.Response(500)))
    with pytest.raises(pc.ErrorPC, match="HTTP 500"):
        pc.estadisticas("nasadem", "x", LOTE_EJEMPLO, assets="elevation")


def test_reintenta_una_vez_y_sigue(monkeypatch):
    respuestas = iter([httpx.Response(503), httpx.Response(200, json={"features": [{"id": "a"}]})])
    monkeypatch.setattr(pc, "_cliente", _cliente(lambda r: next(respuestas)))
    assert pc.buscar("nasadem", LOTE_EJEMPLO) == [{"id": "a"}]


def test_http_4xx_no_reintenta(monkeypatch):
    intentos = []

    def handler(request):
        intentos.append(request)
        return httpx.Response(404)
    monkeypatch.setattr(pc, "_cliente", _cliente(handler))
    with pytest.raises(pc.ErrorPC, match="HTTP 404"):
        pc.buscar("nasadem", LOTE_EJEMPLO)
    assert len(intentos) == 1


def test_json_inesperado_es_error_pc(monkeypatch):
    monkeypatch.setattr(pc, "_cliente", _cliente(lambda r: httpx.Response(200, json={"hola": 1})))
    with pytest.raises(pc.ErrorPC, match="inesperada"):
        pc.buscar("nasadem", LOTE_EJEMPLO)


def test_npy_con_forma_inesperada_es_error_pc(monkeypatch):
    monkeypatch.setattr(pc, "_cliente", _cliente(lambda r: httpx.Response(200, content=_npy(np.zeros((3, 4))))))
    with pytest.raises(pc.ErrorPC, match="forma inesperada"):
        pc.array_poligono("nasadem", "x", LOTE_EJEMPLO, "elevation")


def test_npy_basura_es_error_pc(monkeypatch):
    monkeypatch.setattr(pc, "_cliente", _cliente(lambda r: httpx.Response(200, content=b"no es npy")))
    with pytest.raises(pc.ErrorPC):
        pc.array_poligono("nasadem", "x", LOTE_EJEMPLO, "elevation")


def test_array_poligono_separa_valores_y_mascara(monkeypatch):
    arr = np.stack([np.full((2, 3), 360, dtype=np.int16),
                    np.array([[255, 0, 255], [0, 255, 0]], dtype=np.int16)])
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, content=_npy(arr))
    monkeypatch.setattr(pc, "_cliente", _cliente(handler))
    z, adentro, caja = pc.array_poligono("nasadem", "item1", LOTE_EJEMPLO, "elevation")
    assert z.shape == (2, 3) and adentro.sum() == 3 and adentro.dtype == bool
    assert caja == [-64.2381, -33.2517, -64.2268, -33.2436]
    assert pedidos[0].url.path.endswith("/item/feature.npy")
    assert pedidos[0].url.params["item"] == "item1"
