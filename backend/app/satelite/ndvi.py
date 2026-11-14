"""NDVI del lote, mes a mes, en la última campaña completa → "visto por satélite" (RF14).

Fuente principal: NASA HLS a 30 m (`hls2-s30` Sentinel-2 y `hls2-l30` Landsat) en Planetary
Computer. Por cada mes se usa la escena con menos nubes (`eo:cloud_cover` < 30 %). Si un mes no
tiene escena HLS limpia, se usa MODIS MOD13Q1/MYD13Q1 (250 m, compuesto de 16 días) de respaldo
y se dice en la fuente.

Plan de armonización (§4, paso 4): la escena de cada mes se baja **sobre la grilla común del lote**
(`grilla.py`; HLS con `bilinear`, MODIS con `nearest` para que se vean los bloques de 250 m) y el
**NDVI medio del lote es la media de ese raster dentro de la máscara**: el número de la tabla es
exactamente el promedio de lo que se ve en el mapa. El raster de cada mes viaja en `mapas[12]`
(`CapaRaster`). Si el raster de una escena falla, la media sale de `item/statistics` (como antes)
y ese mes no tiene capa.

Misma lógica que `hlsScene`/`hlsMean`/`loadSeen` del prototipo. Los 12 meses van en paralelo.
"""
from __future__ import annotations

import calendar
import concurrent.futures as cf
import math
import sys
import time
from datetime import date

import numpy as np

from app.satelite import escalas, grilla, pc, raster
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
MODIS_FIABILIDAD_MAX = 1       # se aceptan píxeles buenos y marginales (el relleno −1 llega como 255 en uint8)
MODIS_FRACCION_MALOS = 0.02    # más del 2 % de píxeles no confiables en el lote → se descarta el compuesto
MODIS_MIN_CRUDO = -2000        # rango válido del producto: −2000 a 10000 (el relleno es −3000)
INTENTOS_MODIS = 2

# Lote "pelado" o casi: NDVI medio < 0,3. Una sola definición, en `escalas.py` (la valida la persona 3).
UMBRAL_NDVI_BAJO = escalas.UMBRAL_NDVI

# Capas por mes (CapaRaster) sobre la grilla del lote.
RESAMPLING_HLS = "bilinear"    # índice continuo, de resolución parecida a la grilla
RESAMPLING_MODIS = "nearest"   # bloques de 250 m a propósito: la leyenda lo dice
FACTOR_CAPA = 0.001            # milésimos de NDVI
# Con más píxeles que esto, las capas de NDVI van sin `valores` (12 capas de un lote grande pesan
# varios MB); el PNG y el resumen siguen. ~40.000 píxeles a 1″ son unas 3.000 ha.
MAX_PIXELES_VALORES = 40_000

# Orden de los 12 meses en `meses`: índice 0 = enero … 11 = diciembre, igual que el front
# (`frontend/src/lib/vista.ts`) y `MES` del prototipo. La campaña sigue siendo de julio a junio:
# los índices 6–11 (jul–dic) son del primer año y los 0–5 (ene–jun) del segundo.
ORDEN_MESES = tuple(range(1, 13))
ORDEN_TEXTO = "índice 0 = enero … 11 = diciembre; julio a diciembre del primer año de la campaña, enero a junio del segundo"

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


def _media_grilla(arr: np.ndarray, adentro: np.ndarray) -> tuple[float, int]:
    v = arr[adentro & np.isfinite(arr)]
    return (float(v.mean()), int(v.size)) if v.size else (math.nan, 0)


def _hls(poligono: dict, anio: int, mes: int, min_pixeles: int, malla: tuple | None = None
         ) -> tuple[dict | None, str, np.ndarray | None]:
    """Escena HLS más limpia del mes y su NDVI medio. Devuelve (mes | None, motivo, raster | None).

    malla: (grilla, máscara) del lote. Con malla, la media es la del raster de la escena sobre la
    grilla; si ese pedido falla, la de `item/statistics` (y no hay raster).
    """
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
        return None, (("no se pudo buscar en HLS: " + errores[0]) if errores else
                      f"sin escena HLS con < {NUBES_MAX} % de nubes"), None

    motivo = "las escenas HLS no cubren el lote"
    for escena in escenas[:INTENTOS_HLS]:
        coleccion, props = escena["collection"], escena.get("properties", {})
        arr = None
        if malla:
            try:
                arr = pc.raster_en_grilla(coleccion, escena["id"], malla[0], expresion=COLECCIONES_HLS[coleccion],
                                          resampling=RESAMPLING_HLS)
                media, pixeles = _media_grilla(arr, malla[1])
            except pc.ErrorPC:
                arr = None  # sin capa este mes: la media sale de las estadísticas
        if arr is None:
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
        }, "", arr
    return None, motivo, None


def _modis_grilla(item: str, malla: tuple) -> tuple[float, int, np.ndarray] | None:
    """NDVI MODIS sobre la grilla, sin los píxeles no confiables. None si el compuesto se descarta."""
    g, adentro = malla
    fia = pc.raster_en_grilla(MODIS_COLECCION, item, g, assets=MODIS_FIABILIDAD, resampling=RESAMPLING_MODIS)
    crudo = pc.raster_en_grilla(MODIS_COLECCION, item, g, assets=MODIS_ASSET, resampling=RESAMPLING_MODIS)
    con_fia = adentro & np.isfinite(fia)
    malos = con_fia & ((fia < 0) | (fia > MODIS_FIABILIDAD_MAX))
    if not con_fia.any() or malos.sum() > MODIS_FRACCION_MALOS * con_fia.sum():
        return None
    arr = np.where(np.isfinite(fia) & ~malos & (crudo >= MODIS_MIN_CRUDO), crudo * MODIS_ESCALA, np.nan)
    media, pixeles = _media_grilla(arr, adentro)
    return media, pixeles, arr


def _modis(poligono: dict, anio: int, mes: int, malla: tuple | None = None
           ) -> tuple[dict | None, str, np.ndarray | None]:
    """Compuesto MODIS de 16 días que empieza en el mes, con píxeles confiables.

    Con malla, la media sale del raster sobre la grilla (vecino más cercano) y se devuelve el raster.
    """
    try:
        items = pc.buscar(MODIS_COLECCION, poligono, fechas=_intervalo(anio, mes), limite=10)
    except pc.ErrorPC as e:
        return None, f"no se pudo buscar en MODIS: {e}", None
    prefijo = f"{anio}-{mes:02d}"
    # `datetime` viene null en esta colección: la fecha del compuesto es `start_datetime`.
    items = [i for i in items if (i.get("properties", {}).get("start_datetime") or "").startswith(prefijo)]
    items.sort(key=lambda i: i["properties"]["start_datetime"])
    if not items:
        return None, "sin compuesto MODIS en el mes", None

    motivo = "sin compuesto MODIS confiable (nubes o relleno sobre el lote)"
    for item in items[:INTENTOS_MODIS]:
        arr = None
        if malla:
            try:
                en_grilla = _modis_grilla(item["id"], malla)
                if en_grilla is None:
                    continue
                media, pixeles, arr = en_grilla
            except pc.ErrorPC:
                arr = None  # sin capa este mes: se prueba con las estadísticas
        try:
            if arr is None:
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
        }, "", arr
    return None, motivo, None


def _mes(poligono: dict, anio: int, mes: int, min_pixeles: int, malla: tuple | None = None
         ) -> tuple[dict | None, str, np.ndarray | None]:
    """NDVI de un mes: HLS y, si no hay, MODIS. Devuelve (mes | None, motivo, raster | None). Nunca lanza."""
    try:
        r, motivo_hls, arr = _hls(poligono, anio, mes, min_pixeles, malla)
        if r:
            return {"mes": f"{anio}-{mes:02d}", **r}, "", arr
        r, motivo_modis, arr = _modis(poligono, anio, mes, malla)
        if r:
            return {"mes": f"{anio}-{mes:02d}", **r}, "", arr
        return None, f"{_nombre_mes(anio, mes)}: {motivo_hls}; MODIS de respaldo: {motivo_modis}", None
    except Exception as e:  # noqa: BLE001 — nunca propagar
        return None, f"{_nombre_mes(anio, mes)}: error inesperado ({type(e).__name__})", None


def _capa_mes(r: dict, arr: np.ndarray | None, malla: tuple | None, etiqueta: str) -> dict | None:
    """CapaRaster del NDVI del mes sobre la grilla. None si no hay raster. Nunca lanza."""
    if arr is None or not malla:
        return None
    g, adentro = malla
    try:
        anio, mes = int(r["mes"][:4]), int(r["mes"][5:7])
        modis = r["coleccion"] == MODIS_COLECCION
        nota = (f"NDVI medio del lote = media de esta capa dentro del lote ({r['pixeles']} píxeles de la "
                f"grilla). Umbral de cobertura baja: {UMBRAL_TEXTO}")
        if modis:
            nota += ". MODIS de respaldo puesto en la grilla con vecino más cercano: se ven bloques de 250 m"
        else:
            nota += f". Escena del {r['fecha']} con {r.get('nubes_escena')} % de nubes en la tesela"
        con_valores = g.pixeles <= MAX_PIXELES_VALORES
        if not con_valores:
            nota += (f". Sin valores por píxel: el lote pasa de {MAX_PIXELES_VALORES:,} píxeles y las 12 capas "
                     "pesarían varios MB").replace(",", ".")
        if g.nota:
            nota += f". {g.nota}"
        return raster.capa(
            id="ndvi", titulo=f"NDVI · {_nombre_mes(anio, mes)}", unidad="NDVI", fuente=r["fuente"],
            resolucion_nativa="250 m (MODIS, respaldo)" if modis else RESOLUCION_HLS, grilla=g, array=arr,
            mascara=adentro, escala=escalas.NDVI, factor=FACTOR_CAPA, confianza="baja" if modis else "alta",
            nota=nota, fecha=r["fecha"], campana=etiqueta, decimales=3, valor_lote=r["ndvi_medio"],
            con_valores=con_valores)
    except Exception:  # noqa: BLE001 — la capa nunca rompe el NDVI del mes
        return None


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
        "mapas": [None] * 12,
        "grilla": None,
    }


def calcular(poligono: dict, *, campana: int | None = None, hoy: date | None = None) -> dict:
    """NDVI medio del lote en cada mes de la última campaña completa. Nunca lanza.

    poligono: GeoJSON Polygon en [lon, lat].
    campana: año de inicio (2025 → 2025/26). Por defecto, la última campaña completa a `hoy`.

    Devuelve {visto_por_satelite, meses_cobertura_baja, mapas: [CapaRaster | None] × 12 (índice 0 =
    enero, como `meses`), grilla: {bounds, ancho, alto, paso} | None}.
    """
    inicio = campana if campana is not None else campana_inicio(hoy)
    etiqueta = _etiqueta_campana(inicio)
    try:
        lote = validar(poligono)
        if not lote["ok"]:
            return _sin_dato(etiqueta, f"Lote inválido: {lote['motivo']}")
        poligono = lote["poligono"]
        malla = None
        try:
            g = grilla.crear(poligono)
            malla = (g, grilla.mascara(g, poligono))
            esperados = int(malla[1].sum())          # píxeles de la grilla dentro del lote
        except Exception:  # noqa: BLE001 — sin grilla, las medias salen de item/statistics
            esperados = lote["area_ha"] * 1e4 / PIXEL_HLS_M2
        min_pixeles = max(1, math.ceil(esperados * MIN_FRACCION_PIXELES))

        meses_pedidos = [(_anio_del_mes(inicio, m), m) for m in ORDEN_MESES]
        pool = cf.ThreadPoolExecutor(max_workers=HILOS)
        futuros = [pool.submit(_mes, poligono, a, m, min_pixeles, malla) for a, m in meses_pedidos]
        cf.wait(futuros, timeout=PLAZO_TOTAL)
        pool.shutdown(wait=False, cancel_futures=True)

        meses, faltantes, mapas = [], [], []
        for (a, m), f in zip(meses_pedidos, futuros):
            if f.done():
                r, motivo, arr = f.result()
            else:
                r, motivo, arr = None, f"{_nombre_mes(a, m)}: Planetary Computer no respondió a tiempo", None
            meses.append(r)
            mapas.append(_capa_mes(r, arr, malla, etiqueta) if r else None)
            if r is None:
                faltantes.append({"mes": f"{a}-{m:02d}", "motivo": motivo})
        resultado = _armar(etiqueta, meses, faltantes)
        resultado["mapas"] = mapas
        resultado["grilla"] = malla[0].a_dict() if malla else None
        return resultado
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
    resultado["mapas"] = [{"fecha": c["fecha"], "resumen": c["resumen"], "png": len(c["png"]),
                           "valores": len(c["valores"] or "")} if c else None for c in resultado["mapas"]]
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t0:.1f} s", file=sys.stderr)
