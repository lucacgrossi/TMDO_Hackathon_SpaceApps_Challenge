"""ET real anual del lote. Fuente: MODIS MOD16A3GF / MYD16A3GF v061 en Planetary Computer (500 m).

Se usa para mostrarla al lado del balance hídrico de Back 1 (ET0 de Hargreaves): no cambia
ningún puntaje. Toma el último año completo disponible y promedia Terra (MOD) y Aqua (MYD).
A 500 m el píxel mezcla el lote con los vecinos: es contexto, no una medición del lote.
"""
from __future__ import annotations

import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import numpy as np

from app.satelite import pc
from app.satelite.lote import LOTE_EJEMPLO

COLECCION = "modis-16A3GF-061"
ASSET = "ET_500m"             # kg/m²/año = mm/año, uint16 (metadatos STAC `raster:bands`)
ESCALA = 0.1                  # `raster:bands.scale` del asset
VALIDO_MAX = 65500            # 65529–65535 = relleno (agua, zona urbana, suelo desnudo, sin dato)
FUENTE = "MODIS MOD16A3GF/MYD16A3GF v061 (Terra y Aqua) · NASA, vía Planetary Computer"
RESOLUCION = "500 m"
UNIDAD = "mm/año"
SATELITES = {"MOD": "Terra", "MYD": "Aqua"}
ANIOS_BUSQUEDA = 3            # se buscan los últimos años y se usa el último completo


def _sin_dato(motivo: str, anio: str | None = None) -> dict:
    return {"et_real_anual": {"valor": None, "unidad": UNIDAD, "fuente": FUENTE, "anios": anio,
                              "resolucion": RESOLUCION, "confianza": "sin_dato", "motivo": motivo}}


def _ultimo_anio_completo(items: list[dict]) -> tuple[str, list[dict]] | None:
    """(año, items de ese año) del último año que ya terminó."""
    ahora = datetime.now(UTC).isoformat()
    por_anio: dict[str, list[dict]] = {}
    for it in items:
        p = it.get("properties", {})
        inicio, fin = p.get("start_datetime"), p.get("end_datetime")
        if inicio and fin and fin <= ahora and it["id"][:3] in SATELITES:
            por_anio.setdefault(inicio[:4], []).append(it)
    if not por_anio:
        return None
    anio = max(por_anio)
    return anio, por_anio[anio]


def _valores(item: dict, poligono: dict) -> tuple[str, np.ndarray]:
    """(prefijo del satélite, valores válidos en mm/año dentro del lote)."""
    z, adentro, _ = pc.array_poligono(COLECCION, item["id"], poligono, ASSET)
    vals = z[adentro & (z <= VALIDO_MAX)].astype(float) * ESCALA
    return item["id"][:3], vals


def calcular(poligono: dict) -> dict:
    """poligono: GeoJSON Polygon en [lon, lat]. Devuelve {"et_real_anual": Indicador}."""
    try:
        hoy = datetime.now(UTC).year
        fechas = f"{hoy - ANIOS_BUSQUEDA}-01-01/{hoy}-12-31"   # el producto sale con ~1 mes de demora
        elegido = _ultimo_anio_completo(pc.buscar(COLECCION, poligono, fechas=fechas, limite=20))
        if elegido is None:
            return _sin_dato("MODIS no tiene ET anual para el lote")
        anio, items = elegido
        # Terra y Aqua (y más de una tesela si el lote cruza un borde) en paralelo.
        por_satelite: dict[str, list[np.ndarray]] = {}
        errores: list[str] = []
        with ThreadPoolExecutor(max_workers=len(items)) as ex:
            futuros = [ex.submit(_valores, it, poligono) for it in items]
            for f in futuros:
                try:
                    sat, vals = f.result()
                    por_satelite.setdefault(sat, []).append(vals)
                except pc.ErrorPC as e:
                    errores.append(str(e))
        if not por_satelite:
            return _sin_dato(f"No se pudo consultar MODIS ET: {errores[0]}", anio)
        medias = {sat: float(np.concatenate(v).mean()) for sat, v in por_satelite.items()
                  if sum(len(x) for x in v)}
        if not medias:
            return _sin_dato("MODIS no estima ET en este lote (lo marca como agua, zona urbana "
                             "o suelo desnudo)", anio)
    except pc.ErrorPC as e:
        return _sin_dato(f"No se pudo consultar MODIS ET: {e}")
    except Exception as e:  # noqa: BLE001 — nunca propagar: va a "Información que falta"
        return _sin_dato(f"No se pudo calcular la ET real con MODIS ({type(e).__name__})")

    valor = sum(medias.values()) / len(medias)
    detalle = " y ".join(f"{SATELITES[s]} {m:.0f} mm" for s, m in sorted(medias.items()))
    nota = (f"ET real de {anio}: " + ("promedio de " if len(medias) > 1 else "solo ") + detalle +
            ". A 500 m el píxel mezcla el lote con los vecinos.")
    return {"et_real_anual": {
        "valor": round(valor), "unidad": UNIDAD, "fuente": FUENTE, "anios": anio,
        "resolucion": RESOLUCION, "confianza": "media", "nota": nota,
    }}


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t = time.perf_counter()
    print(json.dumps(calcular(poligono), ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t:.1f} s")
