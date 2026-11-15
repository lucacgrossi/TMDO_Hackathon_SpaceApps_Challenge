"""Motor de reglas de Field Shift: puntajes de 0 a 100 de las 4 columnas.

Entrada (la arma `app/servicio.py`):
    entradas = {verano, invierno, pasada, pesos{agua, suelo, ingreso, erosion} (1 a 5),
                no_sembrar, maquinaria_limitada, anegable, textura,
                mediciones?: {lluvia_anual_mm?, anios_registro?, serie_mensual?}}
    indicadores = {terciles{seco|normal|humedo: {pp[12], et0[12] | None, n}},
                   anios_con_helada[12], anios_con_calor[12], n_anios, pendiente_pct, visto_satelite}

Salida: {estrategias[4], choque, clima, pendiente_pct, pendiente_real}. `plantillas.armar` le suma
los textos. Índice 0 = enero en todos los arrays de 12 meses.

Principios:
- Las **prioridades** del productor eligen las especies (`estrategias.py`) y pesan al cuadrado en la
  cercanía: una prioridad 5 pesa 25 veces más que una 1.
- Las **mediciones** del productor (lluvia, mínimas y máximas) pesan más que NASA cuando tienen años
  de registro (`mezcla.py`) y entran en agua, erosión e ingreso.
- Reglas fijas y trazables: cada punto sale de un aporte {regla, efecto, dato}. Sin IA.
- Compara, no recomienda: no elige ganador.
"""
from __future__ import annotations

from app.motor import estrategias as _estrategias
from app.motor.cultivos import BARBECHO, C, MESES, PLURAL_TIPO, cuenta, dec, floracion, meses_texto, nombre, pct
from app.motor.mezcla import mezclar

TIPOS = ("seco", "normal", "humedo")
OBJETIVOS = ("agua", "suelo", "erosion", "ingreso")

# --- Constantes de las reglas (las calibra la persona 3 con un agrónomo) ---------------------
PENDIENTE_DEFECTO = 1.6        # % (la del prototipo); si se usa, va a "Información que falta"
ET0_RESPALDO_MM = 80.0         # mm/mes si no llegó la ET0 de NASA (la del prototipo)
LLUVIA_EFECTIVA = {"arenoso": 0.65, "franco": 0.75, "arcilloso": 0.80, "no_se": 0.75}
ANEGABLE_CASTIGO = {"si": 10, "a_veces": 5}   # puntos de agua en años húmedos con agua de sobra
ANEGABLE_COBERTURA = 0.9       # lluvia efectiva / uso desde la que hay agua de sobra
SUELO_BASE = 20
SUELO_POR_MES_CUBIERTO = 2
SUELO_REPITE = -10
EROSION_BASE = 100
EROSION_POR_MES = 12           # castigo de cada mes pelado, antes de la pendiente y la lluvia
LLUVIA_MES_REFERENCIA_MM = 50  # lluvia de un mes pelado que deja el castigo igual (factor 1)
EROSION_FACTOR_LLUVIA = (0.5, 1.5)
EROSION_ARENOSO = 1.2
RASTROJO_PROTEGE = 30
RASTROJO_BONO = 20
INGRESO = {"dos_comerciales": 85, "uno": 50, "cobertura": 45}
HELADA_CASTIGO, HELADA_TOPE = 20, 30   # puntos de ingreso por (frecuencia de helada × mes sensible)
CALOR_CASTIGO, CALOR_TOPE = 10, 20     # puntos de ingreso por (frecuencia de calor × mes de floración)
HELADA_FRECUENTE = 1 / 3       # helada en 1 de cada 3 años
CALOR_FRECUENTE = 1 / 2        # 35 °C en la mitad de los años
UMBRAL_SENSIBLE = 15           # cercanía húmedo − seco para "sensible al clima"
EXPONENTE_PRIORIDAD = 2        # cercanía = Σ p²·v / Σ p²
PRIORIDAD_MIN, PRIORIDAD_MAX = 1, 5   # barritas de 1 (poco) a 5 (mucho)


def _clamp(x: float, a: float = 0, b: float = 100) -> int:
    return int(round(max(a, min(b, x))))


def _aporte(regla: str, dim: str, puntos: float, dato: str) -> dict:
    return {"regla": regla, "efecto": {dim: round(puntos, 1)}, "dato": dato}


# --- Reglas --------------------------------------------------------------------------------

def _agua_tipo(cal: list[str], ter: dict, textura: str, pp_clave: str = "pp") -> dict:
    """Lluvia, uso (kc × ET0) y balance de un tipo de año."""
    et0 = ter["et0"] or [ET0_RESPALDO_MM] * 12
    lluvia = sum(ter[pp_clave])
    efectiva = LLUVIA_EFECTIVA.get(textura, LLUVIA_EFECTIVA["no_se"]) * lluvia
    uso = sum(C[x]["kc"] * et0[m] for m, x in enumerate(cal))
    return {"lluvia": lluvia, "efectiva": efectiva, "uso": uso, "balance": efectiva - uso,
            "cubre": efectiva / uso if uso else 1.0}


def regla_agua(cal: list[str], clima: dict, entradas: dict) -> list[dict]:
    """Puntos de agua por tipo de año: 100 × la parte del uso que cubre la lluvia efectiva."""
    textura = entradas.get("textura") or "no_se"
    anegable = entradas.get("anegable") or "no_se"
    coef = LLUVIA_EFECTIVA.get(textura, LLUVIA_EFECTIVA["no_se"])
    fuente_et0 = "ET0 de NASA POWER (Hargreaves)" if clima["hay_et0"] else f"ET0 fija {ET0_RESPALDO_MM:.0f} mm/mes"
    aportes = []
    for t in TIPOS:
        ter = clima["terciles"][t]
        a = _agua_tipo(cal, ter, textura)
        pts = 100 * min(1.0, a["cubre"])
        fuente_lluvia = "lluvia tuya y de NASA" if clima["pesos"]["lluvia"] else "lluvia de NASA POWER"
        aporte = _aporte("agua", "agua", pts,
                         f"Años {PLURAL_TIPO[t]}: lluvia {a['lluvia']:.0f} mm × {dec(coef, 2)} (suelo {textura}) cubre el "
                         f"{pct(min(a['cubre'], 9.99))} del uso {a['uso']:.0f} mm (kc × {fuente_et0}); "
                         f"{fuente_lluvia}, {ter['n']} campañas")
        aporte.update(tipo=t, lluvia_mm=round(a["lluvia"]), uso_mm=round(a["uso"]), balance_mm=round(a["balance"]))
        if clima["pesos"]["lluvia"]:
            nasa = _agua_tipo(cal, ter, textura, "pp_nasa")
            aporte["balance_nasa_mm"] = round(nasa["balance"])
        aportes.append(aporte)
        if t == "humedo" and anegable in ANEGABLE_CASTIGO and a["cubre"] >= ANEGABLE_COBERTURA:
            castigo = ANEGABLE_CASTIGO[anegable]
            extra = _aporte("anegamiento", "agua", -castigo,
                            f"Lote que se encharca ({'sí' if anegable == 'si' else 'a veces'}) con agua de sobra en años "
                            f"húmedos · dato del productor")
            extra["tipo"] = t
            aportes.append(extra)
    return aportes


def regla_suelo(cal: list[str], entradas: dict) -> list[dict]:
    cultivos = [x for x in dict.fromkeys(cal) if x != BARBECHO]
    cubiertos = 12 - cal.count(BARBECHO)
    aportes = [_aporte("suelo_base", "suelo", SUELO_BASE, "Base de la regla")]
    for x in cultivos:
        if C[x]["aporte_n"]:
            aportes.append(_aporte("nitrogeno", "suelo", C[x]["aporte_n"],
                                   f"{nombre(x)} fija nitrógeno · tabla de cultivos"))
        if C[x]["rastrojo"]:
            aportes.append(_aporte("rastrojo", "suelo", C[x]["rastrojo"],
                                   f"{nombre(x)} deja rastrojo ({C[x]['rastrojo']}) · tabla de cultivos"))
    aportes.append(_aporte("meses_cubiertos", "suelo", cubiertos * SUELO_POR_MES_CUBIERTO,
                           f"{cuenta(cubiertos, 'mes', 'meses')} con cultivo vivo · calendario"))
    verano = next((x for x in cultivos if C[x]["grupo"] == "verano"), None)
    verano = "soja" if verano == "soja2" else verano
    if verano and verano == entradas.get("pasada"):
        aportes.append(_aporte("repite_cultivo", "suelo", SUELO_REPITE,
                               f"Repite {nombre(verano).lower()} de la campaña pasada · dato del productor"))
    return aportes


def regla_erosion(cal: list[str], pendiente: float, clima: dict, entradas: dict) -> list[dict]:
    """Castigo por mes pelado: más pendiente y más lluvia en esos meses, más erosión."""
    pelados = [m for m, x in enumerate(cal) if x == BARBECHO]
    pp = clima["terciles"]["normal"]["pp"]
    lluvia_pelados = sum(pp[m] for m in pelados)
    lo, hi = EROSION_FACTOR_LLUVIA
    f_lluvia = max(lo, min(hi, (lluvia_pelados / len(pelados)) / LLUVIA_MES_REFERENCIA_MM)) if pelados else 1.0
    f_textura = EROSION_ARENOSO if entradas.get("textura") == "arenoso" else 1.0
    castigo = len(pelados) * EROSION_POR_MES * (0.6 + pendiente / 5) * f_lluvia * f_textura
    rastrojo = sum(C[x]["rastrojo"] for x in dict.fromkeys(cal) if x != BARBECHO)
    fuente_lluvia = "tu lluvia y la de NASA" if clima["pesos"]["lluvia"] else "NASA POWER"
    aportes = [
        _aporte("erosion_base", "erosion", EROSION_BASE, "Base de la regla"),
        _aporte("meses_pelados", "erosion", -castigo,
                f"{cuenta(len(pelados), 'mes pelado', 'meses pelados')} ({meses_texto(pelados)}) con pendiente {dec(pendiente)} % y "
                f"{lluvia_pelados:.0f} mm de lluvia en esos meses en años normales ({fuente_lluvia})"
                + (" · suelo arenoso" if f_textura > 1 else "")),
    ]
    if rastrojo >= RASTROJO_PROTEGE:
        aportes.append(_aporte("rastrojo_protege", "erosion", RASTROJO_BONO,
                               f"Rastrojo total {rastrojo} (≥ {RASTROJO_PROTEGE}) · tabla de cultivos"))
    return aportes


def regla_ingreso(cal: list[str], clima: dict) -> list[dict]:
    """Escala cualitativa (sin precios) menos el riesgo de helada y de calor sobre lo que se vende."""
    cultivos = [x for x in dict.fromkeys(cal) if x != BARBECHO]
    comerciales = [x for x in cultivos if C[x]["comercial"]]
    if len(comerciales) >= 2:
        base = INGRESO["dos_comerciales"]
    elif any(C[x]["grupo"] == "cobertura" for x in cultivos):
        base = INGRESO["cobertura"]
    else:
        base = INGRESO["uno"]
    aportes = [_aporte("ingreso", "ingreso", base,
                       f"Cultivos que se venden: {', '.join(nombre(x) for x in comerciales) or 'ninguno'} · sin precios")]
    fuente = "tu estación y NASA" if clima["pesos"]["helada"] else "NASA POWER"
    meses_h = [m for m, x in enumerate(cal) if C[x]["comercial"] and not C[x]["tolera_helada"] and clima["helada"][m] > 0]
    if meses_h:
        castigo = min(HELADA_TOPE, sum(clima["helada"][m] for m in meses_h) * HELADA_CASTIGO)
        aportes.append(_aporte("riesgo_helada", "ingreso", -castigo,
                               "Helada con cultivo sensible: " + ", ".join(
                                   f"{MESES[m]} {pct(clima['helada'][m])} de los años" for m in meses_h) + f" · {fuente}"))
    fuente = "tu estación y NASA" if clima["pesos"]["calor"] else "NASA POWER"
    meses_c = [m for x in comerciales if C[x]["sensible_calor"] for m in floracion(x, cal)
               if clima["calor"][m] > 0]
    if meses_c:
        castigo = min(CALOR_TOPE, sum(clima["calor"][m] for m in meses_c) * CALOR_CASTIGO)
        aportes.append(_aporte("riesgo_calor", "ingreso", -castigo,
                               "Máxima ≥ 35 °C en floración: " + ", ".join(
                                   f"{MESES[m]} {pct(clima['calor'][m])} de los años" for m in meses_c) + f" · {fuente}"))
    return aportes


# --- Evaluación ----------------------------------------------------------------------------

def _suma(aportes: list[dict], dim: str, tipo: str | None = None) -> int:
    return _clamp(sum(a["efecto"].get(dim, 0) for a in aportes if tipo is None or a.get("tipo") in (None, tipo)))


def evaluar(s: dict, entradas: dict, clima: dict, pendiente: float) -> dict:
    """Suma a la columna sus puntos, sus mm de agua y los aportes que los explican."""
    if not s["on"]:
        return s
    cal = s["calendario"]
    agua = regla_agua(cal, clima, entradas)
    otros = regla_suelo(cal, entradas) + regla_erosion(cal, pendiente, clima, entradas) + regla_ingreso(cal, clima)
    s["aportes"] = agua + otros
    s["agua_por_tipo"] = {t: _suma(agua, "agua", t) for t in TIPOS}
    principal = {a["tipo"]: a for a in agua if a["regla"] == "agua"}
    s["agua_mm"] = {t: {"lluvia": principal[t]["lluvia_mm"], "uso": principal[t]["uso_mm"],
                        "balance": principal[t]["balance_mm"]} for t in TIPOS}
    if clima["pesos"]["lluvia"]:
        s["agua_nasa_mm"] = {t: principal[t]["balance_nasa_mm"] for t in TIPOS}
    s["suelo"] = _suma(otros, "suelo")
    s["erosion"] = _suma(otros, "erosion")
    s["ingreso"] = _suma(otros, "ingreso")
    s["meses_pelados"] = cal.count(BARBECHO)
    s["repite"] = any(a["regla"] == "repite_cultivo" for a in otros)
    s["helada"] = [m for m in range(12) if clima["helada"][m] >= HELADA_FRECUENTE]
    s["helada_conflicto"] = [m for m in s["helada"] if not C[cal[m]]["tolera_helada"]]
    s["calor"] = [m for m in range(12) if C[cal[m]]["grupo"] == "verano" and clima["calor"][m] >= CALOR_FRECUENTE]
    return s


def prioridad(pesos: dict, objetivo: str) -> int:
    """Prioridad de 1 a 5; un valor fuera de rango o faltante se lleva al borde (por defecto, 3)."""
    try:
        p = int(pesos.get(objetivo, 3))
    except (TypeError, ValueError):
        p = 3
    return max(PRIORIDAD_MIN, min(PRIORIDAD_MAX, p))


def valores(s: dict, tipo: str = "normal") -> dict:
    return {"agua": s["agua_por_tipo"][tipo], "suelo": s["suelo"], "erosion": s["erosion"], "ingreso": s["ingreso"]}


def cercania(s: dict, pesos: dict, tipo: str = "normal") -> int | None:
    """Promedio de las 4 dimensiones pesado por las prioridades al cuadrado (de 1 a 5)."""
    v = valores(s, tipo)
    w = {o: prioridad(pesos, o) ** EXPONENTE_PRIORIDAD for o in OBJETIVOS}
    return round(sum(w[o] * v[o] for o in OBJETIVOS) / sum(w.values()))


def choque(lista: list[dict], pesos: dict) -> dict:
    """Si los 2 objetivos más pesados (el segundo con 4 o más) quedan más altos en columnas distintas."""
    activas = [s for s in lista[1:] if s["on"] and "agua_por_tipo" in s]
    orden = sorted(OBJETIVOS, key=lambda o: -prioridad(pesos, o))
    if len(activas) < 2 or prioridad(pesos, orden[1]) < 4:
        return {"hay": False, "objetivos": [], "arriba": {}}
    arriba = {o: max(activas, key=lambda s: valores(s)[o]) for o in orden[:2]}
    if arriba[orden[0]]["id"] == arriba[orden[1]]["id"]:
        return {"hay": False, "objetivos": [], "arriba": {}}
    return {"hay": True, "objetivos": orden[:2], "arriba": {o: arriba[o]["id"] for o in orden[:2]}}


def analizar(entradas: dict, ind: dict) -> dict:
    """Entradas del productor + indicadores de NASA → 4 columnas evaluadas + choque."""
    pendiente = ind.get("pendiente_pct")
    pendiente_real = pendiente is not None
    if not pendiente_real:
        pendiente = PENDIENTE_DEFECTO
    pesos = entradas["pesos"]
    clima = mezclar(entradas, ind)
    lista = [evaluar(s, entradas, clima, pendiente) for s in _estrategias.armar(entradas, clima, pendiente)]
    for s in lista:
        if s["on"]:
            s["cercania"] = cercania(s, pesos)
            s["cercania_por_tipo"] = {t: cercania(s, pesos, t) for t in TIPOS}
            seco, humedo = s["cercania_por_tipo"]["seco"], s["cercania_por_tipo"]["humedo"]
            s["sensible_clima"] = seco is not None and humedo is not None and humedo - seco >= UMBRAL_SENSIBLE
    return {"estrategias": lista, "choque": choque(lista, pesos), "clima": clima,
            "pendiente_pct": pendiente, "pendiente_real": pendiente_real}
