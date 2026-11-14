"""Textos de las 4 columnas con plantillas fijas (sin IA).

`armar(resultado, entradas, indicadores)` le suma a cada columna los 5 puntos del contrato:
por qué, evidencia, beneficios, información que falta (`falta`) y a revisar con el agrónomo
(`revisar`), más un `resumen` y el texto del choque de objetivos.

Describe datos y compara; no indica qué hacer ni elige ganador (lo controla
`.github/scripts/lenguaje_prohibido.py` y `tests/motor/test_reglas.py`).
"""
from __future__ import annotations

from app.motor import reglas
from app.motor.cultivos import BARBECHO, C, dec, meses_texto, nombre, pct

NOMBRE_OBJETIVO = {"agua": "Agua", "suelo": "Salud del suelo", "erosion": "Erosión", "ingreso": "Ingreso"}
DIFERENCIA_RESUMEN = 10   # puntos frente a la actual para nombrarlo en el resumen
DIFERENCIA_BENEFICIO = 5
AGUA_SECO_BAJA = 40       # puntos de agua en años secos por debajo de los que va a "Revisar"
MESES_RF14 = 2            # diferencia entre lo que vio el satélite y el calendario (RF14)
MIN_MESES_SATELITE = 8
EVIDENCIAS = 4

# Ensayos del INTA en la región: solo texto, no mueven puntajes. Son de otros lotes y campañas, así
# que cada línea dice de dónde sale. Van a la evidencia o a "Revisar con el agrónomo".
INTA = {
    "soja_continua": ("Soja continua (soja + barbecho) durante 15 años: infiltración de 73 mm/h contra ~106 mm/h y "
                      "materia orgánica de 2,5 % contra 3,4 a 3,9 % con trigo/soja o cobertura/soja · INTA Marcos "
                      "Juárez (Gudelj et al., 2024)"),
    "vicia_n": ("Vicia como antecesor: ~110 a 130 kg N/ha disponibles para el cultivo siguiente · ensayos INTA "
                "Marcos Juárez y General Villegas"),
    "vicia_agua": "En años secos la vicia consumió más agua que el centeno y afectó al maíz siguiente · INTA Manfredi",
    "centeno_biomasa": ("Biomasa del centeno en el sur de Córdoba: de 1,2 a 8 t/ha según la fecha de secado y el "
                        "nitrógeno; con secado a fines de agosto y sin N, 1,9 t/ha aérea y 2,2 t/ha de raíces · INTA "
                        "Río Cuarto (Boccolini et al., 2024)"),
    "centeno_n": ("Centeno con relación C/N de 35 a 38 y 19 a 25 kg N/ha en la parte aérea: deja poco nitrógeno al "
                  "cultivo siguiente · INTA Río Cuarto (Boccolini et al., 2024)"),
    "malezas": ("Con cultivos de cobertura, el uso de herbicidas en 6 años de soja y maíz bajó de 31 a 13 kg/ha de "
                "principio activo · INTA Marcos Juárez"),
    "soja2": ("Soja de 2ª: efecto secante del trigo antecesor; en el centro-oeste y sur de Córdoba depende de las "
              "lluvias de diciembre a febrero · INTA Manfredi"),
}


def _inta(s: dict) -> tuple[list[str], list[str]]:
    """(evidencia, revisar) de los ensayos del INTA que corresponden a los cultivos de la columna."""
    cult = _cultivos(s)
    evidencia, revisar = [], []
    if cult == ["soja"] and s.get("repite"):
        evidencia.append(INTA["soja_continua"])
    if "vicia" in cult:
        evidencia.append(INTA["vicia_n"])
        revisar.append(INTA["vicia_agua"])
    if "centeno" in cult:
        evidencia.append(INTA["centeno_biomasa"])
        revisar.append(INTA["centeno_n"])
    if any(C[x]["grupo"] == "cobertura" for x in cult):
        evidencia.append(INTA["malezas"])
    if "soja2" in cult:
        revisar.append(INTA["soja2"])
    return evidencia, revisar


def _signo(x: float) -> str:
    return f"+{x:.0f}" if x > 0 else f"{x:.0f}".replace("-", "−")


def _cultivos(s: dict) -> list[str]:
    return [x for x in dict.fromkeys(s["calendario"]) if x != BARBECHO]


def _resumen(s: dict, actual: dict) -> str:
    if s["id"] == "actual":
        return (f"Tu rotación: {s['especies'].lower()}. {s['meses_pelados']} meses con el lote pelado; "
                f"cercanía {s['cercania']} % con tus prioridades.")
    va, vs = reglas.valores(actual), reglas.valores(s)
    suben = [f"{NOMBRE_OBJETIVO[o].lower()} {_signo(vs[o] - va[o])}" for o in reglas.OBJETIVOS
             if vs[o] - va[o] >= DIFERENCIA_RESUMEN]
    bajan = [f"{NOMBRE_OBJETIVO[o].lower()} {_signo(vs[o] - va[o])}" for o in reglas.OBJETIVOS
             if va[o] - vs[o] >= DIFERENCIA_RESUMEN]
    partes = []
    if suben:
        partes.append("Sube en " + ", ".join(suben))
    if bajan:
        partes.append("baja en " + ", ".join(bajan))
    texto = "; ".join(partes) or "Diferencias menores a 10 puntos"
    seco = s["agua_mm"]["seco"]["balance"] - actual["agua_mm"]["seco"]["balance"]
    return f"{texto} frente a lo que hacés hoy. Balance de agua en años secos: {_signo(seco)} mm."


def _por_que(s: dict, actual: dict, entradas: dict) -> list[str]:
    cult = _cultivos(s)
    p = entradas["pesos"]
    lineas = []
    if s["id"] == "actual":
        pelados = [m for m, x in enumerate(s["calendario"]) if x == BARBECHO]
        lineas.append(f"{len(pelados)} meses con el lote pelado ({meses_texto(pelados)})")
    else:
        if s.get("eleccion"):
            lineas.append(f"Elegida por tus prioridades y el clima del lote: {s['eleccion']}")
        if s["meses_pelados"] < actual["meses_pelados"]:
            lineas.append(f"Cubre el suelo {12 - s['meses_pelados']} meses (hoy {12 - actual['meses_pelados']})")
        if "vicia" in cult:
            lineas.append("La vicia fija nitrógeno")
        if s["id"] == "B":
            inv = next(x for x in cult if C[x]["grupo"] == "invierno")
            lineas.append(f"Suma un cultivo que se vende en invierno ({nombre(inv).lower()})")
        if s["id"] == "C":
            nuevo = next(x for x in cult if C[x]["grupo"] == "verano")
            extra = " y tolera sequía y calor" if nuevo == "sorgo" else ""
            lineas.append(f"{nombre(nuevo)} corta el ciclo de plagas de {nombre(entradas['verano']).lower()}{extra}")
    lineas.append(f"Tus prioridades: agua {p['agua']}, suelo {p['suelo']}, erosión {p['erosion']}, "
                  f"ingreso {p['ingreso']} (pesan al cuadrado en la cercanía)")
    return lineas


def _evidencia(s: dict, clima: dict) -> list[str]:
    agua = [a["dato"] for a in s["aportes"] if a["regla"] == "agua" and a.get("tipo") == "normal"]
    fuertes = sorted((a for a in s["aportes"] if not a["regla"].endswith("_base") and a["regla"] != "agua"),
                     key=lambda a: -max(abs(v) for v in a["efecto"].values()))
    lineas = agua + [a["dato"] for a in fuertes[:EVIDENCIAS - 1]]
    if s.get("agua_nasa_mm"):
        nasa, mezcla = s["agua_nasa_mm"]["seco"], s["agua_mm"]["seco"]["balance"]
        if nasa != mezcla:
            lineas.append(f"Con tus mediciones, el balance en años secos pasa de {_signo(nasa)} mm "
                          f"(solo NASA) a {_signo(mezcla)} mm")
    return lineas + clima["datos"]


def _beneficios(s: dict, lista: list[dict]) -> list[str]:
    activas = [x for x in lista if x["on"] and "agua_por_tipo" in x]
    vs = reglas.valores(s)
    if s["id"] == "actual":
        otras = [x for x in activas if x["id"] != "actual"]
        return [f"{NOMBRE_OBJETIVO[o]}: ninguna alternativa lo supera ({vs[o]} puntos)"
                for o in reglas.OBJETIVOS if otras and all(reglas.valores(x)[o] <= vs[o] for x in otras)]
    actual = lista[0]
    va = reglas.valores(actual)
    lineas = [f"{NOMBRE_OBJETIVO[o]}: {_signo(vs[o] - va[o])} puntos frente a lo que hacés hoy"
              for o in reglas.OBJETIVOS if vs[o] - va[o] >= DIFERENCIA_BENEFICIO]
    extra = actual["meses_pelados"] - s["meses_pelados"]
    if extra > 0:
        lineas.append(f"{extra} meses más con el suelo cubierto")
    seco = s["agua_mm"]["seco"]["balance"] - actual["agua_mm"]["seco"]["balance"]
    if seco >= 5:
        lineas.append(f"{_signo(seco)} mm de balance de agua en años secos")
    return lineas


def _revisar(s: dict, entradas: dict, ind: dict, clima: dict) -> list[str]:
    cult = _cultivos(s)
    lineas = []
    agua_seco = next(a for a in s["aportes"] if a["regla"] == "agua" and a["tipo"] == "seco")
    if s["agua_por_tipo"]["seco"] < AGUA_SECO_BAJA:
        lineas.append(f"Poca reserva de agua en años secos ({agua_seco['dato']})")
    if s.get("repite"):
        lineas.append("Repite el cultivo de la campaña pasada")
    if "vicia" in cult and entradas.get("anegable") in ("si", "a_veces"):
        lineas.append("Lote que se encharca: riesgo de mala implantación de la vicia")
    if any(C[x]["grupo"] == "cobertura" for x in cult):
        lineas.append("Secado de la cobertura ~30 días antes de la siembra de verano")
    if entradas.get("maquinaria_limitada") and s["id"] in ("B", "C"):
        lineas.append("Requiere maquinaria para un cultivo nuevo")
    if s["helada_conflicto"]:
        lineas.append(f"Cultivo sensible a helada en meses con helada frecuente: {meses_texto(s['helada_conflicto'])}")
    if s["calor"]:
        lineas.append(f"Máxima de 35 °C o más en la mitad de los años con cultivo de verano: {meses_texto(s['calor'])}")
    if s.get("sensible_clima"):
        cp = s["cercania_por_tipo"]
        lineas.append(f"Sensible al clima: cercanía {cp['seco']} % en años secos contra {cp['humedo']} % en húmedos")
    visto = ind.get("visto_satelite")
    if s["id"] == "actual" and visto and (visto.get("meses_con_dato") or 0) >= MIN_MESES_SATELITE \
            and visto.get("meses_pelados") is not None \
            and abs(visto["meses_pelados"] - s["meses_pelados"]) >= MESES_RF14:
        lineas.append(f"Lo que vio el satélite no coincide con la rotación cargada: {visto['meses_pelados']} meses "
                      f"con el lote pelado en {visto.get('campania')}, contra {s['meses_pelados']} según el calendario")
    for clave, texto in (("lluvia", "lluvia"), ("helada", "temperatura mínima"), ("calor", "temperatura máxima")):
        anios = clima["anios"][clave]
        if 0 < anios < 3:
            lineas.append(f"Tu registro de {texto} tiene {anios} {'año' if anios == 1 else 'años'}: "
                          f"pesa {pct(clima['pesos'][clave])} frente a NASA")
    return lineas


def _falta(resultado: dict, entradas: dict, clima: dict) -> list[str]:
    lineas = ["Precios de los cultivos (fuera de alcance): el ingreso es una escala sin precios"]
    if (entradas.get("textura") or "no_se") == "no_se":
        lineas.append("Textura del suelo: se usó franco para la lluvia efectiva")
    if not resultado["pendiente_real"]:
        lineas.append(f"Pendiente del lote: se usó {dec(reglas.PENDIENTE_DEFECTO)} % por defecto")
    if not clima["hay_et0"]:
        lineas.append(f"ET0 de NASA POWER: se usó {reglas.ET0_RESPALDO_MM:.0f} mm/mes fijos para el uso de agua")
    if clima["pesos"]["helada"] or clima["pesos"]["calor"]:
        lineas.append("ET0: sale de NASA POWER (tus temperaturas son extremos del mes y no alcanzan para Hargreaves)")
    return lineas


def _texto_choque(ch: dict, lista: list[dict]) -> str:
    if not ch.get("hay"):
        return ""
    o1, o2 = ch["objetivos"]
    nombres = {s["id"]: s["k"] for s in lista}
    a1, a2 = nombres[ch["arriba"][o1]], nombres[ch["arriba"][o2]]
    return (f"{NOMBRE_OBJETIVO[o1]} y {NOMBRE_OBJETIVO[o2].lower()} chocan en este lote: en "
            f"{NOMBRE_OBJETIVO[o1].lower()} queda más arriba la columna {a1}; en "
            f"{NOMBRE_OBJETIVO[o2].lower()}, la {a2}. Ninguna cumple las dos.")


def armar(resultado: dict, entradas: dict, ind: dict) -> dict:
    """Suma los textos a cada columna y al choque. Devuelve el mismo `resultado`."""
    lista, clima = resultado["estrategias"], resultado["clima"]
    actual = lista[0]
    falta = _falta(resultado, entradas, clima)
    for s in lista:
        if not s["on"]:
            s.update(resumen=f"Descartada: {s['motivo']}.", por_que=[], evidencia=[], beneficios=[],
                     revisar=[], falta=[])
            continue
        inta_evidencia, inta_revisar = _inta(s)
        s.update(resumen=_resumen(s, actual), por_que=_por_que(s, actual, entradas),
                 evidencia=_evidencia(s, clima) + inta_evidencia, beneficios=_beneficios(s, lista),
                 revisar=_revisar(s, entradas, ind, clima) + inta_revisar, falta=list(falta))
    resultado["choque"]["texto"] = _texto_choque(resultado["choque"], lista)
    return resultado
