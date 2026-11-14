"""NDVI del lote, mes a mes, en la última campaña completa → "visto por satélite" (RF14).

Fuente principal: NASA HLS a 30 m (`hls2-s30` Sentinel-2 y `hls2-l30` Landsat) en Planetary
Computer. Por cada mes se usa la escena con menos nubes (`eo:cloud_cover` < 30 %) y se pide
el NDVI medio del polígono con `item/statistics`. Si un mes no tiene escena HLS limpia, se
usa MODIS MOD13Q1/MYD13Q1 (250 m, compuesto de 16 días) de respaldo y se dice en la fuente.

Misma lógica que `hlsScene`/`hlsMean`/`loadSeen` del prototipo. Los 12 meses van en paralelo.
"""
from __future__ import annotations

import calendar
import concurrent.futures as cf
import math
import sys
import time
from datetime import date

from app.satelite import pc
from app.satelite.lote import LOTE_EJEMPLO, validar

# HLS v2 (verificado el 14/11): S30 tiene B08 (NIR), L30 no (su NIR es B05).
COLECCIONES_HLS = {
    "hls2-s30": "(B08-B04)/(B08+B04)",
    "hls2-l30": "(B05-B04)/(B05+B04)",
}
SENSOR_HLS = {"hls2-s30": "HLS S30 (Sentinel-2)", "hls2-l30": "HLS L30 (Landsat 8/9)"}
NUBES_MAX = 30                 # % de nubes de la escena (dato de la tesela, no del lote)
CANDIDATOS_HLS = 3             # escenas por colección y por mes que se piden a la búsqueda
INTENTOS_HLS = 2               # escenas que se prueban antes de caer a MODIS
PIXEL_HLS_M2 = 30 * 30
MIN_FRACCION_PIXELES = 0.5     # la escena tiene que cubrir al menos la mitad de los píxeles del lote

MODIS_COLECCION = "modis-13Q1-061"
MODIS_ASSET = "250m_16_days_NDVI"
MODIS_FIABILIDAD = "250m_16_days_pixel_reliability"  # −1 relleno · 0 bueno · 1 marginal · 2 nieve · 3 nubes
MODIS_ESCALA = 0.0001
MODIS_FIABILIDAD_MAX = 1       # se aceptan píxeles buenos y marginales
INTENTOS_MODIS = 2

# Lote "pelado" o casi: NDVI medio < 0,3 (regla del prototipo, la valida la persona 3).
UMBRAL_NDVI_BAJO = 0.3

# Orden de los 12 meses en `meses`: campaña de julio a junio, índice 0 = julio.
# TODO: todavía no está acordado con Back 1, la persona 3 y el front (PLAN.md, "Para acordar").
ORDEN_MESES = (7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6)
ORDEN_TEXTO = "julio a junio (índice 0 = julio)"

PLAZO_TOTAL = 20.0             # s para todo el módulo (/analizar tiene 30 s); cada pedido tiene 10 s (pc.TIMEOUT)
HILOS = 12

FUENTE_HLS = "NASA HLS 30 m (Landsat + Sentinel-2), vía Planetary Computer"
UMBRAL_TEXTO = f"{UMBRAL_NDVI_BAJO:g}".replace(".", ",")
RESOLUCION_HLS = "30 m"
UNIDAD = "meses"

MESES_ES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
            "septiembre", "octubre", "noviembre", "diciembre")


def campana_inicio(hoy: date | None = None) -> int:
    """Año de inicio de la última campaña completa (julio a junio) a la fecha `hoy`.

    En noviembre de 2026 es 2025 (campaña 2025/26, terminó el 30/06/2026).
    """
    hoy = hoy or date.today()
    return hoy.year - 1 if hoy.month >= 7 else hoy.year - 2


def _etiqueta_campana(inicio: int) -> str:
    return f"{inicio}/{str(inicio + 1)[2:]}"


def _anio_del_mes(inicio: int, mes: int) -> int:
    return inicio if mes >= 7 else inicio + 1


def _nombre_mes(anio: int, mes: int) -> str:
    return f"{MESES_ES[mes - 1].capitalize()} {anio}"


def _intervalo(anio: int, mes: int) -> str:
    ultimo = calendar.monthrange(anio, mes)[1]
    return f"{anio}-{mes:02d}-01/{anio}-{mes:02d}-{ultimo:02d}"


def _hls(poligono: dict, anio: int, mes: int, min_pixeles: int) -> tuple[dict | None, str]:
    """Escena HLS más limpia del mes y su NDVI medio. Devuelve (mes | None, motivo)."""
    filtro = {"op": "<", "args": [{"property": "eo:cloud_cover"}, NUBES_MAX]}
    orden = [{"field": "eo:cloud_cover", "direction": "asc"}]
    escenas, errores = [], []
    for coleccion in COLECCIONES_HLS:
        try:
            escenas += pc.buscar(coleccion, poligono, fechas=_intervalo(anio, mes),
                                 limite=CANDIDATOS_HLS, filtro=filtro, orden=orden)
        except pc.ErrorPC as e:
            errores.append(str(e))
    escenas = [e for e in escenas if e.get("collection") in COLECCIONES_HLS and e.get("id")]
    escenas.sort(key=lambda e: (e.get("properties", {}).get("eo:cloud_cover", 100), e["collection"]))
    if not escenas:
        return None, ("no se pudo buscar en HLS: " + errores[0]) if errores else \
            f"sin escena HLS con < {NUBES_MAX} % de nubes"

    motivo = "las escenas HLS no cubren el lote"
    for escena in escenas[:INTENTOS_HLS]:
        coleccion, props = escena["collection"], escena.get("properties", {})
        try:
            st = pc.estadisticas(coleccion, escena["id"], poligono, expresion=COLECCIONES_HLS[coleccion])
            media, pixeles = float(st["mean"]), int(st["count"])
        except (pc.ErrorPC, KeyError, TypeError, ValueError) as e:
            motivo = f"no se pudo leer la escena HLS ({e})"
            continue
        if pixeles < min_pixeles or not math.isfinite(media):
            motivo = f"la escena HLS cubre solo {pixeles} píxeles del lote"
            continue
        return {
            "fecha": (props.get("datetime") or "")[:10] or None,
            "ndvi_medio": round(media, 3),
            "nubes_escena": props.get("eo:cloud_cover"),
            "coleccion": coleccion,
            "item": escena["id"],
            "fuente": f"NASA {SENSOR_HLS[coleccion]} · 30 m",
            "pixeles": pixeles,
        }, ""
    return None, motivo


def _modis(poligono: dict, anio: int, mes: int) -> tuple[dict | None, str]:
    """Compuesto MODIS de 16 días que empieza en el mes, con píxeles confiables."""
    try:
        items = pc.buscar(MODIS_COLECCION, poligono, fechas=_intervalo(anio, mes), limite=10)
    except pc.ErrorPC as e:
        return None, f"no se pudo buscar en MODIS: {e}"
    prefijo = f"{anio}-{mes:02d}"
    # `datetime` viene null en esta colección: la fecha del compuesto es `start_datetime`.
    items = [i for i in items if (i.get("properties", {}).get("start_datetime") or "").startswith(prefijo)]
    items.sort(key=lambda i: i["properties"]["start_datetime"])
    if not items:
        return None, "sin compuesto MODIS en el mes"

    motivo = "sin compuesto MODIS confiable (nubes o relleno sobre el lote)"
    for item in items[:INTENTOS_MODIS]:
        try:
            fia = pc.estadisticas(MODIS_COLECCION, item["id"], poligono, assets=MODIS_FIABILIDAD)
            if fia["percentile_2"] < 0 or fia["percentile_98"] > MODIS_FIABILIDAD_MAX:
                continue
            st = pc.estadisticas(MODIS_COLECCION, item["id"], poligono, assets=MODIS_ASSET)
            media, pixeles = float(st["mean"]) * MODIS_ESCALA, int(st["count"])
        except (pc.ErrorPC, KeyError, TypeError, ValueError) as e:
            motivo = f"no se pudo leer el compuesto MODIS ({e})"
            continue
        if pixeles < 1 or not math.isfinite(media):
            continue
        producto = item["id"].split(".")[0]  # MOD13Q1 (Terra) o MYD13Q1 (Aqua)
        return {
            "fecha": item["properties"]["start_datetime"][:10],
            "ndvi_medio": round(media, 3),
            "nubes_escena": None,
            "coleccion": MODIS_COLECCION,
            "item": item["id"],
            "fuente": (f"NASA MODIS {producto} · 250 m, compuesto de 16 días · respaldo: sin escena HLS "
                       f"con < {NUBES_MAX} % de nubes. Mezcla el lote con los vecinos: con el umbral "
                       f"{UMBRAL_TEXTO} marca menos meses que HLS"),
            "pixeles": pixeles,
        }, ""
    return None, motivo


def _mes(poligono: dict, anio: int, mes: int, min_pixeles: int) -> tuple[dict | None, str]:
    """NDVI de un mes: HLS y, si no hay, MODIS. Nunca lanza."""
    try:
        r, motivo_hls = _hls(poligono, anio, mes, min_pixeles)
        if r:
            return {"mes": f"{anio}-{mes:02d}", **r}, ""
        r, motivo_modis = _modis(poligono, anio, mes)
        if r:
            return {"mes": f"{anio}-{mes:02d}", **r}, ""
        return None, f"{_nombre_mes(anio, mes)}: {motivo_hls}; MODIS de respaldo: {motivo_modis}"
    except Exception as e:  # noqa: BLE001 — nunca propagar
        return None, f"{_nombre_mes(anio, mes)}: error inesperado ({type(e).__name__})"


def _sin_dato(campana: str, motivo: str, faltantes: list | None = None) -> dict:
    return {
        "visto_por_satelite": {
            "campana": campana, "fuente": FUENTE_HLS, "meses": [None] * 12,
            "meses_ndvi_bajo": None, "umbral": UMBRAL_NDVI_BAJO, "orden_meses": ORDEN_TEXTO,
            "faltantes": faltantes or [],
        },
        "meses_cobertura_baja": {
            "valor": None, "unidad": UNIDAD, "fuente": FUENTE_HLS, "anios": campana,
            "resolucion": RESOLUCION_HLS, "confianza": "sin_dato", "motivo": motivo,
        },
    }


def calcular(poligono: dict, *, campana: int | None = None, hoy: date | None = None) -> dict:
    """NDVI medio del lote en cada mes de la última campaña completa. Nunca lanza.

    poligono: GeoJSON Polygon en [lon, lat].
    campana: año de inicio (2025 → 2025/26). Por defecto, la última campaña completa a `hoy`.
    """
    inicio = campana if campana is not None else campana_inicio(hoy)
    etiqueta = _etiqueta_campana(inicio)
    try:
        lote = validar(poligono)
        if not lote["ok"]:
            return _sin_dato(etiqueta, f"Lote inválido: {lote['motivo']}")
        poligono = lote["poligono"]
        esperados = lote["area_ha"] * 1e4 / PIXEL_HLS_M2
        min_pixeles = max(1, math.ceil(esperados * MIN_FRACCION_PIXELES))

        meses_pedidos = [(_anio_del_mes(inicio, m), m) for m in ORDEN_MESES]
        pool = cf.ThreadPoolExecutor(max_workers=HILOS)
        futuros = [pool.submit(_mes, poligono, a, m, min_pixeles) for a, m in meses_pedidos]
        cf.wait(futuros, timeout=PLAZO_TOTAL)
        pool.shutdown(wait=False, cancel_futures=True)

        meses, faltantes = [], []
        for (a, m), f in zip(meses_pedidos, futuros):
            if f.done():
                r, motivo = f.result()
            else:
                r, motivo = None, f"{_nombre_mes(a, m)}: Planetary Computer no respondió a tiempo"
            meses.append(r)
            if r is None:
                faltantes.append({"mes": f"{a}-{m:02d}", "motivo": motivo})
        return _armar(etiqueta, meses, faltantes)
    except Exception as e:  # noqa: BLE001 — nunca propagar: va a "Información que falta"
        return _sin_dato(etiqueta, f"No se pudo calcular el NDVI del lote ({type(e).__name__})")


def _armar(etiqueta: str, meses: list, faltantes: list) -> dict:
    """Arma `visto_por_satelite` y el indicador "meses con cobertura baja"."""
    con_dato = [r for r in meses if r]
    if not con_dato:
        return _sin_dato(etiqueta, f"Sin NDVI del lote en la campaña {etiqueta}. "
                                   + (faltantes[0]["motivo"] if faltantes else "Sin datos"), faltantes)

    bajos = sum(1 for r in con_dato if r["ndvi_medio"] < UMBRAL_NDVI_BAJO)
    n_modis = sum(1 for r in con_dato if r["coleccion"] == MODIS_COLECCION)
    fuente = FUENTE_HLS if not n_modis else (
        f"NASA HLS 30 m (Landsat + Sentinel-2) y MODIS MOD13Q1 250 m de respaldo en {n_modis} "
        f"{'mes' if n_modis == 1 else 'meses'}, vía Planetary Computer")
    resolucion = RESOLUCION_HLS if not n_modis else f"30 m (250 m en {n_modis} de 12 meses)"
    completo = len(con_dato) == 12 and not n_modis
    notas = [f"NDVI medio del lote < {UMBRAL_TEXTO} en {bajos} de {len(con_dato)} meses con dato"]
    if len(con_dato) < 12:
        notas.append(f"faltan {12 - len(con_dato)} meses (ver Información que falta)")
    if n_modis:
        notas.append("en los meses con MODIS el píxel de 250 m mezcla el lote con los vecinos")

    return {
        "visto_por_satelite": {
            "campana": etiqueta,
            "fuente": "NASA HLS 30 m" if not n_modis else f"NASA HLS 30 m + MODIS 250 m (respaldo en {n_modis} de 12 meses)",
            "meses": meses,
            "meses_ndvi_bajo": bajos,
            "umbral": UMBRAL_NDVI_BAJO,
            "orden_meses": ORDEN_TEXTO,
            "faltantes": faltantes,
        },
        "meses_cobertura_baja": {
            "valor": bajos, "unidad": UNIDAD, "fuente": fuente, "anios": etiqueta,
            "resolucion": resolucion,
            # Una sola campaña → "media" (skill modulo-satelite); con respaldo o meses faltantes → "baja".
            "confianza": "media" if completo else "baja",
            "nota": "; ".join(notas),
        },
    }


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t0 = time.perf_counter()
    resultado = calcular(poligono)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t0:.1f} s", file=sys.stderr)
