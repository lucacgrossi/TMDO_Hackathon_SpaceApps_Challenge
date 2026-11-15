"""Serie por campaña (RF24, Could; dueño: Back 1).

Entra el `ResultadoClima` de `clima/indicadores.py` y sale la `SerieAnual` del contrato: la
lluvia (y el balance, si hay ET0) de cada campaña julio–junio, en orden cronológico, con el
tercio que ya le asignó `indicadores.py`. Mismo período y misma celda que el resto del clima.

Cada campaña trae también sus 12 meses (`mensual`: lluvia, T mín, T máx, ET0 y balance, con
índice 0 = enero) para elegirla en Clima histórico y verla contra la media de 30 años (4.5).

Con n campañas se toma k = min(10, n // 3), como `serieHTML()` del prototipo:
- `ultimas_10_mm`: lluvia media de las últimas k campañas.
- `previas_20_mm`: lluvia media de las n − k anteriores.
- `secos_en_ultimas_10`: cuántas de las últimas k quedaron en el tercio seco.
Con las 30 campañas de siempre, k = 10 y n − k = 20 (de ahí los nombres de los campos).

Describe, no proyecta: son medias de lo que ya pasó. No hay tendencia, regresión ni pronóstico.
Nunca lanza: si el clima no está (`ok` False) o algo sale mal, devuelve None.

Correr desde backend/:  py -m app.clima.serie
"""

from __future__ import annotations

from app.api.contrato import CampanaSerie, MesesCampana, SerieAnual
from app.clima.indicadores import CampanaClima, ResultadoClima, calcular
from app.clima.power import FUENTE, LAT_DEMO, LON_DEMO, RESOLUCION, pedir_power

MAX_ULTIMAS = 10


def ventana(n: int) -> int:
    """Cuántas campañas forman el grupo de "últimas": k = min(10, n // 3)."""
    return min(MAX_ULTIMAS, n // 3)


def _media(valores: list[float]) -> float:
    return sum(valores) / len(valores)


def _r(valores: list[float] | None) -> list[float] | None:
    return [round(v, 1) for v in valores] if valores is not None else None


def meses(c: CampanaClima) -> MesesCampana:
    """Los 12 meses de la campaña, redondeados a 0,1 (índice 0 = enero)."""
    return MesesCampana(lluvia_mm=_r(c.lluvia_mm), t_min_c=_r(c.t_min_c), t_max_c=_r(c.t_max_c),
                        et0_mm=_r(c.et0_mm), balance_mm=_r(c.balance_mm))


def serie_anual(clima: ResultadoClima) -> SerieAnual | None:
    """Serie de las campañas con el promedio de las últimas k contra las previas. Nunca lanza."""
    try:
        if not clima.ok or not clima.campanas or not clima.periodo:
            return None
        campanas = clima.campanas
        n = len(campanas)
        k = ventana(n)
        if k == 0:
            return None
        previas, ultimas = campanas[: n - k], campanas[n - k:]
        filas = [
            CampanaSerie(
                campana=c.etiqueta,
                lluvia_mm=round(c.lluvia_total_mm),
                balance_mm=round(c.balance_total_mm) if c.balance_total_mm is not None else None,
                tipo=c.tipo,
                mensual=meses(c),
            )
            for c in campanas
        ]
        return SerieAnual(
            fuente=FUENTE,
            resolucion=RESOLUCION,
            periodo=clima.periodo,
            campanas=filas,
            ultimas_10_mm=round(_media([c.lluvia_total_mm for c in ultimas]), 1),
            previas_20_mm=round(_media([c.lluvia_total_mm for c in previas]), 1),
            secos_en_ultimas_10=sum(1 for c in ultimas if c.tipo == "seco"),
        )
    except Exception:  # noqa: BLE001 — nunca hacia afuera: sin serie, el resto de la tabla sigue
        return None


if __name__ == "__main__":
    s = serie_anual(calcular(pedir_power(LAT_DEMO, LON_DEMO), LAT_DEMO, LON_DEMO))
    if s is None:
        print("Sin serie: NASA POWER no respondió o no hay campañas suficientes.")
        raise SystemExit(1)
    n = len(s.campanas)
    k = ventana(n)
    print(f"{s.fuente} · {s.resolucion} · {s.periodo} · {n} campañas")
    print(f"{'campaña':9}{'lluvia':>8}{'balance':>9}  tipo")
    for i, c in enumerate(s.campanas):
        corte = "  ← últimas" if i == n - k else ""
        balance = f"{c.balance_mm:9.0f}" if c.balance_mm is not None else f"{'—':>9}"
        print(f"{c.campana:9}{c.lluvia_mm:8.0f}{balance}  {c.tipo}{corte}")
    print(f"Últimas {k}: {s.ultimas_10_mm} mm · {n - k} previas: {s.previas_20_mm} mm")
    print(f"{s.secos_en_ultimas_10} de las últimas {k}, en el tercio seco")
