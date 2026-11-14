"""Cliente de Microsoft Planetary Computer (STAC + API de datos), sin login.

Todo pedido a Planetary Computer de los módulos de `satelite/` pasa por acá.
Cualquier falla (red, timeout, HTTP, respuesta inesperada) sale como `ErrorPC`,
con un mensaje en español. Los módulos la atrapan y devuelven `valor: None` + motivo.
"""
from __future__ import annotations

import io

import httpx
import numpy as np

BASE = "https://planetarycomputer.microsoft.com/api"
URL_BUSQUEDA = f"{BASE}/stac/v1/search"
URL_DATOS = f"{BASE}/data/v1"
TIMEOUT = 10.0  # segundos por pedido (PLAN.md §3: /analizar en menos de 30 s)

# Un solo cliente para todo el proceso: reusa conexiones y es seguro entre hilos.
_cliente = httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "field-shift-backend"})


class ErrorPC(Exception):
    """Falla al consultar Planetary Computer. El mensaje va a "Información que falta"."""


def _feature(poligono: dict) -> dict:
    return {"type": "Feature", "properties": {}, "geometry": poligono}


def _pedir(metodo: str, url: str, **kwargs) -> httpx.Response:
    try:
        r = _cliente.request(metodo, url, **kwargs)
    except httpx.TimeoutException as e:
        raise ErrorPC(f"Planetary Computer no respondió en {TIMEOUT:.0f} s") from e
    except httpx.HTTPError as e:
        raise ErrorPC(f"No se pudo conectar con Planetary Computer ({type(e).__name__})") from e
    if r.status_code != 200:
        raise ErrorPC(f"Planetary Computer respondió con error HTTP {r.status_code}")
    return r


def buscar(coleccion: str, poligono: dict, fechas: str | None = None, limite: int = 50,
           filtro: dict | None = None, orden: list[dict] | None = None) -> list[dict]:
    """Items STAC de `coleccion` que tocan el polígono.

    fechas: intervalo "AAAA-MM-DD/AAAA-MM-DD". filtro: CQL2-JSON (por ejemplo, nubes < 30 %).
    orden: [{"field": "eo:cloud_cover", "direction": "asc"}].
    """
    cuerpo: dict = {"collections": [coleccion], "intersects": poligono, "limit": limite}
    if fechas:
        cuerpo["datetime"] = fechas
    if filtro:
        cuerpo["filter"] = filtro
        cuerpo["filter-lang"] = "cql2-json"
    if orden:
        cuerpo["sortby"] = orden
    r = _pedir("POST", URL_BUSQUEDA, json=cuerpo)
    try:
        return list(r.json()["features"])
    except (ValueError, KeyError, TypeError) as e:
        raise ErrorPC(f"Respuesta inesperada de la búsqueda en {coleccion}") from e


def estadisticas(coleccion: str, item: str, poligono: dict, assets: str | None = None,
                 expresion: str | None = None) -> dict:
    """Estadísticas (mean, min, max, count, …) del asset o la expresión sobre el polígono.

    Devuelve el dict de la primera banda, tal como lo arma la API de datos.
    """
    params: dict = {"collection": coleccion, "item": item}
    if expresion:
        params["expression"] = expresion
        params["asset_as_band"] = "true"
    elif assets:
        params["assets"] = assets
    r = _pedir("POST", f"{URL_DATOS}/item/statistics", params=params, json=_feature(poligono))
    try:
        bandas = r.json()["properties"]["statistics"]
        return next(iter(bandas.values()))
    except (ValueError, KeyError, TypeError, StopIteration) as e:
        raise ErrorPC(f"Respuesta inesperada de las estadísticas de {coleccion}") from e


def array_poligono(coleccion: str, item: str, poligono: dict, asset: str
                   ) -> tuple[np.ndarray, np.ndarray, list[float]]:
    """Valores del asset recortados al polígono, a la resolución nativa.

    Devuelve (valores [H, W], adentro [H, W] bool, bbox [oeste, sur, este, norte]).
    La grilla cubre el bbox del polígono; `adentro` es la máscara que calcula el servidor
    (solo píxeles dentro del polígono y con dato).
    """
    params = {"collection": coleccion, "item": item, "assets": asset}
    r = _pedir("POST", f"{URL_DATOS}/item/feature.npy", params=params, json=_feature(poligono))
    try:
        arr = np.load(io.BytesIO(r.content), allow_pickle=False)
    except (ValueError, OSError) as e:
        raise ErrorPC(f"No se pudo leer el recorte de {coleccion}") from e
    if arr.ndim != 3 or arr.shape[0] != 2 or arr.shape[1] < 1 or arr.shape[2] < 1:
        raise ErrorPC(f"Recorte de {coleccion} con forma inesperada {arr.shape}")
    xs = [p[0] for p in poligono["coordinates"][0]]
    ys = [p[1] for p in poligono["coordinates"][0]]
    return arr[0], arr[1] > 0, [min(xs), min(ys), max(xs), max(ys)]
