"""Elevación de respaldo: AWS Terrain Tiles (formato terrarium, incluye SRTM), sin login.

Se usa solo si NASADEM (Planetary Computer) falla. Arma el mosaico de las teselas que cubren
el bbox del lote (más un margen) y devuelve la elevación con el centro de cada píxel en
lon/lat, para que `elevacion.py` haga el mismo cálculo que con NASADEM.
Fórmulas del prototipo (`loadSlope`): elevación = R·256 + G + B/256 − 32768.
"""
from __future__ import annotations

import io
import math
from concurrent.futures import ThreadPoolExecutor

import httpx
import numpy as np
from PIL import Image

from app.satelite import red

URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TIMEOUT = 10.0
REINTENTOS = 1
TESELA = 256                  # píxeles por lado
ZOOM_MAX = 14                 # el del prototipo (~8 m en Córdoba; el dato de origen es SRTM ~30 m)
ZOOM_MIN = 10
MAX_TESELAS = 16              # si el lote necesita más, se baja el zoom (lotes grandes)
CIRCUNFERENCIA_M = 2 * math.pi * 6378137

_cliente = red.cliente(TIMEOUT)  # certificados del sistema + certifi (ver red.py)


class ErrorTerrario(Exception):
    """Falla al leer AWS Terrain Tiles. El mensaje va a "Información que falta"."""


def _x(lon: float, z: int) -> float:
    return (lon + 180) / 360 * TESELA * 2 ** z


def _y(lat: float, z: int) -> float:
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * TESELA * 2 ** z


def _lon(x: np.ndarray, z: int) -> np.ndarray:
    return x / (TESELA * 2 ** z) * 360 - 180


def _lat(y: np.ndarray, z: int) -> np.ndarray:
    return np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y / (TESELA * 2 ** z)))))


def tamano_pixel_m(lat: float, z: int) -> float:
    """Lado del píxel en metros (156543,03392 · cos(lat) / 2^z, como el prototipo)."""
    return CIRCUNFERENCIA_M / TESELA * math.cos(math.radians(lat)) / 2 ** z


def _rango(caja: list[float], margen_m: float, z: int) -> tuple[int, int, int, int]:
    """Píxeles globales [x0, x1) × [y0, y1) que cubren el bbox más el margen."""
    oeste, sur, este, norte = caja
    m = math.ceil(margen_m / tamano_pixel_m((sur + norte) / 2, z))
    return (math.floor(_x(oeste, z)) - m, math.ceil(_x(este, z)) + m,
            math.floor(_y(norte, z)) - m, math.ceil(_y(sur, z)) + m)


def _teselas(rango: tuple[int, int, int, int]) -> tuple[range, range]:
    x0, x1, y0, y1 = rango
    return range(x0 // TESELA, (x1 - 1) // TESELA + 1), range(y0 // TESELA, (y1 - 1) // TESELA + 1)


def elegir_zoom(caja: list[float], margen_m: float) -> int:
    """El zoom más alto (hasta ZOOM_MAX) que cubre el lote con MAX_TESELAS o menos."""
    for z in range(ZOOM_MAX, ZOOM_MIN - 1, -1):
        tx, ty = _teselas(_rango(caja, margen_m, z))
        if len(tx) * len(ty) <= MAX_TESELAS:
            return z
    return ZOOM_MIN


def _bajar(z: int, x: int, y: int) -> np.ndarray:
    url = URL.format(z=z, x=x, y=y)
    error = ""
    for _ in range(REINTENTOS + 1):
        try:
            r = _cliente.get(url)
        except httpx.TimeoutException:
            error = f"AWS Terrain Tiles no respondió en {TIMEOUT:.0f} s"
            continue
        except httpx.HTTPError as e:
            error = f"No se pudo conectar con AWS Terrain Tiles ({type(e).__name__})"
            continue
        if r.status_code != 200:
            error = f"AWS Terrain Tiles respondió con error HTTP {r.status_code}"
            if r.status_code < 500:
                break
            continue
        try:
            rgb = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=float)
        except (OSError, ValueError) as e:
            raise ErrorTerrario("No se pudo leer una tesela de AWS Terrain Tiles") from e
        if rgb.shape != (TESELA, TESELA, 3):
            raise ErrorTerrario(f"Tesela de AWS Terrain Tiles con forma inesperada {rgb.shape}")
        return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    raise ErrorTerrario(error)


def elevacion_bbox(caja: list[float], margen_m: float = 0.0, zoom: int | None = None
                   ) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """Elevación (m) que cubre `caja` [oeste, sur, este, norte] más `margen_m` alrededor.

    Devuelve (elevación [H, W], lons de las columnas [W], lats de las filas [H], zoom).
    Las filas van de norte a sur. Lanza ErrorTerrario si falla alguna tesela.
    """
    z = zoom if zoom is not None else elegir_zoom(caja, margen_m)
    rango = _rango(caja, margen_m, z)
    tx, ty = _teselas(rango)
    pedidos = [(x, y) for x in tx for y in ty]
    with ThreadPoolExecutor(max_workers=min(8, len(pedidos))) as ex:
        teselas = dict(zip(pedidos, ex.map(lambda p: _bajar(z, *p), pedidos)))
    mosaico = np.empty((len(ty) * TESELA, len(tx) * TESELA))
    for (x, y), el in teselas.items():
        i, j = (x - tx.start) * TESELA, (y - ty.start) * TESELA
        mosaico[j:j + TESELA, i:i + TESELA] = el
    x0, x1, y0, y1 = rango
    ox, oy = tx.start * TESELA, ty.start * TESELA
    elev = mosaico[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    lons = _lon(np.arange(x0, x1) + 0.5, z)
    lats = _lat(np.arange(y0, y1) + 0.5, z)
    return elev, lons, lats, z
