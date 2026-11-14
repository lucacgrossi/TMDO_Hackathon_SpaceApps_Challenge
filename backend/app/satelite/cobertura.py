"""¿El lote es un lote agrícola? Fuente: ESA WorldCover 2021 v200 en Planetary Computer (10 m).

Cuenta los píxeles de cada clase de cobertura dentro del polígono y devuelve el % de cultivo
(clase 40). Si queda por debajo del umbral, el aviso pide marcar un lote de campo.
WorldCover no es de NASA: se usa solo para validar el lote, no entra en ningún puntaje.

Plan de armonización (§4): las clases se cuentan sobre la **grilla común del lote** (`grilla.py`,
1″ ≈ 30 m; cada píxel toma la clase mayoritaria de los de 10 m con `resampling=mode`) y con su
máscara, y la capa de cultivo (`mapa`, `CapaRaster`) sale del mismo raster: el % de la tabla es
la media de la capa. Si el raster falla, el % sale de `item/statistics` (10 m) y no hay capa.
"""
from __future__ import annotations

import sys
import time

import numpy as np

from app.satelite import escalas, grilla, pc, raster
from app.satelite.lote import LOTE_EJEMPLO

COLECCION = "esa-worldcover"
ASSET = "map"
ANIO = "2021"
VERSION_ID = "2021_v200"      # el STAC también trae 2020 v100: usamos la versión más nueva
FUENTE = "ESA WorldCover 2021 v200, vía Planetary Computer"
RESOLUCION = "10 m"
UNIDAD = "%"
RESAMPLING = "mode"           # clase mayoritaria de los píxeles de 10 m (verificado el 14/11 en item/bbox)
FACTOR_CAPA = 1.0             # la capa vale 0 o 100 por píxel

CLASE_CULTIVO = 40
# % mínimo de cultivo para tomar el polígono como lote agrícola. A validar con la persona 3.
UMBRAL_AGRICOLA_PCT = 50.0

# Leyenda oficial de ESA WorldCover (códigos del asset `map`).
CLASES = {
    10: "Árboles",
    20: "Arbustal",
    30: "Pastizal",
    40: "Cultivo",
    50: "Construido",
    60: "Suelo desnudo o vegetación escasa",
    70: "Nieve y hielo",
    80: "Agua permanente",
    90: "Humedal herbáceo",
    95: "Manglar",
    100: "Musgo y liquen",
}


def _sin_dato(motivo: str) -> dict:
    return {
        "cultivo_pct": {"valor": None, "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIO,
                        "resolucion": RESOLUCION, "confianza": "sin_dato", "motivo": motivo},
        "es_agricola": None,   # sin dato no se bloquea el análisis: va a "Información que falta"
        "clase_principal": None,
        "clases": [],
        "aviso": None,
        "mapa": None,
        "grilla": None,
        "mapa_motivo": motivo,
    }


def _nombre(codigo: int) -> str:
    return CLASES.get(codigo, f"Clase {codigo}")


def _items(poligono: dict) -> list[dict]:
    return [i for i in pc.buscar(COLECCION, poligono, fechas=f"{ANIO}-01-01/{ANIO}-12-31", limite=10)
            if VERSION_ID in i["id"]]


def _en_grilla(poligono: dict, items: list[dict]) -> tuple[grilla.Grilla, np.ndarray, np.ndarray]:
    """(grilla, máscara del lote, clase de WorldCover por píxel con NaN sin dato). Lanza si falla."""
    g = grilla.crear(poligono)
    adentro = grilla.mascara(g, poligono)
    clase = np.full((g.alto, g.ancho), np.nan)
    for item in items:  # más de uno solo si el lote cruza el borde de una tesela de 3°
        parte = pc.raster_en_grilla(COLECCION, item["id"], g, assets=ASSET, resampling=RESAMPLING)
        clase = np.where(np.isnan(clase), parte, clase)
    return g, adentro, clase


def _conteo_estadisticas(poligono: dict, items: list[dict]) -> dict[int, int]:
    """Respaldo: píxeles de 10 m por clase con `item/statistics` (sin capa)."""
    conteo: dict[int, int] = {}
    for item in items:
        stats = pc.estadisticas(COLECCION, item["id"], poligono, assets=ASSET, categorico=True)
        cantidades, clases = stats.get("histogram") or ([], [])
        for cant, clase in zip(cantidades, clases):
            conteo[int(clase)] = conteo.get(int(clase), 0) + int(cant)
    return conteo


def _capa(g: grilla.Grilla, adentro: np.ndarray, clase: np.ndarray, cultivo: float) -> dict:
    """{mapa, grilla, mapa_motivo} de la capa de cultivo (100 = cultivo, 0 = otra clase). Nunca lanza."""
    try:
        valores = np.where(np.isnan(clase), np.nan, np.where(clase == CLASE_CULTIVO, 100.0, 0.0))
        nota = (f"Clase mayoritaria de ESA WorldCover {ANIO} (10 m) en cada píxel de la grilla; "
                "100 = cultivo, 0 = otra cobertura. La media dentro del lote es el % de cultivo")
        if g.nota:
            nota += f". {g.nota}"
        mapa = raster.capa(
            id="cultivo", titulo="Cultivo (ESA WorldCover)", unidad=UNIDAD, fuente=FUENTE,
            resolucion_nativa=RESOLUCION, grilla=g, array=valores, mascara=adentro,
            escala=escalas.CULTIVO, factor=FACTOR_CAPA, confianza="alta", nota=nota, fecha=ANIO,
            decimales=1, valor_lote=cultivo)
    except Exception as e:  # noqa: BLE001 — la capa nunca rompe el valor del lote
        return {"mapa": None, "grilla": g.a_dict(), "mapa_motivo": f"No se pudo armar la capa ({type(e).__name__})"}
    return {"mapa": mapa, "grilla": g.a_dict(),
            "mapa_motivo": None if mapa else "WorldCover no tiene píxeles dentro del lote"}


def calcular(poligono: dict) -> dict:
    """poligono: GeoJSON Polygon en [lon, lat].

    Devuelve {cultivo_pct: Indicador, es_agricola: bool | None,
              clase_principal: {codigo, nombre, pct} | None,
              clases: [{codigo, nombre, pct}] (de mayor a menor), aviso: str | None,
              mapa: CapaRaster | None, grilla: {bounds, ancho, alto, paso} | None, mapa_motivo: str | None}.
    """
    try:
        items = _items(poligono)
        if not items:
            return _sin_dato("ESA WorldCover no tiene datos para el lote")
    except pc.ErrorPC as e:
        return _sin_dato(f"No se pudo consultar ESA WorldCover: {e}")
    except Exception as e:  # noqa: BLE001 — nunca propagar: va a "Información que falta"
        return _sin_dato(f"No se pudo calcular la cobertura del suelo ({type(e).__name__})")

    # 1) Sobre la grilla común (el % y la capa salen del mismo raster)
    en_grilla = None
    try:
        g, adentro, clase = _en_grilla(poligono, items)
        sel = adentro & np.isfinite(clase)
        codigos, cantidades = np.unique(clase[sel].astype(int), return_counts=True)
        conteo = {int(c): int(n) for c, n in zip(codigos, cantidades)}
        if conteo:
            en_grilla = (g, adentro, clase)
        else:
            motivo_grilla = "WorldCover no tiene píxeles dentro del lote en la grilla"
    except pc.ErrorPC as e:
        motivo_grilla = str(e)
    except Exception as e:  # noqa: BLE001
        motivo_grilla = f"error inesperado ({type(e).__name__})"

    # 2) Respaldo: estadísticas de 10 m sobre el polígono, sin capa
    if en_grilla is None:
        try:
            conteo = _conteo_estadisticas(poligono, items)
        except pc.ErrorPC as e:
            return _sin_dato(f"No se pudo consultar ESA WorldCover: {e}")
        except Exception as e:  # noqa: BLE001
            return _sin_dato(f"No se pudo calcular la cobertura del suelo ({type(e).__name__})")

    total = sum(conteo.values())
    if total == 0:
        return _sin_dato("ESA WorldCover no tiene píxeles válidos dentro del lote")

    clases = sorted(
        ({"codigo": c, "nombre": _nombre(c), "pct": round(100 * n / total, 1)} for c, n in conteo.items()),
        key=lambda x: x["pct"], reverse=True,
    )
    cultivo = round(100 * conteo.get(CLASE_CULTIVO, 0) / total, 1)
    es_agricola = cultivo >= UMBRAL_AGRICOLA_PCT
    principal = clases[0]
    aviso = None
    if not es_agricola:
        aviso = (f"Marcá un lote de campo: según ESA WorldCover {ANIO}, el {principal['pct']:.0f} % "
                 f"del polígono es {principal['nombre'].lower()} y solo el {cultivo:.0f} % es cultivo.")
    if en_grilla:
        g = en_grilla[0]
        resolucion = f"{RESOLUCION}, clase mayoritaria en la grilla de {g.resolucion}"
        nota = (f"{conteo.get(CLASE_CULTIVO, 0)} de {total} píxeles de la grilla de {g.resolucion} dentro "
                "del lote son cultivo")
        mapa = _capa(*en_grilla, cultivo)
    else:
        resolucion = RESOLUCION
        nota = (f"{conteo.get(CLASE_CULTIVO, 0)} de {total} píxeles de 10 m dentro del lote son cultivo "
                f"(sin capa: la grilla falló, {motivo_grilla})")
        mapa = {"mapa": None, "grilla": None, "mapa_motivo": f"Sin capa de cultivo: {motivo_grilla}"}
    return {
        "cultivo_pct": {
            "valor": cultivo, "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIO,
            "resolucion": resolucion, "confianza": "alta", "nota": nota,
        },
        "es_agricola": es_agricola,
        "clase_principal": principal,
        "clases": clases,
        "aviso": aviso,
        **mapa,
    }


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t = time.perf_counter()
    r = calcular(poligono)
    if r.get("mapa"):
        r["mapa"] = {k: (f"<{len(v)} caracteres>" if k in ("png", "valores") else v) for k, v in r["mapa"].items()}
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t:.1f} s")
