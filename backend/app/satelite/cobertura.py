"""¿El lote es un lote agrícola? Fuente: ESA WorldCover 2021 v200 en Planetary Computer (10 m).

Cuenta los píxeles de cada clase de cobertura dentro del polígono y devuelve el % de cultivo
(clase 40). Si queda por debajo del umbral, el aviso pide marcar un lote de campo.
WorldCover no es de NASA: se usa solo para validar el lote, no entra en ningún puntaje.
"""
from __future__ import annotations

import sys
import time

from app.satelite import pc
from app.satelite.lote import LOTE_EJEMPLO

COLECCION = "esa-worldcover"
ASSET = "map"
ANIO = "2021"
VERSION_ID = "2021_v200"      # el STAC también trae 2020 v100: usamos la versión más nueva
FUENTE = "ESA WorldCover 2021 v200, vía Planetary Computer"
RESOLUCION = "10 m"
UNIDAD = "%"

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
    }


def _nombre(codigo: int) -> str:
    return CLASES.get(codigo, f"Clase {codigo}")


def calcular(poligono: dict) -> dict:
    """poligono: GeoJSON Polygon en [lon, lat].

    Devuelve {cultivo_pct: Indicador, es_agricola: bool | None,
              clase_principal: {codigo, nombre, pct} | None,
              clases: [{codigo, nombre, pct}] (de mayor a menor), aviso: str | None}.
    """
    try:
        items = [i for i in pc.buscar(COLECCION, poligono, fechas=f"{ANIO}-01-01/{ANIO}-12-31", limite=10)
                 if VERSION_ID in i["id"]]
        if not items:
            return _sin_dato("ESA WorldCover no tiene datos para el lote")
        conteo: dict[int, int] = {}
        for item in items:  # más de uno solo si el lote cruza el borde de una tesela de 3°
            stats = pc.estadisticas(COLECCION, item["id"], poligono, assets=ASSET, categorico=True)
            cantidades, clases = stats.get("histogram") or ([], [])
            for cant, clase in zip(cantidades, clases):
                conteo[int(clase)] = conteo.get(int(clase), 0) + int(cant)
        total = sum(conteo.values())
        if total == 0:
            return _sin_dato("ESA WorldCover no tiene píxeles válidos dentro del lote")
    except pc.ErrorPC as e:
        return _sin_dato(f"No se pudo consultar ESA WorldCover: {e}")
    except Exception as e:  # noqa: BLE001 — nunca propagar: va a "Información que falta"
        return _sin_dato(f"No se pudo calcular la cobertura del suelo ({type(e).__name__})")

    clases = sorted(
        ({"codigo": c, "nombre": _nombre(c), "pct": round(100 * n / total, 1)} for c, n in conteo.items()),
        key=lambda x: x["pct"], reverse=True,
    )
    cultivo = 100 * conteo.get(CLASE_CULTIVO, 0) / total
    es_agricola = cultivo >= UMBRAL_AGRICOLA_PCT
    principal = clases[0]
    aviso = None
    if not es_agricola:
        aviso = (f"Marcá un lote de campo: según ESA WorldCover {ANIO}, el {principal['pct']:.0f} % "
                 f"del polígono es {principal['nombre'].lower()} y solo el {cultivo:.0f} % es cultivo.")
    return {
        "cultivo_pct": {
            "valor": round(cultivo, 1), "unidad": UNIDAD, "fuente": FUENTE, "anios": ANIO,
            "resolucion": RESOLUCION, "confianza": "alta",
            "nota": f"{conteo.get(CLASE_CULTIVO, 0)} de {total} píxeles de 10 m dentro del lote son cultivo",
        },
        "es_agricola": es_agricola,
        "clase_principal": principal,
        "clases": clases,
        "aviso": aviso,
    }


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    t = time.perf_counter()
    print(json.dumps(calcular(poligono), ensure_ascii=False, indent=2))
    print(f"Tiempo: {time.perf_counter() - t:.1f} s")
