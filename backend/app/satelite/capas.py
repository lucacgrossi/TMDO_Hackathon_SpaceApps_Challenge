"""Capas del mapa del lote: escena NDVI de cada mes, riesgo de erosión y rasters (`salida.capas`).

No hace pedidos propios: arma las capas con lo que ya devolvieron `ndvi.calcular()`,
`elevacion.calcular()` y `cobertura.calcular()`, para que `/analizar` no repita búsquedas en
Planetary Computer.

- `pendiente_mapa` y `cultivo_mapa`: `CapaRaster` (plan de armonización §5) sobre la grilla común
  del lote, tal como los arman `elevacion.py` y `cobertura.py`. `grilla`: {bounds, ancho, alto, paso},
  la misma para todas las capas, para que el front verifique que todo coincide.

- `ndvi_mensual[12]`: la escena HLS de cada mes (colección, item, fecha), para que el front pida
  las teselas de Planetary Computer sin buscar de nuevo. Un mes sin escena HLS (MODIS de respaldo
  o sin dato) va en `None`: el front muestra ahí la capa MODIS de GIBS, como el prototipo.
- `erosion`: pendiente general del lote × meses con cobertura baja (NDVI < umbral). Es un valor
  del lote con forma de `Indicador` + el detalle para la línea de tiempo. **Formato propuesto,
  a acordar con Front 1 (PLAN.md §6).** Es un índice relativo: no es pérdida de suelo (t/ha).
"""
from __future__ import annotations

import concurrent.futures as cf
import sys
import time

from app.satelite import cobertura, elevacion, ndvi
from app.satelite.lote import LOTE_EJEMPLO

UNIDAD_EROSION = "% × meses"
RESOLUCION_EROSION = "valor del lote (pendiente 30 m, NDVI 30 m)"
# Orden de la confianza, de peor a mejor: la del índice es la peor de sus dos datos.
ORDEN_CONFIANZA = ("sin_dato", "baja", "media", "alta")


def _numero(texto: float) -> str:
    return f"{texto:g}".replace(".", ",")


def ndvi_mensual(visto_por_satelite: dict | None) -> list[dict | None]:
    """12 escenas HLS ({coleccion, item, fecha}) en el mismo orden que `visto_por_satelite.meses`."""
    meses = (visto_por_satelite or {}).get("meses") or []
    capas: list[dict | None] = []
    for i in range(12):
        m = meses[i] if i < len(meses) else None
        if m and str(m.get("coleccion", "")).startswith("hls2-") and m.get("item") and m.get("fecha"):
            capas.append({"coleccion": m["coleccion"], "item": m["item"], "fecha": m["fecha"]})
        else:
            capas.append(None)
    return capas


def erosion(visto_por_satelite: dict | None, cobertura_baja: dict | None,
            pendiente: dict | None) -> dict | None:
    """Pendiente general (%) × meses con NDVI bajo. None si falta alguno de los dos datos."""
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
    }


def _misma_grilla(capa: dict, grilla: dict) -> bool:
    return (capa.get("bounds") == grilla.get("bounds") and capa.get("ancho") == grilla.get("ancho")
            and capa.get("alto") == grilla.get("alto"))


def rasters(resultado_elevacion: dict | None, resultado_cobertura: dict | None) -> dict:
    """{pendiente_mapa, cultivo_mapa, grilla} y los que faltan. Una capa que no está en la grilla común se descarta."""
    elev, cob = resultado_elevacion or {}, resultado_cobertura or {}
    grilla = elev.get("grilla") or cob.get("grilla")
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
    try:
        resultado_ndvi = resultado_ndvi or {}
        visto = resultado_ndvi.get("visto_por_satelite")
        capas = {
            "ndvi_mensual": ndvi_mensual(visto),
            "erosion": erosion(visto, resultado_ndvi.get("meses_cobertura_baja"),
                               (resultado_elevacion or {}).get("pendiente_general")),
        }
    except Exception:  # noqa: BLE001 — nunca propagar
        capas = {"ndvi_mensual": [None] * 12, "erosion": None}
    try:
        r = rasters(resultado_elevacion, resultado_cobertura)
    except Exception:  # noqa: BLE001
        r = {"pendiente_mapa": None, "cultivo_mapa": None, "grilla": None, "faltan": ["pendiente_mapa"]}
    capas["no_disponibles"] = [] if capas["erosion"] else ["erosion"]
    if not any(capas["ndvi_mensual"]):
        capas["no_disponibles"].append("ndvi_mensual")
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
    for clave in ("pendiente_mapa", "cultivo_mapa"):
        resultado[clave] = _corto(resultado.get(clave))
    sys.stdout.reconfigure(encoding="utf-8")  # ″ y – en la consola de Windows
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t0:.1f} s", file=sys.stderr)
