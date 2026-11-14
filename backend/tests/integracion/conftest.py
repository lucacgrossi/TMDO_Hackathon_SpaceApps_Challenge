"""Integración del back: código real de punta a punta, con la red simulada en la capa HTTP.

A diferencia de `tests/api/` (que reemplaza cada fuente por un dict), acá corren de verdad
`api/rutas.py` → `servicio.py` → `clima/` + `satelite/` + `mediciones/` + `motor/`. Lo único
falso es la red: NASA POWER, Planetary Computer y AWS Terrain responden con respuestas reales
guardadas del lote de ejemplo (las mismas fixtures que usan los tests de cada dominio).

`RED` cuenta los pedidos por servicio, para verificar quién habló con quién.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clima import power
from app.main import app
from app.satelite import ndvi, pc, terrario

TESTS = Path(__file__).parents[1]
FIX_SAT = TESTS / "satelite" / "fixtures"
FIX_POWER = TESTS / "clima" / "fixtures" / "power_rio_cuarto.json"
ENTRADA_DEMO = TESTS / "ejemplos" / "entrada_demo.json"

RED: Counter = Counter()


def _leer(nombre: str):
    return json.loads((FIX_SAT / nombre).read_text(encoding="utf-8"))


BUSQUEDAS = {
    "nasadem": "nasadem_busqueda.json",
    "esa-worldcover": "worldcover_busqueda.json",
    "hls2-s30": "ndvi_hls_s30_busqueda.json",
    "hls2-l30": "ndvi_hls_l30_busqueda.json",
    "modis-13Q1-061": "ndvi_modis_busqueda.json",
    "modis-16A3GF-061": "et_busqueda.json",
}


def planetary_computer(estado: dict):
    """Planetary Computer falso con las respuestas reales del lote de ejemplo.

    estado["caido"] = True → todo responde 503 (simula la caída del servicio).
    """

    def responder(request: httpx.Request) -> httpx.Response:
        if estado.get("caido"):
            RED["pc_caido"] += 1
            return httpx.Response(503)
        ruta, p = request.url.path, request.url.params
        if ruta.endswith("/stac/v1/search"):
            cuerpo = json.loads(request.content)
            coleccion = cuerpo["collections"][0]
            RED[f"pc_busqueda:{coleccion}"] += 1
            if coleccion not in BUSQUEDAS:
                return httpx.Response(200, json={"features": []})
            items = _leer(BUSQUEDAS[coleccion])
            if coleccion.startswith("hls2-") and cuerpo.get("datetime"):
                # Como el STAC real: la escena cae dentro del mes pedido (se conserva el día).
                mes = cuerpo["datetime"][:7]
                for it in items:
                    for k in ("datetime", "start_datetime", "end_datetime"):
                        if it["properties"].get(k):
                            it["properties"][k] = mes + it["properties"][k][7:]
            return httpx.Response(200, json={"features": items})
        if ruta.endswith("/item/statistics"):
            coleccion = p.get("collection", "")
            RED[f"pc_estadisticas:{coleccion}"] += 1
            if coleccion == "esa-worldcover":
                return httpx.Response(200, json=_leer("worldcover_stats.json"))
            if coleccion.startswith("hls2-"):
                return httpx.Response(200, json=_leer("ndvi_hls_stats.json"))
            if p.get("assets") == ndvi.MODIS_FIABILIDAD:
                return httpx.Response(200, json=_leer("ndvi_modis_fiabilidad.json"))
            if p.get("assets") == ndvi.MODIS_ASSET:
                return httpx.Response(200, json=_leer("ndvi_modis_stats.json"))
        if ruta.endswith("/item/feature.npy"):
            coleccion, item = p.get("collection", ""), p.get("item", "")
            RED[f"pc_recorte:{coleccion}"] += 1
            if coleccion == "nasadem":
                return httpx.Response(200, content=(FIX_SAT / "nasadem_lote_demo.npy").read_bytes())
            if item.startswith(("MOD16A3GF.A2025", "MYD16A3GF.A2025")):
                return httpx.Response(200, content=(FIX_SAT / f"et_{item[:3].lower()}_2025.npy").read_bytes())
        RED["pc_404"] += 1
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(responder))


def aws_terrain(request: httpx.Request) -> httpx.Response:
    RED["aws_terrain"] += 1
    if request.url.path.endswith("/terrarium/12/1317/2449.png"):
        return httpx.Response(200, content=(FIX_SAT / "terrario_12_1317_2449.png").read_bytes())
    return httpx.Response(404)


@pytest.fixture
def red_nasa(monkeypatch):
    """Simula la red de NASA POWER, Planetary Computer y AWS. Devuelve el estado para tirarlas."""
    RED.clear()
    power._cache.clear()
    estado = {"pc": {}, "power_caido": False}
    datos_power = json.loads(FIX_POWER.read_text(encoding="utf-8"))

    def power_get(url, params=None, **kwargs):
        RED["nasa_power"] += 1
        pedido = httpx.Request("GET", url, params=params)
        if estado["power_caido"]:
            raise httpx.ConnectError("sin red (simulado)", request=pedido)
        return httpx.Response(200, json=datos_power, request=pedido)

    monkeypatch.setattr(power.httpx, "get", power_get)
    monkeypatch.setattr(pc, "_cliente", planetary_computer(estado["pc"]))
    monkeypatch.setattr(terrario, "_cliente", httpx.Client(transport=httpx.MockTransport(aws_terrain)))
    monkeypatch.setattr(terrario, "ZOOM_MAX", 12)  # con zoom 12 el lote entra en la tesela guardada
    yield estado
    power._cache.clear()


@pytest.fixture
def cliente(red_nasa):
    """Cliente HTTP de la API real (TestClient usa un socketpair local, no sale a internet)."""
    return TestClient(app)


@pytest.fixture
def entrada_demo() -> dict:
    return json.loads(ENTRADA_DEMO.read_text(encoding="utf-8"))
