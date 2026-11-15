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
# A también pasa a centeno si el invierno de los años secos es corto de lluvia (LLUVIA_INVIERNO_SECO_MM):
# en años secos la vicia consume más agua que el centeno (INTA Manfredi).
INVIERNO_COMERCIAL = ("trigo", "cebada")
# Verano de 2ª (después de trigo o cebada): de diciembre a abril, los meses de la soja de 2ª del catálogo.
VERANO_DE_SEGUNDA = tuple(C["soja2"]["meses"])


def calendario(verano: str, invierno: str | None) -> list[str]:
    """12 meses (índice 0 = enero) sin solapamientos entre el invierno y el verano.

    - Después de trigo o cebada, el cultivo de invierno conserva su ciclo completo (junio a noviembre) y
      el verano va de 2ª: se siembra en diciembre, después de la cosecha, y ocupa de diciembre a abril
      (`VERANO_DE_SEGUNDA`). La soja pasa a "soja2"; maíz, girasol, sorgo y maní conservan su clave (el
      contrato no tiene "maíz de 2ª") con esos meses, y `plantillas.py` lo dice en "Por qué aparece".
    - Una cobertura (vicia o centeno) se seca un mes antes de la siembra de verano: ese mes queda en
      barbecho (el secado de ~30 días que nombra "A revisar con el agrónomo").
    """
    cal = [BARBECHO] * 12
    if invierno in INVIERNO_COMERCIAL:
        v, meses_v = ("soja2" if verano == "soja" else verano), list(VERANO_DE_SEGUNDA)
    else:
        v, meses_v = verano, list(C[verano]["meses"])
    if invierno and invierno != BARBECHO:
        meses_inv = C[invierno]["meses"]
        if C[invierno]["grupo"] == "cobertura":
            secado = (meses_v[0] - 1) % 12
            meses_inv = [m for m in meses_inv if m not in meses_v and m != secado]
        for m in meses_inv:
            cal[m] = invierno
    for m in meses_v:
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

    # A · cobertura de invierno: vicia (nitrógeno) si el suelo pesa al menos como la erosión, el
    # lote es plano y el invierno de los años secos no es corto de lluvia; si no, centeno (más
    # rastrojo y gasta menos agua). Si ya hace esa cobertura, se prueba la otra.
    invierno_corto = lluvia_inv_seco < LLUVIA_INVIERNO_SECO_MM
    opciones = ["vicia", "centeno"] if w["suelo"] >= w["erosion"] and pendiente <= PENDIENTE_VICIA_MAX \
        and not invierno_corto else ["centeno", "vicia"]
    if inv in opciones:
        opciones = [x for x in opciones if x != inv] + [inv]
    cob = _elegir(opciones, no)
    lista.append({"id": "A", "k": "A", "nombre": "Cobertura de invierno",
                  "especies": f"{nombre(ver)} + {nombre(cob).lower()}" if cob else "",
                  "calendario": calendario(ver, cob) if cob else None, "on": bool(cob),
                  "motivo": "" if cob else _ni(["vicia", "centeno"]),
                  "eleccion": (f"{nombre(cob)}: prioridad suelo {w['suelo']} y erosión {w['erosion']}, "
                               f"pendiente {dec(pendiente)} %, lluvia de invierno en años secos "
                               f"{lluvia_inv_seco:.0f} mm") if cob else ""})

    # B · cultivo de invierno comercial + soja de 2ª, sea cual sea el verano actual (CLAUDE.md, tabla de
    # las 4 columnas): cebada (gasta menos agua) si el agua pesa 4 o más o si el invierno de los años
    # secos es corto de lluvia; si no, trigo. Si ya hace ese cultivo de invierno, se prueba el otro.
    corto = lluvia_inv_seco < LLUVIA_INVIERNO_SECO_MM
    opciones = ["cebada", "trigo"] if w["agua"] >= 4 or corto else ["trigo", "cebada"]
    if inv in opciones:
        opciones = [x for x in opciones if x != inv] + [inv]
    win = _elegir(opciones, no)
    eleccion_b = ""
    if win:
        eleccion_b = (f"{nombre(win)}: prioridad agua {w['agua']}, lluvia de invierno en años secos "
                      f"{lluvia_inv_seco:.0f} mm")
        if inv in INVIERNO_COMERCIAL and win != inv:
            eleccion_b += f"; tu rotación ya tiene {nombre(inv).lower()}"
    lista.append({"id": "B", "k": "B", "nombre": "Cultivo de invierno comercial",
                  "especies": f"{nombre(win)} + {nombre('soja2').lower()}" if win else "",
                  "calendario": calendario("soja", win) if win else None, "on": bool(win),
                  "motivo": "" if win else _ni(["trigo", "cebada"]),
                  "eleccion": eleccion_b})

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
