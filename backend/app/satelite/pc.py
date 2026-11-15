"""Cliente de Microsoft Planetary Computer (STAC + API de datos), sin login.

Todo pedido a Planetary Computer de los módulos de `satelite/` pasa por acá.
Cualquier falla (red, timeout, HTTP, respuesta inesperada) sale como `ErrorPC`,
con un mensaje en lenguaje del productor y sin códigos HTTP (va a "Información que falta").
Los módulos la atrapan y devuelven `valor: None` + motivo.

Reporte QA del 15/11 (H-013): Planetary Computer responde 429 cuando se le pide mucho seguido y
el mismo lote daba resultados distintos según qué pedido fallaba. Por eso:
- 429 → un reintento después de una espera corta (la que pide `Retry-After`, hasta `ESPERA_MAX_429`);
- cada respuesta 200 se guarda en memoria (`_cache`, por método + URL + parámetros + cuerpo, que
  incluye el polígono) durante `CACHE_TTL_S`: el mismo lote no vuelve a pedir lo que ya tiene.
  Las fallas no se guardan, así un análisis repetido completa lo que faltó.
"""
from __future__ import annotations

import io
import json
import threading
import time
from collections import OrderedDict

import httpx
import numpy as np

from app.satelite import red

BASE = "https://planetarycomputer.microsoft.com/api"
URL_BUSQUEDA = f"{BASE}/stac/v1/search"
URL_DATOS = f"{BASE}/data/v1"
TIMEOUT = 10.0  # segundos por pedido (PLAN.md §3: /analizar en menos de 30 s)
# Un reintento ante timeout, falla de red, HTTP 5xx o 429: el 14/11 vimos timeouts sueltos que al
# reintentar respondían en ~1 s. Los pedidos son lecturas, así que repetirlos es seguro.
REINTENTOS = 1
ESPERA_429_S = 1.0     # espera antes de reintentar un 429 si no viene `Retry-After`
ESPERA_MAX_429 = 2.0   # tope de la espera: /analizar tiene 25 s para todo

# Caché de respuestas 200 en memoria (por proceso). Los tests la apagan (tests/conftest.py).
CACHE_ACTIVA = True
CACHE_TTL_S = 6 * 3600
CACHE_MAX_BYTES = 64 * 1024 * 1024
CACHE_MAX_RESPUESTA = 8 * 1024 * 1024   # una respuesta más grande no se guarda

SERVICIO = "el servicio de imágenes satelitales (Planetary Computer)"
MENSAJE_SATURADO = f"{SERVICIO} está saturado; probá de nuevo en un minuto"
MENSAJE_SIN_RESPUESTA = f"{SERVICIO} no respondió a tiempo; probá de nuevo en un minuto"
MENSAJE_CAIDO = f"{SERVICIO} no responde; probá de nuevo en un minuto"
MENSAJE_RECHAZO = f"{SERVICIO} no devolvió el dato pedido para el lote"

# Un solo cliente para todo el proceso: reusa conexiones y es seguro entre hilos.
_cliente = red.cliente(TIMEOUT)  # certificados del sistema + certifi (ver red.py)

_cache: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
_cache_bytes = 0
_cache_lock = threading.Lock()


class ErrorPC(Exception):
    """Falla al consultar Planetary Computer. El mensaje va a "Información que falta"."""


def limpiar_cache() -> None:
    """Vacía la caché de respuestas (la usan los tests)."""
    global _cache_bytes
    with _cache_lock:
        _cache.clear()
        _cache_bytes = 0


def _clave(metodo: str, url: str, params: dict | None, cuerpo: dict | None) -> str:
    return json.dumps([metodo, url, sorted((params or {}).items()), cuerpo], sort_keys=True, default=str)


def _de_cache(clave: str) -> bytes | None:
    global _cache_bytes
    if not CACHE_ACTIVA:
        return None
    with _cache_lock:
        guardado = _cache.get(clave)
        if guardado is None:
            return None
        hora, contenido = guardado
        if time.monotonic() - hora > CACHE_TTL_S:
            del _cache[clave]
            _cache_bytes -= len(contenido)
            return None
        _cache.move_to_end(clave)
        return contenido


def _a_cache(clave: str, contenido: bytes) -> None:
    global _cache_bytes
    if not CACHE_ACTIVA or len(contenido) > CACHE_MAX_RESPUESTA:
        return
    with _cache_lock:
        anterior = _cache.pop(clave, None)
        if anterior:
            _cache_bytes -= len(anterior[1])
        _cache[clave] = (time.monotonic(), contenido)
        _cache_bytes += len(contenido)
        while _cache_bytes > CACHE_MAX_BYTES and _cache:
            _, (_, viejo) = _cache.popitem(last=False)
            _cache_bytes -= len(viejo)


def _espera_429(r: httpx.Response) -> float:
    try:
        pedida = float(r.headers.get("Retry-After", ESPERA_429_S))
    except ValueError:  # Retry-After con fecha HTTP: se usa la espera por defecto
        pedida = ESPERA_429_S
    return max(0.0, min(pedida, ESPERA_MAX_429))


def _feature(poligono: dict) -> dict:
    return {"type": "Feature", "properties": {}, "geometry": poligono}


def _pedir(metodo: str, url: str, **kwargs) -> httpx.Response:
    clave = _clave(metodo, url, kwargs.get("params"), kwargs.get("json"))
    guardado = _de_cache(clave)
    if guardado is not None:
        return httpx.Response(200, content=guardado)
    error: ErrorPC | None = None
    for intento in range(REINTENTOS + 1):
        try:
            r = _cliente.request(metodo, url, **kwargs)
        except httpx.TimeoutException as e:
            error = ErrorPC(MENSAJE_SIN_RESPUESTA)
            error.__cause__ = e
            continue
        except httpx.HTTPError as e:
            error = ErrorPC(MENSAJE_CAIDO)
            error.__cause__ = e
            continue
        if r.status_code == 200:
            _a_cache(clave, r.content)
            return r
        if r.status_code == 429:  # saturado: se espera un poco y se reintenta
            error = ErrorPC(MENSAJE_SATURADO)
            if intento < REINTENTOS:
                time.sleep(_espera_429(r))
            continue
        if r.status_code >= 500:
            error = ErrorPC(MENSAJE_CAIDO)
            continue
        error = ErrorPC(MENSAJE_RECHAZO)  # otro 4xx: el pedido está mal, reintentar no cambia nada
        break
    raise error


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
                 expresion: str | None = None, categorico: bool = False) -> dict:
    """Estadísticas (mean, min, max, count, …) del asset o la expresión sobre el polígono.

    Devuelve el dict de la primera banda, tal como lo arma la API de datos.
    categorico=True: `histogram` = [[cantidad de píxeles…], [clase…]] (para mapas de clases).
    """
    params: dict = {"collection": coleccion, "item": item}
    if expresion:
        params["expression"] = expresion
        params["asset_as_band"] = "true"
    elif assets:
        params["assets"] = assets
    if categorico:
        params["categorical"] = "true"
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


def raster_en_grilla(coleccion: str, item: str, grilla, assets: str | None = None,
                     expresion: str | None = None, resampling: str | None = None) -> np.ndarray:
    """Valores del asset (o de la expresión) sobre la grilla común del lote (`grilla.Grilla`).

    Devuelve un array float [alto, ancho] con NaN donde la fuente no tiene dato (fuera de la
    tesela o enmascarado), con fila 0 = norte y columna 0 = oeste. No aplica la máscara del lote.
    Usa `item/bbox/{bbox}/{W}x{H}.npy` con `dst_crs=epsg:4326`: anda para NASADEM, HLS, WorldCover
    y MODIS (con `item/crop`, HLS da 404). El `.npy` trae las bandas y, al final, la máscara (0 = sin dato).
    resampling: `nearest`, `bilinear`, `mode`, … (el del servidor de teselas).
    """
    oeste, sur, este, norte = grilla.bbox
    params: dict = {"collection": coleccion, "item": item, "dst_crs": "epsg:4326"}
    if expresion:
        params["expression"] = expresion
        params["asset_as_band"] = "true"
    elif assets:
        params["assets"] = assets
    if resampling:
        params["resampling"] = resampling
    url = f"{URL_DATOS}/item/bbox/{oeste!r},{sur!r},{este!r},{norte!r}/{grilla.ancho}x{grilla.alto}.npy"
    r = _pedir("GET", url, params=params)
    try:
        arr = np.load(io.BytesIO(r.content), allow_pickle=False)
    except (ValueError, OSError) as e:
        raise ErrorPC(f"No se pudo leer el raster de {coleccion}") from e
    if arr.ndim != 3 or arr.shape[0] < 2 or arr.shape[1:] != (grilla.alto, grilla.ancho):
        raise ErrorPC(f"Raster de {coleccion} con forma inesperada {arr.shape} "
                      f"(se esperaba la grilla {grilla.alto} × {grilla.ancho})")
    valores = arr[0].astype(float)
    valores[(arr[-1] == 0) | ~np.isfinite(valores)] = np.nan
    return valores
