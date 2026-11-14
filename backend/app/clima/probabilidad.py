"""Probabilidades climáticas de una rotación (RF25, dueño: Back 1).

Frecuencia observada en las 30 campañas de NASA POWER, para los meses que importan en cada
alternativa. Siempre con el conteo de años ("k de n años"), no solo el porcentaje.
Porta `probs()` del prototipo (docs/prototipo/field-shift-prototipo.html) con los mismos textos:

- Helada: entre los meses con un cultivo que no tolera helada y al menos un año con helada
  (mínima del mes < 0 °C), el de más años. Empate → el primero del calendario (enero primero).
- Siembra seca: los meses de siembra (primer mes de cada cultivo recorriendo la campaña julio →
  junio: el cultivo cambia respecto del mes anterior), sin repetir cultivo. Primero los cultivos
  que no están en la rotación actual; se toman hasta 2. k = años en que la lluvia de ese mes fue
  menor que la mitad de la lluvia media de ese mes en las campañas.
- Calor: entre los meses con un cultivo de grupo verano, el de más años con máxima ≥ 35 °C
  (solo si hay al menos uno).

pct = round(k / n · 100). Los meses y los nombres de cultivo van en minúscula.

`cultivos` lo arma `servicio.py` desde `app/motor/cultivos.py` (clima no puede importar motor):
    {clave: {"nombre": str, "grupo": "verano"|"invierno"|"cobertura"|"barbecho", "tolera_helada": bool}}

Convención: arrays de 12 meses con índice 0 = enero. Nunca lanza: ante cualquier problema devuelve [].

Correr desde backend/:  py -m app.clima.probabilidad
"""

from __future__ import annotations

from app.api.contrato import Probabilidad
from app.clima.indicadores import MESES, ResultadoClima, calcular
from app.clima.power import FUENTE, LAT_DEMO, LON_DEMO, RESOLUCION, pedir_power

BARBECHO = "barbecho"
ORDEN_CAMPANA = (6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5)  # julio → junio
FRACCION_SIEMBRA_SECA = 0.5  # lluvia del mes < 50 % de la media de ese mes
MAX_SIEMBRAS = 2


def _pct(k: int, n: int) -> int:
    # Como Math.round de JS para valores positivos (round de Python redondea al par en .5).
    return int(k / n * 100 + 0.5)


def _con_cultivo(calendario: list[str], cultivos: dict[str, dict]) -> list[tuple[int, str]]:
    """(mes, clave) de los meses con un cultivo conocido; barbecho no cuenta."""
    return [(m, x) for m, x in enumerate(calendario) if x != BARBECHO and x in cultivos]


def _nombre(cultivos: dict[str, dict], clave: str) -> str:
    return str(cultivos[clave].get("nombre", clave)).lower()


def _helada(calendario, cultivos, clima: ResultadoClima, fuente: str) -> list[Probabilidad]:
    n, fr = clima.n, clima.clima_mensual.anios_con_helada
    candidatos = [
        (m, x)
        for m, x in _con_cultivo(calendario, cultivos)
        if not cultivos[x].get("tolera_helada", False) and fr[m] > 0
    ]
    if not candidatos:
        return []
    m, x = max(candidatos, key=lambda o: fr[o[0]])  # max se queda con el primero en un empate
    k = fr[m]
    return [
        Probabilidad(
            evento="helada",
            mes=m,
            cultivo=x,
            anios=k,
            de=n,
            pct=_pct(k, n),
            fuente=fuente,
            texto=f"Helada en {MESES[m]} con {_nombre(cultivos, x)} en el lote: {k} de {n} años ({_pct(k, n)} %)",
        )
    ]


def meses_de_siembra(calendario: list[str]) -> list[tuple[int, str]]:
    """Primer mes de cada cultivo recorriendo la campaña julio → junio, sin repetir cultivo."""
    siembras: list[tuple[int, str]] = []
    for i, m in enumerate(ORDEN_CAMPANA):
        x, previo = calendario[m], calendario[ORDEN_CAMPANA[(i + 11) % 12]]
        if x != BARBECHO and x != previo and all(x != s for _, s in siembras):
            siembras.append((m, x))
    return siembras


def _siembra_seca(calendario, cultivos, clima: ResultadoClima, calendario_actual, fuente: str) -> list[Probabilidad]:
    n = clima.n
    actuales = set(calendario_actual or [])
    siembras = [(m, x) for m, x in meses_de_siembra(calendario) if x in cultivos]
    # Primero el cultivo que distingue a esta alternativa de la rotación actual (orden estable).
    siembras.sort(key=lambda o: o[1] in actuales)
    salida = []
    for m, x in siembras[:MAX_SIEMBRAS]:
        lluvias = [c.lluvia_mm[m] for c in clima.campanas]
        media = sum(lluvias) / len(lluvias)
        k = sum(1 for v in lluvias if v < media * FRACCION_SIEMBRA_SECA)
        salida.append(
            Probabilidad(
                evento="siembra_seca",
                mes=m,
                cultivo=x,
                anios=k,
                de=n,
                pct=_pct(k, n),
                fuente=fuente,
                texto=(
                    f"Siembra de {_nombre(cultivos, x)} ({MESES[m]}) con menos de la mitad de la lluvia normal: "
                    f"{k} de {n} años ({_pct(k, n)} %)"
                ),
            )
        )
    return salida


def _calor(calendario, cultivos, clima: ResultadoClima, fuente: str) -> list[Probabilidad]:
    n, hot = clima.n, clima.clima_mensual.anios_con_35c
    candidatos = [(m, x) for m, x in _con_cultivo(calendario, cultivos) if cultivos[x].get("grupo") == "verano"]
    if not candidatos:
        return []
    m, x = max(candidatos, key=lambda o: hot[o[0]])
    k = hot[m]
    if k <= 0:
        return []
    return [
        Probabilidad(
            evento="calor",
            mes=m,
            cultivo=x,
            anios=k,
            de=n,
            pct=_pct(k, n),
            fuente=fuente,
            texto=f"Máxima de 35 °C o más en {MESES[m]} con {_nombre(cultivos, x)}: {k} de {n} años ({_pct(k, n)} %)",
        )
    ]


def probabilidades(
    calendario: list[str], cultivos: dict[str, dict], clima: ResultadoClima, calendario_actual: list[str]
) -> list[Probabilidad]:
    """Helada, siembra seca y calor de una rotación, en ese orden. Nunca lanza: si falta algo, []."""
    try:
        if not clima.ok or clima.n <= 0 or not clima.campanas or clima.clima_mensual is None or len(calendario) != 12:
            return []
        fuente = f"{FUENTE} · {RESOLUCION} · {clima.periodo}"
        return (
            _helada(calendario, cultivos, clima, fuente)
            + _siembra_seca(calendario, cultivos, clima, calendario_actual, fuente)
            + _calor(calendario, cultivos, clima, fuente)
        )
    except Exception:  # noqa: BLE001 — nunca hacia afuera: sin probabilidades para esta columna
        return []


# Catálogo mínimo para correr el lote demo sin importar motor (mismos datos que el prototipo).
CULTIVOS_DEMO = {
    "soja": {"nombre": "Soja", "grupo": "verano", "tolera_helada": False},
    "vicia": {"nombre": "Vicia", "grupo": "cobertura", "tolera_helada": True},
    "barbecho": {"nombre": "Barbecho", "grupo": "barbecho", "tolera_helada": True},
}
# Índice 0 = enero. Soja de noviembre a abril; vicia de mayo a septiembre.
SOJA_BARBECHO = ["soja"] * 4 + ["barbecho"] * 6 + ["soja"] * 2
SOJA_VICIA = ["soja"] * 4 + ["vicia"] * 5 + ["barbecho"] + ["soja"] * 2


if __name__ == "__main__":
    r = calcular(pedir_power(LAT_DEMO, LON_DEMO), LAT_DEMO, LON_DEMO)
    if not r.ok:
        print(f"Error: {r.motivo}")
        raise SystemExit(1)
    for titulo, cal in (("Soja + barbecho (actual)", SOJA_BARBECHO), ("Soja + vicia", SOJA_VICIA)):
        print(f"{titulo}:")
        for p in probabilidades(cal, CULTIVOS_DEMO, r, SOJA_BARBECHO):
            print(f"  [{p.evento}] {p.texto}")
    print(f"Fuente: {FUENTE} · {RESOLUCION} · {r.periodo}")
