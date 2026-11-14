"""Clima del lote: mezcla de las mediciones del productor con NASA POWER.

El productor puede cargar (opcional) su lluvia y sus temperaturas mínima y máxima. Como es el dato
en el que más confía, **pesa más que NASA** cuando tiene suficientes años de registro. El peso crece
con los años (`PESO_PRODUCTOR`); NASA se lleva el resto. Sin mediciones, todo sale de NASA.

Formas de entrada (`entradas["mediciones"]`, todas opcionales):
- `lluvia_anual_mm` + `anios_registro`: un número anual del pluviómetro.
- `serie_mensual`: [{mes: "AAAA-MM", lluvia_mm?, t_min_c?, t_max_c?}]. En temperatura, la mínima
  más baja y la máxima más alta del mes (lo mismo que POWER mensual). Si trae lluvia, manda sobre
  el número anual.

Qué se mezcla:
- Lluvia: un factor productor/NASA (anual, o uno por mes con la serie) escala la lluvia de cada
  mes de los tres tipos de año: `pp × (w·f + 1 − w)`.
- Heladas (mínima < 0 °C) y calor (máxima ≥ 35 °C): frecuencia por mes `w·productor + (1 − w)·NASA`.
- La ET0 sigue siendo la de NASA (Hargreaves necesita la temperatura media y la amplitud diaria,
  y las del productor son extremos del mes).

Funciones puras: sin red ni disco. Solo importa del propio dominio.
"""
from __future__ import annotations

import math

from app.motor.cultivos import MESES, pct

TIPOS = ("seco", "normal", "humedo")

# Peso del productor según sus años de registro: (años mínimos, peso). Lo calibra la persona 3.
PESO_PRODUCTOR = ((10, 0.75), (5, 0.60), (3, 0.50), (1, 0.40))
FACTOR_MIN, FACTOR_MAX = 0.5, 1.5   # un factor productor/NASA fuera de esto es más error que señal
UMBRAL_HELADA_C = 0.0               # el mismo que clima/indicadores.py
UMBRAL_CALOR_C = 35.0


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


def _nasa_mensual(terciles: dict) -> list[float]:
    """Lluvia media de NASA por mes, ponderada por la cantidad de campañas de cada tipo."""
    n = sum(terciles[t].get("n", 0) for t in TIPOS) or 1
    return [sum(terciles[t]["pp"][m] * terciles[t].get("n", 0) for t in TIPOS) / n for m in range(12)]


def _lluvia(mediciones: dict, terciles: dict) -> tuple[list[float], float, int, str | None]:
    """(factor por mes, peso, años, texto) para la lluvia. Factor 1 y peso 0 si no hay dato."""
    nasa_mes = _nasa_mensual(terciles)
    nasa_anual = sum(nasa_mes)
    por_mes = _por_mes(mediciones.get("serie_mensual") or [], "lluvia_mm")
    if any(por_mes):
        anios = min(len(v) for v in por_mes if v)
        w = peso_productor(anios)
        factores = [_limitar((sum(v) / len(v)) / nasa_mes[m]) if v and nasa_mes[m] > 0 else 1.0
                    for m, v in enumerate(por_mes)]
        prod_anual = sum(sum(v) / len(v) if v else nasa_mes[m] for m, v in enumerate(por_mes))
        texto = (f"Lluvia: tu registro mensual {prod_anual:.0f} mm/año ({pct(w)}, {anios} años) + "
                 f"NASA POWER {nasa_anual:.0f} mm ({pct(1 - w)})")
        return factores, w, anios, texto
    anual = _num(mediciones.get("lluvia_anual_mm"))
    if anual and anual > 0 and nasa_anual > 0:
        anios = int(_num(mediciones.get("anios_registro")) or 1)
        w = peso_productor(anios)
        f = _limitar(anual / nasa_anual)
        texto = (f"Lluvia: tu pluviómetro {anual:.0f} mm/año ({pct(w)}, {anios} "
                 f"{'año' if anios == 1 else 'años'}) + NASA POWER {nasa_anual:.0f} mm ({pct(1 - w)})")
        return [f] * 12, w, anios, texto
    return [1.0] * 12, 0.0, 0, None


def _frecuencia(mediciones: dict, clave: str, nasa_anios: list[int], n_nasa: int,
                es_evento) -> tuple[list[float], float, int, list[float] | None]:
    """(frecuencia mezclada, peso, años, frecuencia del productor) de heladas o calor por mes."""
    nasa = [nasa_anios[m] / n_nasa if n_nasa else 0.0 for m in range(12)]
    por_mes = _por_mes(mediciones.get("serie_mensual") or [], clave)
    if not any(por_mes):
        return nasa, 0.0, 0, None
    anios = min(len(v) for v in por_mes if v)
    w = peso_productor(anios)
    prod = [sum(1 for x in v if es_evento(x)) / len(v) if v else None for v in por_mes]
    mezcla = [w * p + (1 - w) * nasa[m] if p is not None else nasa[m] for m, p in enumerate(prod)]
    return mezcla, w, anios, [p if p is not None else nasa[m] for m, p in enumerate(prod)]


def mezclar(entradas: dict, ind: dict) -> dict:
    """Clima que usan las reglas: terciles de lluvia/ET0 y frecuencias de helada y calor por mes.

    Devuelve {terciles, helada, calor, lluvia_nasa_mm, lluvia_mm, pesos{lluvia, helada, calor},
              anios{...}, datos[str], hay_productor, hay_et0}.
    """
    mediciones = entradas.get("mediciones") or {}
    terciles_nasa = ind["terciles"]
    n_nasa = ind.get("n_anios") or 0

    factores, w_ll, anios_ll, texto_ll = _lluvia(mediciones, terciles_nasa)
    terciles = {}
    for t in TIPOS:
        ter = terciles_nasa[t]
        terciles[t] = {
            "pp": [ter["pp"][m] * (w_ll * factores[m] + 1 - w_ll) for m in range(12)],
            "pp_nasa": list(ter["pp"]),
            "et0": list(ter["et0"]) if ter.get("et0") else None,
            "n": ter.get("n", 0),
        }

    helada, w_h, anios_h, prod_h = _frecuencia(mediciones, "t_min_c", ind["anios_con_helada"], n_nasa,
                                               lambda x: x < UMBRAL_HELADA_C)
    calor, w_c, anios_c, prod_c = _frecuencia(mediciones, "t_max_c", ind["anios_con_calor"], n_nasa,
                                              lambda x: x >= UMBRAL_CALOR_C)

    datos = []
    lluvia_nasa = sum(_nasa_mensual(terciles_nasa))
    lluvia = sum(_nasa_mensual(terciles))
    if texto_ll:
        datos.append(f"{texto_ll} → {lluvia:.0f} mm/año para las reglas")
    for nombre_ev, w, anios, prod, mezcla, clave in (("Heladas", w_h, anios_h, prod_h, helada, "anios_con_helada"),
                                                      ("Calor", w_c, anios_c, prod_c, calor, "anios_con_calor")):
        if prod is None:
            continue
        cambios = [m for m in range(12) if abs(prod[m] - ind[clave][m] / (n_nasa or 1)) >= 0.15]
        detalle = "; ".join(f"{MESES[m]}: tu estación {pct(prod[m])}, NASA {pct(ind[clave][m] / (n_nasa or 1))}"
                            for m in cambios[:3]) or "coinciden con NASA"
        datos.append(f"{nombre_ev}: tu estación ({pct(w)}, {anios} años) + NASA POWER ({pct(1 - w)}) · {detalle}")

    return {
        "terciles": terciles,
        "helada": helada,
        "calor": calor,
        "lluvia_nasa_mm": lluvia_nasa,
        "lluvia_mm": lluvia,
        "pesos": {"lluvia": w_ll, "helada": w_h, "calor": w_c},
        "anios": {"lluvia": anios_ll, "helada": anios_h, "calor": anios_c},
        "datos": datos,
        "hay_productor": bool(w_ll or w_h or w_c),
        "hay_et0": all(terciles[t]["et0"] for t in TIPOS),
    }
