"""Capas del mapa del lote: escena NDVI de cada mes, riesgo de erosión y rasters (`salida.capas`).

No hace pedidos propios: arma las capas con lo que ya devolvieron `ndvi.calcular()`,
`elevacion.calcular()` y `cobertura.calcular()`, para que `/analizar` no repita búsquedas en
Planetary Computer.

- `pendiente_mapa` y `cultivo_mapa`: `CapaRaster` (plan de armonización §5) sobre la grilla común
  del lote, tal como los arman `elevacion.py` y `cobertura.py`. `grilla`: {bounds, ancho, alto, paso},
  la misma para todas las capas, para que el front verifique que todo coincide.

- `ndvi_mensual[12]`: la escena de cada mes ({coleccion, item, fecha, mapa}). `mapa` es el
  `CapaRaster` del NDVI de esa escena sobre la grilla común (paso 4): el front lo dibuja tal cual.
  Un mes con escena HLS y sin raster lleva `mapa: None` (el front puede pedir las teselas de
  Planetary Computer con ese `item`). Un mes con MODIS de respaldo aparece solo si tiene raster
  (sus teselas de PC no sirven con la expresión de HLS). Un mes sin nada va en `None`: el front
  muestra ahí la capa MODIS de GIBS de esa fecha, como el prototipo.
- `erosion` y `erosion_mapa` (paso 5): por píxel, pendiente del píxel × meses con cobertura baja
  (NDVI < umbral) del píxel, sobre la grilla común. El valor del lote es la **media de la capa dentro
  del lote**: se ve dónde está el riesgo y el número cierra con el mapa. Si falta alguno de los dos
  rasters, el valor sale como antes (pendiente general × meses bajos del lote) y no hay capa. Es un
  valor con forma de `Indicador` + el detalle para la línea de tiempo. Es un índice relativo: no es
  pérdida de suelo (t/ha).
"""
from __future__ import annotations

import concurrent.futures as cf
import sys
import time

import numpy as np

from app.satelite import cobertura, elevacion, escalas, grilla, ndvi, raster
from app.satelite.lote import LOTE_EJEMPLO

UNIDAD_EROSION = "% × meses"
RESOLUCION_EROSION = "valor del lote (pendiente 30 m, NDVI 30 m)"
FACTOR_EROSION = 0.01
# Orden de la confianza, de peor a mejor: la del índice es la peor de sus dos datos.
ORDEN_CONFIANZA = ("sin_dato", "baja", "media", "alta")


def _numero(texto: float) -> str:
    return f"{texto:g}".replace(".", ",")


def ndvi_mensual(visto_por_satelite: dict | None, mapas: list | None = None,
                 grilla: dict | None = None) -> list[dict | None]:
    """12 escenas ({coleccion, item, fecha, mapa}) en el mismo orden que `visto_por_satelite.meses`.

    mapas: los `CapaRaster` de `ndvi.calcular()["mapas"]` (índice 0 = enero). Un raster que no está en
    la `grilla` común se descarta.
    """
    meses = (visto_por_satelite or {}).get("meses") or []
    mapas = mapas if isinstance(mapas, list) else []
    capas: list[dict | None] = []
    for i in range(12):
        m = meses[i] if i < len(meses) else None
        mapa = mapas[i] if i < len(mapas) else None
        if mapa and not (grilla and _misma_grilla(mapa, grilla)):
            mapa = None
        if not (m and m.get("item") and m.get("fecha")):
            capas.append(None)
            continue
        hls = str(m.get("coleccion", "")).startswith("hls2-")
        if hls or mapa:
            capas.append({"coleccion": m["coleccion"], "item": m["item"], "fecha": m["fecha"], "mapa": mapa})
        else:
            capas.append(None)
    return capas


def erosion(visto_por_satelite: dict | None, cobertura_baja: dict | None,
            pendiente: dict | None) -> dict | None:
    """Valor del lote: pendiente general (%) × meses con NDVI bajo. None si falta alguno de los dos.

    Es el método de respaldo: con los dos rasters, `erosion_por_pixel` lo reemplaza.
    """
    pendiente = pendiente or {}
    cobertura_baja = cobertura_baja or {}
    pend, meses_bajos = pendiente.get("valor"), cobertura_baja.get("valor")
    if pend is None or meses_bajos is None:
        return None

    visto = visto_por_satelite or {}
    umbral = visto.get("umbral", ndvi.UMBRAL_NDVI_BAJO)
    meses = visto.get("meses") or []
    # Índices (0 = enero, como `meses`) de los meses con suelo descubierto, para la línea de tiempo.
    indices_bajos = [i for i, m in enumerate(meses) if m and m.get("ndvi_medio") is not None
                     and m["ndvi_medio"] < umbral]
    confianzas = [pendiente.get("confianza", "sin_dato"), cobertura_baja.get("confianza", "sin_dato")]
    confianza = min(confianzas, key=lambda c: ORDEN_CONFIANZA.index(c) if c in ORDEN_CONFIANZA else 0)

    return {
        "valor": round(pend * meses_bajos, 1),
        "unidad": UNIDAD_EROSION,
        "fuente": f"Pendiente: {pendiente.get('fuente')} · Cobertura: {cobertura_baja.get('fuente')}",
        "anios": cobertura_baja.get("anios"),
        "resolucion": RESOLUCION_EROSION,
        "confianza": confianza,
        "nota": (f"Pendiente general {_numero(pend)} % × {meses_bajos} meses con NDVI medio < "
                 f"{_numero(umbral)} en la campaña {cobertura_baja.get('anios')}. Índice relativo para "
                 "comparar lotes y meses: no es pérdida de suelo (t/ha)"),
        "pendiente_pct": pend,
        "meses_cobertura_baja": meses_bajos,
        "meses_bajos": indices_bajos,
        "metodo": "lote",
    }


def _decodificar(capa: dict) -> np.ndarray:
    return raster.descuantizar(capa["valores"], capa["factor"], capa["nodata"], capa["alto"], capa["ancho"])


def erosion_por_pixel(base: dict | None, pendiente_mapa: dict | None, meses_bajos_mapa: dict | None,
                      grilla_lote: dict | None) -> tuple[dict | None, dict | None, str | None]:
    """(erosion, erosion_mapa, motivo): pendiente del píxel × meses bajos del píxel, y su media.

    base: el `erosion()` del lote (para la fuente, los años y la línea de tiempo). Si falta algo,
    devuelve (base, None, motivo). Nunca lanza.
    """
    if not base:
        return base, None, "Sin pendiente o sin NDVI del lote"
    capas_px = (pendiente_mapa, meses_bajos_mapa)
    if not all(c and c.get("valores") for c in capas_px) or not grilla_lote:
        return base, None, "Faltan la pendiente o los meses bajos por píxel sobre la grilla"
    if not all(_misma_grilla(c, grilla_lote) for c in capas_px):
        return base, None, "La pendiente y los meses bajos por píxel no están en la misma grilla"
    try:
        g = grilla.desde_dict(grilla_lote)
        ero = _decodificar(pendiente_mapa) * _decodificar(meses_bajos_mapa)
        validos = np.isfinite(ero)          # fuera del lote los dos rasters vienen en nodata
        orden = ORDEN_CONFIANZA
        confianza = min((base["confianza"], pendiente_mapa.get("confianza", "sin_dato"),
                         meses_bajos_mapa.get("confianza", "sin_dato")),
                        key=lambda c: orden.index(c) if c in orden else 0)
        res = raster.resumen(ero, validos, decimales=1)
        if res is None:
            return base, None, "Sin píxeles con pendiente y NDVI a la vez"
        nota = (f"Media dentro del lote de pendiente del píxel × meses con NDVI < "
                f"{_numero(ndvi.UMBRAL_NDVI_BAJO)} del píxel ({res['pixeles']} píxeles de la grilla de "
                f"{g.resolucion}, campaña {base.get('anios')}). Índice relativo para comparar lotes, "
                "zonas del lote y meses: no es pérdida de suelo (t/ha). Escala de clases propuesta, a "
                "validar por la persona 3")
        mapa = raster.capa(
            id="erosion", titulo="Riesgo de erosión (índice)", unidad=UNIDAD_EROSION, fuente=base["fuente"],
            resolucion_nativa="30 m (pendiente NASADEM × NDVI HLS)", grilla=g, array=ero, mascara=validos,
            escala=escalas.EROSION, factor=FACTOR_EROSION, confianza=confianza, nota=nota,
            campana=base.get("anios"), decimales=1, valor_lote=res["media"])
    except Exception as e:  # noqa: BLE001 — nunca propagar: queda el valor del lote
        return base, None, f"No se pudo armar la erosión por píxel ({type(e).__name__})"
    if mapa is None:
        return base, None, "Sin píxeles con pendiente y NDVI a la vez"
    por_pixel = {**base, "valor": res["media"], "confianza": confianza,
                 "resolucion": f"media por píxel en la grilla de {g.resolucion}; pendiente y NDVI a 30 m",
                 "nota": nota, "metodo": "por_pixel", "valor_con_pendiente_general": base["valor"]}
    return por_pixel, mapa, None


def _misma_grilla(capa: dict, grilla: dict) -> bool:
    return (capa.get("bounds") == grilla.get("bounds") and capa.get("ancho") == grilla.get("ancho")
            and capa.get("alto") == grilla.get("alto"))


def rasters(resultado_elevacion: dict | None, resultado_cobertura: dict | None,
            grilla_ndvi: dict | None = None) -> dict:
    """{pendiente_mapa, cultivo_mapa, grilla} y los que faltan. Una capa que no está en la grilla común se descarta."""
    elev, cob = resultado_elevacion or {}, resultado_cobertura or {}
    grilla = elev.get("grilla") or cob.get("grilla") or grilla_ndvi
    salida: dict = {"pendiente_mapa": None, "cultivo_mapa": None, "grilla": grilla, "faltan": []}
    for clave, resultado, pasado in (("pendiente_mapa", elev, resultado_elevacion is not None),
                                     ("cultivo_mapa", cob, resultado_cobertura is not None)):
        mapa = resultado.get("mapa")
        if mapa and grilla and _misma_grilla(mapa, grilla):
            salida[clave] = mapa
        elif pasado:  # si el servicio no pasó el resultado, la capa no se pidió: no "falta"
            salida["faltan"].append(clave)
    return salida


def armar(resultado_ndvi: dict | None, resultado_elevacion: dict | None,
          resultado_cobertura: dict | None = None) -> dict:
    """Capas del mapa a partir de lo que ya calcularon `ndvi`, `elevacion` y `cobertura`. Nunca lanza."""
    resultado_ndvi = resultado_ndvi if isinstance(resultado_ndvi, dict) else {}
    try:
        r = rasters(resultado_elevacion, resultado_cobertura, resultado_ndvi.get("grilla"))
    except Exception:  # noqa: BLE001
        r = {"pendiente_mapa": None, "cultivo_mapa": None, "grilla": None, "faltan": ["pendiente_mapa"]}
    try:
        visto = resultado_ndvi.get("visto_por_satelite")
        capas = {
            "ndvi_mensual": ndvi_mensual(visto, resultado_ndvi.get("mapas"), r["grilla"]),
            "erosion": erosion(visto, resultado_ndvi.get("meses_cobertura_baja"),
                               (resultado_elevacion or {}).get("pendiente_general")),
        }
    except Exception:  # noqa: BLE001 — nunca propagar
        capas = {"ndvi_mensual": [None] * 12, "erosion": None}
    capas["erosion"], capas["erosion_mapa"], motivo_erosion = erosion_por_pixel(
        capas["erosion"], r.get("pendiente_mapa"), resultado_ndvi.get("meses_bajos_mapa"), r.get("grilla"))
    capas["erosion_motivo"] = motivo_erosion
    capas["no_disponibles"] = [] if capas["erosion"] else ["erosion"]
    # La capa se pidió solo si `ndvi` ya devuelve los meses bajos por píxel (paso 5).
    if capas["erosion"] and not capas["erosion_mapa"] and "meses_bajos_mapa" in resultado_ndvi:
        capas["no_disponibles"].append("erosion_mapa")
    if not any(capas["ndvi_mensual"]):
        capas["no_disponibles"].append("ndvi_mensual")
    elif "mapas" in resultado_ndvi and not any(c and c.get("mapa") for c in capas["ndvi_mensual"]):
        capas["no_disponibles"].append("ndvi_mapa")  # hay escenas pero ningún raster sobre la grilla
    capas["no_disponibles"] += r.pop("faltan")
    capas.update(r)
    return capas


def calcular(poligono: dict) -> dict:
    """Corre `ndvi`, `elevacion` y `cobertura` en paralelo y arma las capas (uso suelto y demo).

    En `/analizar` conviene `armar()` con los resultados que el servicio ya tiene.
    """
    with cf.ThreadPoolExecutor(max_workers=3) as pool:
        f_ndvi = pool.submit(ndvi.calcular, poligono)
        f_elev = pool.submit(elevacion.calcular, poligono)
        f_cob = pool.submit(cobertura.calcular, poligono)
        return armar(f_ndvi.result(), f_elev.result(), f_cob.result())


def _corto(capa: dict | None) -> dict | None:
    """La capa sin el PNG ni los valores (para imprimirla)."""
    if not capa:
        return capa
    return {k: (f"<{len(v)} caracteres en base64>" if k in ("png", "valores") else v) for k, v in capa.items()}


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t0 = time.perf_counter()
    resultado = calcular(poligono)
    for clave in ("pendiente_mapa", "cultivo_mapa", "erosion_mapa"):
        resultado[clave] = _corto(resultado.get(clave))
    for mes in resultado["ndvi_mensual"]:
        if mes and mes.get("mapa"):
            mes["mapa"] = _corto(mes["mapa"])
    sys.stdout.reconfigure(encoding="utf-8")  # ″ y – en la consola de Windows
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t0:.1f} s", file=sys.stderr)
