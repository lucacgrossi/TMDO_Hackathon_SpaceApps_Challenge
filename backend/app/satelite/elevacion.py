"""Pendiente del lote. Fuente: NASADEM en Planetary Computer (30 m); respaldo: AWS Terrain Tiles.

- Pendiente general: plano ajustado por mínimos cuadrados z = a·x + b·y + c sobre todos los
  píxeles dentro del polígono → hypot(a, b) · 100. Es robusto al ruido del modelo de
  elevación (misma lógica que `loadSlope`/`solve3` del prototipo).
- Pendiente máxima: pendiente por píxel sobre la elevación suavizada, percentil 95 dentro
  del lote. Es ruidosa: sirve como referencia y para la capa, no para el valor general.
- Si NASADEM falla o no tiene datos, se usa SRTM vía AWS Terrain Tiles (`terrario.py`), con el
  mismo cálculo y confianza "media". Si fallan los dos: None + motivo.
"""
from __future__ import annotations

import math
import sys
import time

import numpy as np

from app.satelite import pc, terrario
from app.satelite.lote import LOTE_EJEMPLO, bbox, centroide, mascara

COLECCION = "nasadem"
ASSET = "elevation"           # metros, int16 (verificado el 14/11 con item/feature.npy)
FUENTE = "NASADEM · NASA, vía Planetary Computer"
RESOLUCION = "30 m"
ANIOS = "2000 (misión SRTM, reprocesada en NASADEM)"
FUENTE_AWS = "SRTM vía AWS Terrain Tiles"
RESOLUCION_AWS = "~30 m"
ANIOS_AWS = "2000 (misión SRTM)"
UNIDAD = "%"

MIN_PIXELES = 9               # menos que esto (~1 ha a 30 m) no alcanza para ajustar un plano
LOTE_CHICO_HA = 5             # por debajo, el plano depende de pocos píxeles → confianza media
SIN_DATO_ELEV = -1000         # valores menores son relleno (fuera de la tesela)

# Pendiente por píxel: media en una ventana de ±RADIO_SUAVIZADO_M y diferencias centrales a
# ±PASO_M (~180 m de base). Con 1 m de cuantización vertical, el error por píxel queda en ~0,5 %.
# A 30 m (NASADEM) son 2 y 3 píxeles; con AWS se convierten según el zoom.
RADIO_SUAVIZADO_M = 60
PASO_M = 90
PERCENTIL_MAX = 95

M_POR_GRADO_LAT = 110_574
M_POR_GRADO_LON_ECUADOR = 111_320


def _sin_dato(motivo: str) -> dict:
    ind = {"valor": None, "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIOS,
           "resolucion": RESOLUCION, "confianza": "sin_dato", "motivo": motivo}
    return {"pendiente_general": dict(ind), "pendiente_maxima": dict(ind)}


def _suma_ventana(a: np.ndarray, r: int) -> np.ndarray:
    """Suma de cada ventana (2r+1)² con imagen integral; afuera de la grilla cuenta 0."""
    h, w = a.shape
    p = np.pad(a, ((r + 1, r), (r + 1, r)))
    c = p.cumsum(0).cumsum(1)
    n = 2 * r + 1
    return c[n:n + h, n:n + w] - c[:h, n:n + w] - c[n:n + h, :w] + c[:h, :w]


def pendiente_por_pixel(z: np.ndarray, valido: np.ndarray, px_x: float, px_y: float) -> np.ndarray:
    """Pendiente (%) por píxel; NaN donde no hay vecinos con dato. Base para la capa de erosión."""
    lado = (px_x + px_y) / 2                   # NASADEM no es cuadrado en metros (~26 × 31 m)
    r = max(1, round(RADIO_SUAVIZADO_M / lado))
    k = max(1, round(PASO_M / lado))
    h, w = z.shape
    out = np.full((h, w), np.nan)
    if h <= 2 * k or w <= 2 * k:
        return out
    suma = _suma_ventana(np.where(valido, z, 0.0).astype(float), r)
    cuenta = _suma_ventana(valido.astype(float), r)
    zs = np.divide(suma, cuenta, out=np.zeros((h, w)), where=cuenta > 0)
    ok = cuenta == (2 * r + 1) ** 2           # ventana completa con dato
    c = (slice(k, h - k), slice(k, w - k))
    dzx = (zs[k:h - k, 2 * k:] - zs[k:h - k, :w - 2 * k]) / (2 * k * px_x)
    dzy = (zs[2 * k:, k:w - k] - zs[:h - 2 * k, k:w - k]) / (2 * k * px_y)
    vecinos_ok = (ok[c] & ok[k:h - k, 2 * k:] & ok[k:h - k, :w - 2 * k]
                  & ok[2 * k:, k:w - k] & ok[:h - 2 * k, k:w - k])
    out[c] = np.where(vecinos_ok, np.hypot(dzx, dzy) * 100, np.nan)
    return out


def _puntos_y_pendientes(z: np.ndarray, adentro: np.ndarray, lons: np.ndarray, lats: np.ndarray,
                         lat0: float, lon0: float) -> tuple[np.ndarray, np.ndarray]:
    """Puntos (x, y, z) en metros locales de los píxeles dentro del lote, y su pendiente por píxel.

    lons/lats: centros de las columnas (oeste → este) y de las filas (norte → sur).
    """
    h, w = z.shape
    m_lon = M_POR_GRADO_LON_ECUADOR * math.cos(math.radians(lat0))
    x = (lons[None, :] - lon0) * m_lon
    y = (lats[:, None] - lat0) * M_POR_GRADO_LAT
    valido = z > SIN_DATO_ELEV
    sel = adentro & valido
    xx, yy = np.broadcast_to(x, (h, w))[sel], np.broadcast_to(y, (h, w))[sel]
    puntos = np.column_stack([xx, yy, z[sel].astype(float)])
    px_x = abs(float(np.mean(np.diff(lons)))) * m_lon if w > 1 else 30.0
    px_y = abs(float(np.mean(np.diff(lats)))) * M_POR_GRADO_LAT if h > 1 else 30.0
    pend = pendiente_por_pixel(z, valido, px_x, px_y)[sel]
    return puntos, pend


def _plano(puntos: np.ndarray) -> float:
    """Pendiente (%) del plano z = a·x + b·y + c ajustado por mínimos cuadrados."""
    A = np.column_stack([puntos[:, 0], puntos[:, 1], np.ones(len(puntos))])
    (a, b, _), *_ = np.linalg.lstsq(A, puntos[:, 2], rcond=None)
    return math.hypot(a, b) * 100


def _desde_nasadem(poligono: dict, lat0: float, lon0: float) -> tuple[np.ndarray, np.ndarray]:
    """Puntos y pendientes por píxel con NASADEM. Lanza pc.ErrorPC o ValueError si no hay dato."""
    items = pc.buscar(COLECCION, poligono, limite=10)
    if not items:
        raise ValueError("sin datos de elevación para el lote")
    todos_puntos, todas_pend = [], []
    for item in items:  # más de uno solo si el lote cruza el borde de una tesela de 1°
        z, adentro, (oeste, sur, este, norte) = pc.array_poligono(COLECCION, item["id"], poligono, ASSET)
        h, w = z.shape
        lons = oeste + (np.arange(w) + 0.5) * (este - oeste) / w
        lats = norte - (np.arange(h) + 0.5) * (norte - sur) / h
        puntos, pend = _puntos_y_pendientes(z, adentro, lons, lats, lat0, lon0)
        todos_puntos.append(puntos)
        todas_pend.append(pend)
    puntos = np.concatenate(todos_puntos)
    if len(items) > 1:  # las teselas vecinas comparten la fila/columna del borde
        _, unicos = np.unique(np.round(puntos[:, :2]), axis=0, return_index=True)
        puntos = puntos[np.sort(unicos)]
    return puntos, np.concatenate(todas_pend)


def _desde_aws(poligono: dict, lat0: float, lon0: float) -> tuple[np.ndarray, np.ndarray, int]:
    """Puntos y pendientes por píxel con AWS Terrain Tiles. Lanza terrario.ErrorTerrario."""
    caja = bbox(poligono)
    margen = RADIO_SUAVIZADO_M + PASO_M + 30   # para que los bordes del lote tengan vecinos
    z, lons, lats, zoom = terrario.elevacion_bbox(caja, margen)
    adentro = mascara(poligono, lons, lats)
    puntos, pend = _puntos_y_pendientes(z, adentro, lons, lats, lat0, lon0)
    return puntos, pend, zoom


def _resultado(puntos: np.ndarray, pend: np.ndarray, fuente: str, resolucion: str, anios: str,
               confianza: str, nota_fuente: str) -> dict:
    general = _plano(puntos)
    n = len(puntos)
    base = {"unidad": UNIDAD, "fuente": fuente, "anios": anios, "resolucion": resolucion}
    r_general = {"valor": round(general, 1), **base, "confianza": confianza,
                 "nota": f"Plano ajustado sobre {n} píxeles del lote{nota_fuente}"}
    pend = pend[~np.isnan(pend)]
    if len(pend):
        r_maxima = {"valor": round(float(np.percentile(pend, PERCENTIL_MAX)), 1), **base,
                    "confianza": "media",
                    "nota": f"Percentil {PERCENTIL_MAX} de la pendiente por píxel ({len(pend)} píxeles); "
                            f"valor por píxel, ruidoso{nota_fuente}"}
    else:
        r_maxima = {"valor": None, **base, "confianza": "sin_dato",
                    "motivo": "El lote es muy chico para calcular la pendiente por píxel"}
    return {"pendiente_general": r_general, "pendiente_maxima": r_maxima}


def calcular(poligono: dict) -> dict:
    """poligono: GeoJSON Polygon en [lon, lat]. Devuelve pendiente_general y pendiente_maxima."""
    try:
        lat0, lon0 = centroide(poligono)
    except Exception as e:  # noqa: BLE001 — nunca propagar
        return _sin_dato(f"No se pudo leer el polígono del lote ({type(e).__name__})")

    # 1) NASADEM en Planetary Computer
    try:
        puntos, pend = _desde_nasadem(poligono, lat0, lon0)
        if len(puntos) < MIN_PIXELES:
            raise ValueError(f"muy pocos píxeles dentro del lote ({len(puntos)})")
        chico = len(puntos) < LOTE_CHICO_HA * 10_000 / 900   # píxeles de 30 m en 5 ha
        nota = " (lote chico: pocos píxeles)" if chico else ""
        return _resultado(puntos, pend, FUENTE, RESOLUCION, ANIOS, "media" if chico else "alta", nota)
    except pc.ErrorPC as e:
        motivo_nasadem = str(e)
    except ValueError as e:
        motivo_nasadem = str(e)
    except Exception as e:  # noqa: BLE001
        motivo_nasadem = f"error inesperado ({type(e).__name__})"

    # 2) Respaldo: SRTM vía AWS Terrain Tiles
    try:
        puntos, pend, zoom = _desde_aws(poligono, lat0, lon0)
        if len(puntos) < MIN_PIXELES:
            raise ValueError(f"muy pocos píxeles dentro del lote ({len(puntos)})")
        px = terrario.tamano_pixel_m(lat0, zoom)
        nota = f". Respaldo porque NASADEM falló ({motivo_nasadem}); teselas zoom {zoom}, píxel de {px:.0f} m"
        return _resultado(puntos, pend, FUENTE_AWS, RESOLUCION_AWS, ANIOS_AWS, "media", nota)
    except terrario.ErrorTerrario as e:
        motivo_aws = str(e)
    except Exception as e:  # noqa: BLE001
        motivo_aws = f"AWS Terrain Tiles: error inesperado ({type(e).__name__})"

    return _sin_dato(f"No se pudo calcular la pendiente. NASADEM: {motivo_nasadem}. "
                     f"Respaldo: {motivo_aws}")


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t = time.perf_counter()
    resultado = calcular(poligono)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t:.1f} s")
