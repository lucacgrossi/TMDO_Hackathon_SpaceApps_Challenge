"""
Motor de reglas de Field Shift (portado del prototipo: strategies, ev, sc, clash).

Fuente: docs/prototipo/field-shift-prototipo.html (v1 y v2 tienen la misma
lógica; se comparó función por función). Cada función de acá dice de qué
línea del prototipo sale y qué cambió. Lo que NO cambia respecto del
prototipo (para que el front dé lo mismo): suelo, erosión, ingreso,
cercanía (`sc`) y choque (`clash`). Lo que SÍ cambia: el agua, que pasa a mm
reales con la ET0 de NASA POWER en vez de `cons*80` y factores fijos.

Son funciones puras: entran las entradas del productor y los indicadores
de NASA, salen 4 columnas (actual, A, B, C). No llaman a ninguna API, así
que se prueban con indicadores inventados (ver tests/test_motor.py).

--- Entradas del productor (pantallas 3 y 4) ---
entradas = {
    "verano": "soja", "invierno": "barbecho", "pasada": "soja",
    "pesos": {"agua": 3, "suelo": 3, "erosion": 3, "ingreso": 3},   # 0 a 5
    "no_sembrar": ["vicia"],
    "maquinaria_limitada": False,
    "anegable": "no",            # "si" | "a_veces" | "no" | "no_se"
    "textura": "franco",         # "arenoso" | "franco" | "arcilloso" | "no_se"
    "materia_organica_pct": None,
}

--- Indicadores (los arma Back 1 desde NASA POWER y Back 2 desde SRTM/MODIS) ---
PROPUESTA: confirmar nombres con Back 1 antes de integrar.
indicadores = {
    # Back 1 ordena las 30 campañas (julio-junio) por balance de agua y las
    # corta en tres grupos iguales (CLAUDE.md, "Incertidumbre"). El prototipo
    # las cortaba por lluvia; al motor le da igual: recibe el promedio de cada grupo.
    "terciles": {
        "seco":   {"pp": [12 mm], "et0": [12 mm], "n": 10},
        "normal": {"pp": [12 mm], "et0": [12 mm], "n": 10},
        "humedo": {"pp": [12 mm], "et0": [12 mm], "n": 10},
    },
    "anios_con_helada": [12],    # en cuántas campañas el mes tuvo mínima < 0 °C
    "anios_con_calor":  [12],    # en cuántas campañas el mes tuvo máxima >= 35 °C
    "n_anios": 30,
    "pendiente_pct": 1.6,        # SRTM / terrarium (None si no llegó)
    "visto_satelite": None,      # opcional: {"meses_pelados", "meses_con_dato", "campania"}
}

Cada regla devuelve aportes {regla, efecto, dato} (trazabilidad, RNF6):
  efecto: {dimension: puntos}; dato: el número y la fuente que lo respaldan.
"""

from app.motor.cultivos import BARBECHO, C, MESES, WIN, nombre

TIPOS = ("seco", "normal", "humedo")
OBJ = ("agua", "suelo", "erosion", "ingreso")
LLUVIA_EFECTIVA = 0.75      # parte de la lluvia que queda para el cultivo (prototipo)
PENDIENTE_DEFECTO = 1.6     # la del lote demo; si se usa, va a "Falta"
UMBRAL_SENSIBLE = 15        # cercanía húmedo - seco para "sensible al clima"


def _clamp(x, a=0, b=100):
    return max(a, min(b, x))


# --- Calendario y estrategias -----------------------------------------------

def calendario(verano, invierno):
    """
    12 meses (ene..dic). Si hay trigo o cebada, la soja pasa a soja de 2ª.
    Prototipo: `cal(summer, winter)`. Primero se pone el invierno y después
    el verano encima: si se pisan (por ejemplo noviembre), gana el verano.
    """
    c = [BARBECHO] * 12
    if invierno != BARBECHO:
        for m in WIN[invierno]:
            c[m] = invierno
    s = "soja2" if invierno in ("trigo", "cebada") and verano == "soja" else verano
    for m in WIN[s]:
        c[m] = s
    return c


def _elegir(opciones, no_sembrar):
    return next((x for x in opciones if x not in no_sembrar), None)


def estrategias(entradas, pendiente):
    """
    Las 4 columnas fijas (principio 9: siempre las mismas estrategias tipo).
    Prototipo: `strategies()`. Una columna descartada por "no sembrar" no
    desaparece: vuelve con on=False y el motivo, y el front la pinta en gris.
    """
    w, no = entradas["pesos"], set(entradas.get("no_sembrar", []))
    ver, inv = entradas["verano"], entradas["invierno"]
    lista = [{"id": "actual", "k": "·", "nombre": "Lo que hacés hoy",
              "especies": f"{nombre(ver)} + {nombre(inv).lower()}",
              "calendario": calendario(ver, inv), "on": True}]

    # A: cobertura. Vicia si pesa más el suelo y el lote es plano; si no, centeno.
    orden = ["vicia", "centeno"] if (w["suelo"] >= w["erosion"] and pendiente <= 3) else ["centeno", "vicia"]
    cob = _elegir(orden, no)
    lista.append({"id": "A", "k": "A", "nombre": "Cobertura de invierno", "cobertura": cob,
                  "especies": f"{nombre(ver)} + {nombre(cob).lower()}" if cob else "",
                  "calendario": calendario(ver, cob) if cob else None,
                  "on": bool(cob), "motivo": "" if cob else "No sembrar vicia ni centeno"})

    # B: cultivo de invierno. Cebada (gasta menos agua) si el agua pesa 4 o más.
    inv_b = _elegir(["cebada", "trigo"] if w["agua"] >= 4 else ["trigo", "cebada"], no)
    lista.append({"id": "B", "k": "B", "nombre": "Cultivo de invierno", "invierno": inv_b,
                  "especies": f"{nombre(inv_b)} + soja 2ª" if inv_b else "",
                  "calendario": calendario("soja", inv_b) if inv_b else None,
                  "on": bool(inv_b), "motivo": "" if inv_b else "No sembrar trigo ni cebada"})

    # C: diversificar el verano. Sorgo (tolera sequía) si el agua pesa 3 o más.
    orden = ["sorgo", "girasol"] if w["agua"] >= 3 else ["girasol", "sorgo"]
    ns = _elegir([x for x in orden if x != ver], no)
    lista.append({"id": "C", "k": "C", "nombre": "Diversificar el verano", "nuevo_verano": ns,
                  "especies": f"{nombre(ns)}, rota con {nombre(ver).lower()}" if ns else "",
                  "calendario": calendario(ns, inv) if ns else None,
                  "on": bool(ns), "motivo": "" if ns else "No sembrar sorgo ni girasol"})
    return lista


# --- Reglas (cada una devuelve aportes con trazabilidad) --------------------

def regla_agua(cal, ind):
    """
    Uso de agua = suma de kc × ET0 de cada mes (FAO-56), por tercil.
    Balance = lluvia efectiva (75 %) − uso. Reemplaza `cons*80` y los
    factores .74 / 1.26 del prototipo por la ET0 y la lluvia reales.
    Puntos: 75 + 75 × balance / lluvia, de 0 a 100 (CALIBRAR con un agrónomo:
    con 100 en vez de 75, casi todo daba 0 en años secos y se perdía la
    diferencia entre columnas).
    """
    aportes = []
    for t in TIPOS:
        ter = ind["terciles"][t]
        uso = sum(C[x]["kc"] * ter["et0"][m] for m, x in enumerate(cal))
        lluvia = sum(ter["pp"])
        balance = LLUVIA_EFECTIVA * lluvia - uso
        pts = 75 + 75 * balance / lluvia if lluvia else 0
        aportes.append({
            "regla": "agua", "tipo": t, "efecto": {"agua": pts},
            "uso_mm": round(uso), "lluvia_mm": round(lluvia), "balance_mm": round(balance),
            "dato": f"Años {t}s: lluvia {lluvia:.0f} mm, uso estimado {uso:.0f} mm "
                    f"(kc × ET0), balance {balance:+.0f} mm · NASA POWER, {ter.get('n', '?')} campañas",
        })
    return aportes


def regla_suelo(cal, entradas):
    """
    Prototipo (`ev`): su = 20 + Σ(nfix + rast) de cada cultivo
                          + 2 × meses cubiertos − 10 si repite el verano.
    Se separa en aportes para que cada punto tenga su dato (trazabilidad).
    """
    cr = [x for x in dict.fromkeys(cal) if x != BARBECHO]
    pelados = cal.count(BARBECHO)
    aportes = [{"regla": "suelo_base", "efecto": {"suelo": 20}, "dato": "Base de la regla"}]
    for x in cr:
        if C[x]["n_fija"]:
            aportes.append({"regla": "nitrogeno", "efecto": {"suelo": C[x]["n_fija"]},
                            "dato": f"{nombre(x)} fija nitrógeno · tabla de cultivos"})
        if C[x]["rastrojo"]:
            aportes.append({"regla": "rastrojo", "efecto": {"suelo": C[x]["rastrojo"]},
                            "dato": f"{nombre(x)} deja rastrojo ({C[x]['rastrojo']}) · tabla de cultivos"})
    aportes.append({"regla": "meses_cubiertos", "efecto": {"suelo": (12 - pelados) * 2},
                    "dato": f"{12 - pelados} meses con cultivo vivo · calendario"})
    verano = next((x for x in cr if C[x]["grupo"] == "verano"), None)
    verano = "soja" if verano == "soja2" else verano
    if verano and verano == entradas.get("pasada"):
        aportes.append({"regla": "repite_cultivo", "efecto": {"suelo": -10},
                        "dato": f"Repite {nombre(verano).lower()} de la campaña pasada"})
    return aportes


def regla_erosion(cal, pendiente):
    """
    Prototipo (`ev`): ero = 100 − pelados × 12 × (0,6 + pendiente / 5)
                           + 20 si el rastrojo total llega a 30.
    La pendiente agranda el castigo de cada mes pelado: más pendiente, más erosión.
    """
    pelados = cal.count(BARBECHO)
    rastrojo = sum(C[x]["rastrojo"] for x in dict.fromkeys(cal) if x != BARBECHO)
    meses = ", ".join(MESES[m] for m, x in enumerate(cal) if x == BARBECHO) or "ninguno"
    aportes = [{"regla": "erosion_base", "efecto": {"erosion": 100}, "dato": "Base de la regla"},
               {"regla": "meses_pelados", "efecto": {"erosion": -pelados * 12 * (0.6 + pendiente / 5)},
                "dato": f"{pelados} meses pelados ({meses}) con pendiente {pendiente:.1f} % · SRTM"}]
    if rastrojo >= 30:
        aportes.append({"regla": "rastrojo_protege", "efecto": {"erosion": 20},
                        "dato": f"Rastrojo total {rastrojo} (≥ 30) · tabla de cultivos"})
    return aportes


def regla_ingreso(cal):
    """
    Prototipo (`ev`): 85 con 2 o más cultivos que se venden, 45 si hay una
    cobertura (cuesta sembrarla y no se cosecha) y 50 en otro caso. Sin precios
    (fuera de alcance): es una escala cualitativa.
    """
    cr = [x for x in dict.fromkeys(cal) if x != BARBECHO]
    comerciales = [x for x in cr if C[x]["comercial"]]
    if len(comerciales) >= 2:
        pts = 85
    elif any(C[x]["grupo"] == "cobertura" for x in cr):
        pts = 45
    else:
        pts = 50
    lista = ", ".join(nombre(x) for x in comerciales) or "ninguno"
    return [{"regla": "ingreso", "efecto": {"ingreso": pts},
             "dato": f"Cultivos que se venden: {lista} · sin precios"}]


def heladas_y_calor(cal, ind):
    """
    Meses con helada frecuente (1 de cada 3 años) y con calor en verano (1 de cada 2).
    Prototipo: `helada(m)` y `calor(m)` con la serie real de POWER. No suman ni
    restan puntos: van a "Revisar con el agrónomo" y se marcan en el calendario.
    """
    n = ind["n_anios"]
    helada = [m for m in range(12) if ind["anios_con_helada"][m] >= n / 3]
    conflicto = [m for m in helada if not C[cal[m]]["tolera_helada"]]
    calor = [m for m in range(12)
             if C[cal[m]]["grupo"] == "verano" and ind["anios_con_calor"][m] >= n / 2]
    return helada, conflicto, calor


# --- Evaluación --------------------------------------------------------------

def evaluar(s, entradas, ind, pendiente):
    """Agrega a la estrategia sus puntos por dimensión, sus mm y sus aportes."""
    if not s["on"]:
        return s
    cal = s["calendario"]
    agua = regla_agua(cal, ind)
    otros = regla_suelo(cal, entradas) + regla_erosion(cal, pendiente) + regla_ingreso(cal)

    def suma(dim):
        return _clamp(round(sum(a["efecto"].get(dim, 0) for a in otros)))

    s["aportes"] = agua + otros
    s["agua_por_tipo"] = {a["tipo"]: _clamp(round(a["efecto"]["agua"])) for a in agua}
    s["agua_mm"] = {a["tipo"]: {"lluvia": a["lluvia_mm"], "uso": a["uso_mm"], "balance": a["balance_mm"]}
                    for a in agua}
    s["suelo"], s["erosion"], s["ingreso"] = suma("suelo"), suma("erosion"), suma("ingreso")
    s["meses_pelados"] = cal.count(BARBECHO)
    s["repite"] = any(a["regla"] == "repite_cultivo" for a in otros)
    s["helada"], s["helada_conflicto"], s["calor"] = heladas_y_calor(cal, ind)
    return s


def valores(s, tipo="normal"):
    return {"agua": s["agua_por_tipo"][tipo], "suelo": s["suelo"],
            "erosion": s["erosion"], "ingreso": s["ingreso"]}


def cercania(s, pesos, tipo="normal"):
    """
    `sc()` del prototipo: promedio de las 4 dimensiones pesado por las barritas.
    Front 2 la replica en cercania.ts para recalcular sin llamar a la API.
    """
    v = valores(s, tipo)
    total = sum(pesos[o] for o in OBJ)
    return round(sum(pesos[o] * v[o] for o in OBJ) / total) if total else None


def choque(lista, pesos):
    """
    `clash()`: si los 2 objetivos más pesados (el segundo con 4 o más) quedan
    mejor en alternativas distintas, ninguna cumple los dos: se avisa.
    """
    on = [s for s in lista[1:] if s["on"]]
    ws = sorted(OBJ, key=lambda o: -pesos[o])
    if len(on) < 2 or pesos[ws[1]] < 4:
        return {"hay": False}
    mejor = {o: max(on, key=lambda s: valores(s)[o]) for o in ws[:2]}
    if mejor[ws[0]]["id"] == mejor[ws[1]]["id"]:
        return {"hay": False}
    return {"hay": True, "objetivos": ws[:2],
            "mejor": {o: mejor[o]["k"] for o in ws[:2]}}


def analizar(entradas, ind):
    """Punto de entrada: entradas + indicadores -> 4 columnas evaluadas + choque."""
    pendiente = ind.get("pendiente_pct")
    pendiente_real = pendiente is not None
    if not pendiente_real:
        pendiente = PENDIENTE_DEFECTO
    lista = [evaluar(s, entradas, ind, pendiente) for s in estrategias(entradas, pendiente)]
    for s in lista:
        if s["on"]:
            s["cercania"] = cercania(s, entradas["pesos"])
            s["cercania_por_tipo"] = {t: cercania(s, entradas["pesos"], t) for t in TIPOS}
            s["sensible_clima"] = (s["cercania_por_tipo"]["humedo"]
                                   - s["cercania_por_tipo"]["seco"]) >= UMBRAL_SENSIBLE
    return {"estrategias": lista, "choque": choque(lista, entradas["pesos"]),
            "pendiente_pct": pendiente, "pendiente_real": pendiente_real}
