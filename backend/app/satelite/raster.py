"""Rasters de la grilla común → lo que viaja en un `CapaRaster` (plan de armonización, §5).

- `pintar`: PNG RGBA en base64 con la escala de la capa; transparente fuera del lote y sin dato.
- `cuantizar`: los valores como int16 little-endian (`<i2`) en base64, para leer un píxel (RF18).
- `resumen`: media, mínimo, máximo y píxeles dentro de la máscara (el número del lote sale de acá).
- `capa`: arma el dict `CapaRaster` completo.

Orientación (acordada con Front 1 en #25): fila 0 = norte (borde superior de `bounds`) y
columna 0 = oeste, tanto en el PNG como en `valores`. Valor real = entero × `factor`.
"""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image

NODATA = -32768                # int16 mínimo: fuera del lote o sin dato
MAX_ENTERO = 32767


def _validos(array: np.ndarray, mascara: np.ndarray) -> np.ndarray:
    if array.shape != mascara.shape:
        raise ValueError(f"El raster {array.shape} y la máscara {mascara.shape} no tienen la misma forma")
    return mascara & np.isfinite(array)


def clases(array: np.ndarray, cortes: list[float]) -> np.ndarray:
    """Índice de la clase de cada píxel: la última cuyo corte (piso) no supera el valor; 0 si queda debajo."""
    a = np.nan_to_num(np.asarray(array, dtype=float), nan=-np.inf)
    return np.clip(np.searchsorted(np.asarray(cortes, dtype=float), a, side="right") - 1, 0, len(cortes) - 1)


def _rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def pintar(array: np.ndarray, mascara: np.ndarray, escala: dict) -> str:
    """PNG RGBA (base64, sin el prefijo data:) pintado por clases; alfa 0 fuera de la máscara o sin dato."""
    validos = _validos(array, mascara)
    paleta = np.array([_rgb(c) for c in escala["colores"]], dtype=np.uint8)
    rgba = np.zeros((*array.shape, 4), dtype=np.uint8)
    rgba[..., :3] = paleta[clases(array, escala["cortes"])]
    rgba[..., 3] = np.where(validos, 255, 0)
    rgba[~validos, :3] = 0
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def cuantizar(array: np.ndarray, mascara: np.ndarray, factor: float = 0.01) -> tuple[str, float, int]:
    """(base64 de int16 `<i2` por filas, factor, nodata). Valor real = entero × factor.

    Si algún valor no entra en int16 con ese factor, el factor se multiplica por 10 hasta que entre.
    El error de ida y vuelta es menor que factor / 2.
    """
    validos = _validos(array, mascara)
    maximo = float(np.abs(array[validos]).max()) if validos.any() else 0.0
    while maximo / factor > MAX_ENTERO:
        factor *= 10
    enteros = np.full(array.shape, NODATA, dtype="<i2")
    enteros[validos] = np.round(array[validos] / factor).astype("<i2")
    return base64.b64encode(enteros.tobytes(order="C")).decode("ascii"), factor, NODATA


def descuantizar(texto: str, factor: float, nodata: int, alto: int, ancho: int) -> np.ndarray:
    """Lo inverso de `cuantizar` (para los tests y para revisar una capa): NaN donde hay nodata."""
    enteros = np.frombuffer(base64.b64decode(texto), dtype="<i2").reshape(alto, ancho)
    return np.where(enteros == nodata, np.nan, enteros * factor)


def resumen(array: np.ndarray, mascara: np.ndarray, decimales: int = 2) -> dict | None:
    """{media, min, max, pixeles} dentro de la máscara y con dato. None si no queda ningún píxel."""
    v = array[_validos(array, mascara)]
    if v.size == 0:
        return None
    return {"media": round(float(v.mean()), decimales), "min": round(float(v.min()), decimales),
            "max": round(float(v.max()), decimales), "pixeles": int(v.size)}


def capa(*, id: str, titulo: str, unidad: str, fuente: str, resolucion_nativa: str, grilla,
         array: np.ndarray, mascara: np.ndarray, escala: dict, factor: float, confianza: str,
         nota: str | None = None, fecha: str | None = None, campana: str | None = None,
         decimales: int = 2, valor_lote: float | None = None, con_valores: bool = True) -> dict | None:
    """El dict `CapaRaster` (plan §5) de un raster sobre la grilla común. None si no hay píxeles con dato.

    valor_lote: el número de la tabla para esta capa (por ejemplo, la pendiente general del plano),
    para que la leyenda muestre el mismo número que el panel. Va en `resumen.valor_lote`.
    con_valores=False: `valores` va en None (solo el PNG y el resumen), para capas que pesarían demasiado.
    """
    if array.shape != (grilla.alto, grilla.ancho):
        raise ValueError(f"El raster {array.shape} no coincide con la grilla {grilla.alto} × {grilla.ancho}")
    res = resumen(array, mascara, decimales)
    if res is None:
        return None
    if valor_lote is not None:
        res["valor_lote"] = valor_lote
    valores, factor, nodata = cuantizar(array, mascara, factor) if con_valores else (None, factor, NODATA)
    return {
        "id": id, "titulo": titulo, "unidad": unidad, "fuente": fuente, "fecha": fecha, "campana": campana,
        "resolucion_nativa": resolucion_nativa, "resolucion_grilla": grilla.resolucion,
        "bounds": grilla.bounds, "ancho": grilla.ancho, "alto": grilla.alto,
        "png": pintar(array, mascara, escala), "valores": valores, "factor": factor, "nodata": nodata,
        "escala": {k: list(v) for k, v in escala.items()},
        "resumen": res, "confianza": confianza, "nota": nota,
    }
