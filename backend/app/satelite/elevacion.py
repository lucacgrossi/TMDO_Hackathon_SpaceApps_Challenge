"""Pendiente del lote. Fuente: NASADEM en Planetary Computer (30 m).

- Pendiente general: plano ajustado por mínimos cuadrados z = a·x + b·y + c sobre todos los
  píxeles dentro del polígono → hypot(a, b) · 100. Es robusto al ruido del modelo de
  elevación (misma lógica que `loadSlope`/`solve3` del prototipo).
- Pendiente máxima: pendiente por píxel sobre la elevación suavizada, percentil 95 dentro
  del lote. Es ruidosa: sirve como referencia y para la capa, no para el valor general.
"""
from __future__ import annotations

import math
import sys
import time

import numpy as np

from app.satelite import pc
from app.satelite.lote import LOTE_EJEMPLO, centroide

COLECCION = "nasadem"
ASSET = "elevation"           # metros, int16 (verificado el 14/11 con item/feature.npy)
FUENTE = "NASADEM · NASA, vía Planetary Computer"
RESOLUCION = "30 m"
ANIOS = "2000 (misión SRTM, reprocesada en NASADEM)"
UNIDAD = "%"

MIN_PIXELES = 9               # menos que esto (~1 ha) no alcanza para ajustar un plano
PIXELES_CONFIANZA_ALTA = 60   # ~5 ha: por debajo, el plano depende de pocos píxeles
SIN_DATO_ELEV = -1000         # valores menores son relleno (fuera de la tesela)

# Pendiente por píxel: suavizado de (2·R+1)² píxeles y diferencias centrales a ±PASO píxeles
# (~180 m de base). Con 1 m de cuantización vertical, el error por píxel queda en ~0,5 %.
RADIO_SUAVIZADO = 2
PASO = 3
PERCENTIL_MAX = 95

M_POR_GRADO_LAT = 110_574
M_POR_GRADO_LON_ECUADOR = 111_320


def _sin_dato(motivo: str) -> dict:
    return {"valor": None, "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIOS,
            "resolucion": RESOLUCION, "confianza": "sin_dato", "motivo": motivo}


def _indicador(valor: float, confianza: str, nota: str) -> dict:
    return {"valor": round(valor, 1), "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIOS,
            "resolucion": RESOLUCION, "confianza": confianza, "nota": nota}


def _suavizar(z: np.ndarray, valido: np.ndarray, r: int) -> tuple[np.ndarray, np.ndarray]:
    """Media de una ventana (2r+1)² que solo cuenta píxeles válidos.

    Devuelve (z suavizado, válido), donde válido exige la ventana completa con dato.
    """
    h, w = z.shape
    zp = np.pad(np.where(valido, z, 0.0), r)
    vp = np.pad(valido.astype(float), r)
    suma = np.zeros((h, w))
    cuenta = np.zeros((h, w))
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            suma += zp[dy:dy + h, dx:dx + w]
            cuenta += vp[dy:dy + h, dx:dx + w]
    completo = cuenta == (2 * r + 1) ** 2
    return np.divide(suma, cuenta, out=np.zeros((h, w)), where=cuenta > 0), completo


def pendiente_por_pixel(z: np.ndarray, valido: np.ndarray, px_x: float, px_y: float) -> np.ndarray:
    """Pendiente (%) por píxel; NaN donde no hay vecinos con dato. Base para la capa de erosión."""
    zs, ok = _suavizar(z.astype(float), valido, RADIO_SUAVIZADO)
    h, w = z.shape
    out = np.full((h, w), np.nan)
    k = PASO
    if h <= 2 * k or w <= 2 * k:
        return out
    c = (slice(k, h - k), slice(k, w - k))
    dzx = (zs[k:h - k, 2 * k:] - zs[k:h - k, :w - 2 * k]) / (2 * k * px_x)
    dzy = (zs[2 * k:, k:w - k] - zs[:h - 2 * k, k:w - k]) / (2 * k * px_y)
    vecinos_ok = ok[c] & ok[k:h - k, 2 * k:] & ok[k:h - k, :w - 2 * k] & ok[2 * k:, k:w - k] & ok[:h - 2 * k, k:w - k]
    out[c] = np.where(vecinos_ok, np.hypot(dzx, dzy) * 100, np.nan)
    return out


def _puntos_y_pendientes(z: np.ndarray, adentro: np.ndarray, caja: list[float], lat0: float, lon0: float
                         ) -> tuple[np.ndarray, np.ndarray]:
    """Puntos (x, y, z) en metros locales de los píxeles dentro del lote, y su pendiente por píxel."""
    h, w = z.shape
    oeste, sur, este, norte = caja
    dlon, dlat = (este - oeste) / w, (norte - sur) / h
    m_lon = M_POR_GRADO_LON_ECUADOR * math.cos(math.radians(lat0))
    lons = oeste + (np.arange(w) + 0.5) * dlon       # columnas de oeste a este
    lats = norte - (np.arange(h) + 0.5) * dlat       # filas de norte a sur
    x = (lons[None, :] - lon0) * m_lon
    y = (lats[:, None] - lat0) * M_POR_GRADO_LAT
    valido = z > SIN_DATO_ELEV
    sel = adentro & valido
    xx, yy = np.broadcast_to(x, (h, w))[sel], np.broadcast_to(y, (h, w))[sel]
    puntos = np.column_stack([xx, yy, z[sel].astype(float)])
    pend = pendiente_por_pixel(z, valido, dlon * m_lon, dlat * M_POR_GRADO_LAT)[sel]
    return puntos, pend


def _plano(puntos: np.ndarray) -> float:
    """Pendiente (%) del plano z = a·x + b·y + c ajustado por mínimos cuadrados."""
    A = np.column_stack([puntos[:, 0], puntos[:, 1], np.ones(len(puntos))])
    (a, b, _), *_ = np.linalg.lstsq(A, puntos[:, 2], rcond=None)
    return math.hypot(a, b) * 100


def calcular(poligono: dict) -> dict:
    """poligono: GeoJSON Polygon en [lon, lat]. Devuelve pendiente_general y pendiente_maxima."""
    try:
        items = pc.buscar(COLECCION, poligono, limite=10)
        if not items:
            motivo = "NASADEM no tiene datos de elevación para el lote"
            return {"pendiente_general": _sin_dato(motivo), "pendiente_maxima": _sin_dato(motivo)}
        lat0, lon0 = centroide(poligono)
        todos_puntos, todas_pend = [], []
        for item in items:  # más de uno solo si el lote cruza el borde de una tesela de 1°
            z, adentro, caja = pc.array_poligono(COLECCION, item["id"], poligono, ASSET)
            puntos, pend = _puntos_y_pendientes(z, adentro, caja, lat0, lon0)
            todos_puntos.append(puntos)
            todas_pend.append(pend)
        puntos = np.concatenate(todos_puntos)
        if len(items) > 1:  # las teselas vecinas comparten la fila/columna del borde
            _, unicos = np.unique(np.round(puntos[:, :2]), axis=0, return_index=True)
            puntos = puntos[np.sort(unicos)]
        pend = np.concatenate(todas_pend)
        pend = pend[~np.isnan(pend)]
        n = len(puntos)
        if n < MIN_PIXELES:
            motivo = f"Muy pocos píxeles de elevación dentro del lote ({n})"
            return {"pendiente_general": _sin_dato(motivo), "pendiente_maxima": _sin_dato(motivo)}
        general = _plano(puntos)
    except pc.ErrorPC as e:
        motivo = f"No se pudo consultar NASADEM: {e}"
        return {"pendiente_general": _sin_dato(motivo), "pendiente_maxima": _sin_dato(motivo)}
    except Exception as e:  # noqa: BLE001 — nunca propagar: va a "Información que falta"
        motivo = f"No se pudo calcular la pendiente con NASADEM ({type(e).__name__})"
        return {"pendiente_general": _sin_dato(motivo), "pendiente_maxima": _sin_dato(motivo)}

    if n >= PIXELES_CONFIANZA_ALTA:
        r_general = _indicador(general, "alta", f"Plano ajustado sobre {n} píxeles del lote")
    else:
        r_general = _indicador(general, "media", f"Plano ajustado sobre solo {n} píxeles (lote chico)")

    if len(pend):
        maxima = float(np.percentile(pend, PERCENTIL_MAX))
        r_maxima = _indicador(maxima, "media", f"Percentil {PERCENTIL_MAX} de la pendiente por píxel "
                                               f"({len(pend)} píxeles); valor por píxel, ruidoso")
    else:
        r_maxima = _sin_dato("El lote es muy chico para calcular la pendiente por píxel")
    return {"pendiente_general": r_general, "pendiente_maxima": r_maxima}


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t = time.perf_counter()
    resultado = calcular(poligono)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t:.1f} s")
