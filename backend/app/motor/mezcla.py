"""Clima del lote: mezcla de las mediciones del productor con NASA POWER.

El productor puede cargar (opcional) su lluvia y sus temperaturas mínima y máxima. Como es el dato
en el que más confía, **pesa más que NASA** cuando tiene suficientes años de registro. El peso crece
con los años (`PESO_PRODUCTOR`); NASA se lleva el resto. Sin mediciones, todo sale de NASA.

Formas de entrada (`entradas["mediciones"]`, todas opcionales):
- `lluvia_anual_mm` + `anios_registro`: un número anual del pluviómetro.
- `serie_mensual`: [{mes: "AAAA-MM", lluvia_mm?, t_min_c?, t_max_c?}]. En temperatura, la mínima
  más baja y la máxima más alta del mes (lo mismo que POWER mensual). Si trae lluvia, manda sobre
  el número anual.

**Período de la comparación (#64):** la diferencia productor/NASA se calcula contra NASA **del mismo
período que cubre el registro**, igual que el contraste de `clima/correccion.py`, para que el número
que muestra la tabla sea el mismo que entra en los puntajes. Usa `indicadores["campanas_nasa"]`
(NASA campaña por campaña, índice 0 = enero):
- Planilla: las campañas julio–junio completas del productor que también están en NASA.
- Lluvia anual a mano: las últimas `anios_registro` campañas de NASA.
- Sin `campanas_nasa`, o sin campañas completas en común: contra el promedio de las 30 campañas, y la
  evidencia lo dice.
Esa diferencia se aplica después sobre las 30 campañas: los terciles, sus `n` y la ET0 siguen siendo
los de NASA.

Qué se mezcla:
- Lluvia: un factor productor/NASA (anual, o uno por mes con la serie) escala la lluvia de cada
  mes de los tres tipos de año: `pp × (w·f + 1 − w)`. Con la planilla, `f_m` = media del productor
  / media de NASA en las campañas en común, así que sobre esas campañas la diferencia anual es
  exactamente la del contraste (salvo que un mes caiga fuera de [FACTOR_MIN, FACTOR_MAX]).
- Heladas (mínima < 0 °C) y calor (máxima ≥ 35 °C): frecuencia por mes
  `NASA_30 + w·(productor − NASA)`, con productor y NASA contados en las mismas campañas.
- La ET0 sigue siendo la de NASA (Hargreaves necesita la temperatura media y la amplitud diaria,
  y las del productor son extremos del mes).

Funciones puras: sin red ni disco. Solo importa del propio dominio.
"""
from __future__ import annotations

import math

from app.motor.cultivos import MESES, pct

TIPOS = ("seco", "normal", "humedo")
VARIABLES = ("lluvia_mm", "t_min_c", "t_max_c")

# Peso del productor según sus años de registro: (años mínimos, peso). Lo calibra la persona 3.
PESO_PRODUCTOR = ((10, 0.75), (5, 0.60), (3, 0.50), (1, 0.40))
FACTOR_MIN, FACTOR_MAX = 0.5, 1.5   # un factor productor/NASA fuera de esto es más error que señal
UMBRAL_HELADA_C = 0.0               # el mismo que clima/indicadores.py
UMBRAL_CALOR_C = 35.0
FRACCION_DIFERENCIA = 1 / 3         # meses que se nombran en la evidencia: el mismo corte que el contraste

SIN_CAMPANAS = "sin NASA campaña por campaña: comparado con el promedio de las 30 campañas"
SIN_COMUNES = ("tu registro no tiene campañas completas (julio a junio) en común con NASA: comparado con el "
               "promedio de las 30 campañas")


def peso_productor(anios: int | None) -> float:
    """Peso de la medición del productor frente a NASA (0 si no hay años)."""
    if not anios or anios < 1:
        return 0.0
    return next(w for minimo, w in PESO_PRODUCTOR if anios >= minimo)


def _limitar(f: float) -> float:
    return max(FACTOR_MIN, min(FACTOR_MAX, f))


def _num(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _anios(n: int) -> str:
    return f"{n} {'año' if n == 1 else 'años'}"


def _campanas(n: int) -> str:
    return f"{n} {'campaña' if n == 1 else 'campañas'}"


def _rango(campanas: list[str]) -> str:
    return campanas[0] if len(campanas) == 1 else f"{campanas[0]} a {campanas[-1]}"


def _dif(vp: float, vn: float) -> int:
    """Diferencia productor/NASA en %, con la misma fórmula que `clima/correccion.py`."""
    return round((vp - vn) / vn * 100)


def _signo(d: int) -> str:
    return f"{'+' if d > 0 else '−' if d < 0 else ''}{abs(d)} %"


def _por_mes(serie: list[dict], clave: str) -> list[list[float]]:
    """Valores de `clave` agrupados por mes del año (índice 0 = enero)."""
    meses: list[list[float]] = [[] for _ in range(12)]
    for fila in serie or []:
        try:
            m = int(str(fila.get("mes", ""))[5:7]) - 1
        except (ValueError, AttributeError):
            continue
        v = _num(fila.get(clave))
        if 0 <= m < 12 and v is not None:
            meses[m].append(v)
    return meses


def _campanas_productor(serie: list[dict], clave: str) -> dict[str, list[float]]:
    """Campañas julio–junio del productor con los 12 meses de `clave`. Índice 0 = enero.

    La misma regla que `clima/correccion.py` (y que NASA POWER): julio a diciembre son del año de
    inicio y enero a junio del siguiente; una campaña entra solo si tiene los 12 meses con dato.
    """
    por_mes: dict[tuple[int, int], float] = {}
    for fila in serie or []:
        try:
            texto = str(fila.get("mes", ""))
            anio, mes = int(texto[:4]), int(texto[5:7])
        except (ValueError, AttributeError):
            continue
        v = _num(fila.get(clave))
        if 1 <= mes <= 12 and v is not None:
            por_mes[(anio, mes)] = v
    if not por_mes:
        return {}
    anios = sorted({a for a, _ in por_mes})
    campanas = {}
    for y in range(anios[0] - 1, anios[-1] + 1):
        claves = [(y + 1 if m < 6 else y, m + 1) for m in range(12)]
        if all(k in por_mes for k in claves):
            campanas[f"{y}/{str(y + 1)[2:]}"] = [por_mes[k] for k in claves]
    return campanas


def _nasa_por_campana(ind: dict) -> dict[str, dict[str, list[float]]]:
    """`indicadores["campanas_nasa"]` como {campaña: {variable: [12]}}. Lo roto se descarta."""
    salida: dict[str, dict[str, list[float]]] = {}
    for c in ind.get("campanas_nasa") or []:
        if not isinstance(c, dict) or not c.get("campana"):
            continue
        variables = {}
        for v in VARIABLES:
            valores = [_num(x) for x in (c.get(v) or [])]
            if len(valores) == 12 and all(x is not None for x in valores):
                variables[v] = valores
        if variables:
            salida[str(c["campana"])] = variables
    return salida


def _nasa_mensual(terciles: dict) -> list[float]:
    """Lluvia media de NASA por mes, ponderada por la cantidad de campañas de cada tipo."""
    n = sum(terciles[t].get("n", 0) for t in TIPOS) or 1
    return [sum(terciles[t]["pp"][m] * terciles[t].get("n", 0) for t in TIPOS) / n for m in range(12)]


def _sin_lluvia() -> dict:
    return {"factores": [1.0] * 12, "peso": 0.0, "anios": 0, "texto": None, "campanas": [], "diferencia_pct": None}


def _lluvia_planilla(serie: list[dict], nasa: dict, nasa_mes: list[float]) -> dict | None:
    por_mes = _por_mes(serie, "lluvia_mm")
    if not any(por_mes):
        return None
    anios = min(len(v) for v in por_mes if v)
    w = peso_productor(anios)
    prod = _campanas_productor(serie, "lluvia_mm")
    comunes = [c for c in sorted(prod) if "lluvia_mm" in nasa.get(c, {})]
    if comunes:
        n = len(comunes)
        p_mes = [sum(prod[c][m] for c in comunes) / n for m in range(12)]
        n_mes = [sum(nasa[c]["lluvia_mm"][m] for c in comunes) / n for m in range(12)]
        vp, vn = sum(p_mes), sum(n_mes)
        if vn > 0:
            d = _dif(vp, vn)
            return {"factores": [_limitar(p_mes[m] / n_mes[m]) if n_mes[m] > 0 else 1.0 for m in range(12)],
                    "peso": w, "anios": anios, "campanas": comunes, "diferencia_pct": d,
                    "texto": (f"Lluvia: tu registro {vp:.0f} mm/año ({pct(w)}, {_anios(anios)}) contra NASA POWER "
                              f"en las mismas {_campanas(n)} ({_rango(comunes)}) {vn:.0f} mm ({_signo(d)})")}
    # Sin NASA campaña por campaña o sin campañas en común: contra el promedio de las 30 (como antes de #64).
    nasa_anual = sum(nasa_mes)
    prod_anual = sum(sum(v) / len(v) if v else nasa_mes[m] for m, v in enumerate(por_mes))
    motivo = SIN_COMUNES if nasa else SIN_CAMPANAS
    return {"factores": [_limitar((sum(v) / len(v)) / nasa_mes[m]) if v and nasa_mes[m] > 0 else 1.0
                         for m, v in enumerate(por_mes)],
            "peso": w, "anios": anios, "campanas": [],
            "diferencia_pct": _dif(prod_anual, nasa_anual) if nasa_anual > 0 else None,
            "texto": (f"Lluvia: tu registro mensual {prod_anual:.0f} mm/año ({pct(w)}, {_anios(anios)}) + "
                      f"NASA POWER {nasa_anual:.0f} mm ({pct(1 - w)}), {motivo}")}


def _lluvia_anual(mediciones: dict, nasa: dict, nasa_mes: list[float]) -> dict | None:
    anual = _num(mediciones.get("lluvia_anual_mm"))
    nasa_anual = sum(nasa_mes)
    if not anual or anual <= 0 or nasa_anual <= 0:
        return None
    anios = int(_num(mediciones.get("anios_registro")) or 1)
    w = peso_productor(anios)
    ultimas = sorted(c for c in nasa if "lluvia_mm" in nasa[c])[-anios:] if anios >= 1 else []
    vn = sum(sum(nasa[c]["lluvia_mm"]) for c in ultimas) / len(ultimas) if ultimas else 0.0
    if vn > 0:
        d = _dif(anual, vn)
        return {"factores": [_limitar(anual / vn)] * 12, "peso": w, "anios": anios, "campanas": ultimas,
                "diferencia_pct": d,
                "texto": (f"Lluvia: tu pluviómetro {anual:.0f} mm/año ({pct(w)}, {_anios(anios)}) contra NASA POWER "
                          f"en las últimas {_campanas(len(ultimas))} ({_rango(ultimas)}) {vn:.0f} mm ({_signo(d)})")}
    return {"factores": [_limitar(anual / nasa_anual)] * 12, "peso": w, "anios": anios, "campanas": [],
            "diferencia_pct": _dif(anual, nasa_anual),
            "texto": (f"Lluvia: tu pluviómetro {anual:.0f} mm/año ({pct(w)}, {_anios(anios)}) + NASA POWER "
                      f"{nasa_anual:.0f} mm ({pct(1 - w)}), {SIN_CAMPANAS}")}


def _lluvia(mediciones: dict, terciles: dict, nasa: dict) -> dict:
    """{factores[12], peso, anios, texto, campanas, diferencia_pct}. Factor 1 y peso 0 si no hay dato."""
    nasa_mes = _nasa_mensual(terciles)
    return (_lluvia_planilla(mediciones.get("serie_mensual") or [], nasa, nasa_mes)
            or _lluvia_anual(mediciones, nasa, nasa_mes)
            or _sin_lluvia())


def _frecuencia(mediciones: dict, clave: str, nasa_anios: list[int], n_nasa: int, nasa: dict,
                es_evento) -> dict:
    """Frecuencia mezclada de heladas o calor por mes, con la diferencia productor/NASA del mismo período.

    Devuelve {mezcla[12], peso, anios, campanas, prod[12] | None, nasa_periodo[12] | None}; `prod` y
    `nasa_periodo` son fracciones de años (en las campañas en común, o NASA de las 30 si no hay).
    """
    nasa30 = [nasa_anios[m] / n_nasa if n_nasa else 0.0 for m in range(12)]
    vacio = {"mezcla": nasa30, "peso": 0.0, "anios": 0, "campanas": [], "prod": None, "nasa_periodo": None}
    serie = mediciones.get("serie_mensual") or []
    por_mes = _por_mes(serie, clave)
    if not any(por_mes):
        return vacio
    anios = min(len(v) for v in por_mes if v)
    w = peso_productor(anios)
    prod = _campanas_productor(serie, clave)
    comunes = [c for c in sorted(prod) if clave in nasa.get(c, {})]
    if comunes:
        n = len(comunes)
        p = [sum(1 for c in comunes if es_evento(prod[c][m])) / n for m in range(12)]
        q = [sum(1 for c in comunes if es_evento(nasa[c][clave][m])) / n for m in range(12)]
        mezcla = [min(1.0, max(0.0, nasa30[m] + w * (p[m] - q[m]))) for m in range(12)]
        return {"mezcla": mezcla, "peso": w, "anios": anios, "campanas": comunes, "prod": p, "nasa_periodo": q}
    # Sin campañas en común: contra las 30 campañas (como antes de #64).
    p30 = [sum(1 for x in v if es_evento(x)) / len(v) if v else None for v in por_mes]
    mezcla = [w * x + (1 - w) * nasa30[m] if x is not None else nasa30[m] for m, x in enumerate(p30)]
    return {"mezcla": mezcla, "peso": w, "anios": anios, "campanas": [],
            "prod": [x if x is not None else nasa30[m] for m, x in enumerate(p30)], "nasa_periodo": nasa30}


def _texto_frecuencia(nombre: str, f: dict, hay_nasa: bool) -> str:
    w, anios, comunes, prod, nasa = f["peso"], f["anios"], f["campanas"], f["prod"], f["nasa_periodo"]
    if comunes:
        n = len(comunes)
        umbral = max(1, math.ceil(n * FRACCION_DIFERENCIA))
        cambios = [m for m in range(12) if abs(round(prod[m] * n) - round(nasa[m] * n)) >= umbral]
        detalle = "; ".join(f"{MESES[m]}: tu estación {round(prod[m] * n)} de {n}, NASA {round(nasa[m] * n)} de {n} "
                            f"→ {pct(f['mezcla'][m])} de los años" for m in cambios[:3]) or "coinciden con NASA"
        return (f"{nombre}: tu estación ({pct(w)}, {_anios(anios)}) contra NASA POWER en las mismas {_campanas(n)} "
                f"({_rango(comunes)}) · {detalle}")
    cambios = [m for m in range(12) if abs(prod[m] - nasa[m]) >= 0.15]
    detalle = "; ".join(f"{MESES[m]}: tu estación {pct(prod[m])}, NASA {pct(nasa[m])}"
                        for m in cambios[:3]) or "coinciden con NASA"
    motivo = SIN_COMUNES if hay_nasa else SIN_CAMPANAS
    return f"{nombre}: tu estación ({pct(w)}, {_anios(anios)}) + NASA POWER ({pct(1 - w)}), {motivo} · {detalle}"


def mezclar(entradas: dict, ind: dict) -> dict:
    """Clima que usan las reglas: terciles de lluvia/ET0 y frecuencias de helada y calor por mes.

    Devuelve {terciles, helada, calor, lluvia_nasa_mm, lluvia_mm, pesos{lluvia, helada, calor},
              anios{...}, periodo_comparado{lluvia, helada, calor}, diferencia_lluvia_pct, datos[str],
              hay_productor, hay_et0}. `ind` no se modifica.
    """
    mediciones = entradas.get("mediciones") or {}
    terciles_nasa = ind["terciles"]
    n_nasa = ind.get("n_anios") or 0
    nasa = _nasa_por_campana(ind)

    ll = _lluvia(mediciones, terciles_nasa, nasa)
    factores, w_ll = ll["factores"], ll["peso"]
    terciles = {}
    for t in TIPOS:
        ter = terciles_nasa[t]
        terciles[t] = {
            "pp": [ter["pp"][m] * (w_ll * factores[m] + 1 - w_ll) for m in range(12)],
            "pp_nasa": list(ter["pp"]),
            "et0": list(ter["et0"]) if ter.get("et0") else None,
            "n": ter.get("n", 0),
        }

    helada = _frecuencia(mediciones, "t_min_c", ind["anios_con_helada"], n_nasa, nasa, lambda x: x < UMBRAL_HELADA_C)
    calor = _frecuencia(mediciones, "t_max_c", ind["anios_con_calor"], n_nasa, nasa, lambda x: x >= UMBRAL_CALOR_C)

    datos = []
    lluvia_nasa = sum(_nasa_mensual(terciles_nasa))
    lluvia = sum(_nasa_mensual(terciles))
    if ll["texto"]:
        ajuste = (f"NASA de las 30 campañas ({lluvia_nasa:.0f} mm) con ese {_signo(ll['diferencia_pct'])} al "
                  f"{pct(w_ll)}: " if ll["campanas"] else "")
        datos.append(f"{ll['texto']} → {ajuste}{lluvia:.0f} mm/año para las reglas")
    for nombre, f in (("Heladas", helada), ("Calor", calor)):
        if f["prod"] is not None:
            datos.append(_texto_frecuencia(nombre, f, bool(nasa)))

    return {
        "terciles": terciles,
        "helada": helada["mezcla"],
        "calor": calor["mezcla"],
        "lluvia_nasa_mm": lluvia_nasa,
        "lluvia_mm": lluvia,
        "pesos": {"lluvia": w_ll, "helada": helada["peso"], "calor": calor["peso"]},
        "anios": {"lluvia": ll["anios"], "helada": helada["anios"], "calor": calor["anios"]},
        "periodo_comparado": {"lluvia": ll["campanas"], "helada": helada["campanas"], "calor": calor["campanas"]},
        "diferencia_lluvia_pct": ll["diferencia_pct"],
        "datos": datos,
        "hay_productor": bool(w_ll or helada["peso"] or calor["peso"]),
        "hay_et0": all(terciles[t]["et0"] for t in TIPOS),
    }
