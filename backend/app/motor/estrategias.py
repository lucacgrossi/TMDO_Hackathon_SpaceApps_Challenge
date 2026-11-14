"""Las 4 columnas fijas (actual, A, B y C) y su calendario de 12 meses.

Siempre son 4 (principio "Estandarizado"). Las prioridades del productor eligen la especie de cada
alternativa; `no_sembrar` puede descartar una columna, que vuelve con `on: False` y el motivo
(el front la pinta en gris).
"""
from __future__ import annotations

from app.motor.cultivos import BARBECHO, C, dec, nombre

# Meses de invierno (mayo a octubre) y de verano (noviembre a marzo), índice 0 = enero.
MESES_INVIERNO = (4, 5, 6, 7, 8, 9)
MESES_VERANO = (10, 11, 0, 1, 2)
# Lluvia de un año seco por debajo de la cual la alternativa elige la especie que gasta menos agua.
LLUVIA_INVIERNO_SECO_MM = 100   # B: cebada en vez de trigo
LLUVIA_VERANO_SECO_MM = 400     # C: sorgo en vez de girasol
PENDIENTE_VICIA_MAX = 3.0       # A: con más pendiente, centeno (más rastrojo)


def calendario(verano: str, invierno: str | None) -> list[str]:
    """12 meses (índice 0 = enero). Primero el invierno; el verano pisa los meses que se superponen.

    Después de trigo o cebada, la soja pasa a soja de 2ª.
    """
    cal = [BARBECHO] * 12
    if invierno and invierno != BARBECHO:
        for m in C[invierno]["meses"]:
            cal[m] = invierno
    v = "soja2" if verano == "soja" and invierno in ("trigo", "cebada") else verano
    for m in C[v]["meses"]:
        cal[m] = v
    return cal


def _elegir(opciones: list[str], no_sembrar: set[str]) -> str | None:
    return next((x for x in opciones if x not in no_sembrar), None)


def _ni(opciones: list[str]) -> str:
    return "No sembrar " + " ni ".join(nombre(x).lower() for x in opciones)


def armar(entradas: dict, clima: dict, pendiente: float) -> list[dict]:
    """Las 4 columnas, cada una con {id, k, nombre, especies, calendario, on, motivo, eleccion}."""
    w = entradas["pesos"]
    no = set(entradas.get("no_sembrar") or [])
    ver, inv = entradas["verano"], entradas["invierno"]
    seco = clima["terciles"]["seco"]["pp"]
    lluvia_inv_seco = sum(seco[m] for m in MESES_INVIERNO)
    lluvia_ver_seco = sum(seco[m] for m in MESES_VERANO)

    lista = [{"id": "actual", "k": "·", "nombre": "Lo que hacés hoy",
              "especies": f"{nombre(ver)} + {nombre(inv).lower()}",
              "calendario": calendario(ver, inv), "on": True, "motivo": "", "eleccion": ""}]

    # A · cobertura de invierno: vicia (nitrógeno) si el suelo pesa al menos como la erosión y el
    # lote es plano; si no, centeno (más rastrojo). Si ya hace esa cobertura, se prueba la otra.
    opciones = ["vicia", "centeno"] if w["suelo"] >= w["erosion"] and pendiente <= PENDIENTE_VICIA_MAX \
        else ["centeno", "vicia"]
    if inv in opciones:
        opciones = [x for x in opciones if x != inv] + [inv]
    cob = _elegir(opciones, no)
    lista.append({"id": "A", "k": "A", "nombre": "Cobertura de invierno",
                  "especies": f"{nombre(ver)} + {nombre(cob).lower()}" if cob else "",
                  "calendario": calendario(ver, cob) if cob else None, "on": bool(cob),
                  "motivo": "" if cob else _ni(["vicia", "centeno"]),
                  "eleccion": (f"{nombre(cob)}: prioridad suelo {w['suelo']} y erosión {w['erosion']}, "
                               f"pendiente {dec(pendiente)} %") if cob else ""})

    # B · cultivo de invierno comercial: cebada (gasta menos agua) si el agua pesa 4 o más o si el
    # invierno de los años secos es corto de lluvia; si no, trigo.
    corto = lluvia_inv_seco < LLUVIA_INVIERNO_SECO_MM
    opciones = ["cebada", "trigo"] if w["agua"] >= 4 or corto else ["trigo", "cebada"]
    win = _elegir(opciones, no)
    cal_b = calendario(ver, win) if win else None
    ver_b = nombre("soja2" if ver == "soja" else ver).lower()
    lista.append({"id": "B", "k": "B", "nombre": "Cultivo de invierno",
                  "especies": f"{nombre(win)} + {ver_b}" if win else "",
                  "calendario": cal_b, "on": bool(win),
                  "motivo": "" if win else _ni(["trigo", "cebada"]),
                  "eleccion": (f"{nombre(win)}: prioridad agua {w['agua']}, lluvia de invierno en años "
                               f"secos {lluvia_inv_seco:.0f} mm") if win else ""})

    # C · diversificar el verano: sorgo (tolera sequía y calor) si el agua pesa 3 o más o si el
    # verano de los años secos es corto de lluvia; si no, girasol. Nunca repite el verano actual.
    corto = lluvia_ver_seco < LLUVIA_VERANO_SECO_MM
    opciones = [x for x in (["sorgo", "girasol"] if w["agua"] >= 3 or corto else ["girasol", "sorgo"]) if x != ver]
    nuevo = _elegir(opciones, no)
    lista.append({"id": "C", "k": "C", "nombre": "Diversificar el verano",
                  "especies": f"{nombre(nuevo)}, rota con {nombre(ver).lower()}" if nuevo else "",
                  "calendario": calendario(nuevo, inv) if nuevo else None, "on": bool(nuevo),
                  "motivo": "" if nuevo else _ni(["sorgo", "girasol"]),
                  "eleccion": (f"{nombre(nuevo)}: prioridad agua {w['agua']}, lluvia de verano en años "
                               f"secos {lluvia_ver_seco:.0f} mm") if nuevo else ""})
    return lista
