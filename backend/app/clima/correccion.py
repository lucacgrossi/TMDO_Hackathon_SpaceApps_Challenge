"""Contraste de las mediciones del productor con NASA (RF15, CU4) (dueño: Back 1).

Las mediciones del productor se muestran **al lado** de NASA y **no cambian ningún puntaje**:
NASA sigue siendo la base. Lo único que cambia es la confianza de los indicadores de agua.

- Lluvia del pluviómetro contra la lluvia media por campaña julio–junio de NASA POWER
  (`indicadores["lluvia_anual"]`):
      diferencia_pct = round((productor − NASA) / NASA · 100)
  |diferencia| > 15 % → confianza "baja" en agua, una nota en la fila y un punto para
  "A revisar con el agrónomo". Si no, "alta" (coinciden).
- "Corregido al lado" (solo informativo): el umbral de lluvia del año seco escalado por
  productor / NASA. Si los tipos de año se cortaron por balance (lluvia − ET0), el umbral de
  balance no se puede escalar por la lluvia: se usa la lluvia de la campaña seca más lluviosa
  y se dice en la nota.
- Pocos años de registro (< `MIN_ANIOS_REGISTRO`): la fila se muestra igual, con confianza
  "baja" y la nota "pocos años de registro". La confianza del agua la sigue decidiendo solo la
  diferencia con NASA: un registro corto no empeora el dato de NASA.
- Materia orgánica: fila "dato del productor", sin valor de NASA (no hay producto de NASA de
  materia orgánica). Va a la fila Suelo.
- NASA POWER caído: la lluvia se muestra sin comparar y la fila lo dice.

Textos de plantilla fija, sin IA. Nunca lanza.

Correr desde backend/:  py -m app.clima.correccion
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.api.contrato import ContrasteMedicion, CorregidoAlLado, MedicionesPropias
from app.clima.indicadores import ResultadoClima

UMBRAL_DIFERENCIA_PCT = 15  # RF15: más de 15 % de diferencia → confianza baja en agua
MIN_ANIOS_REGISTRO = 5  # propuesta: con menos años, el contraste tiene confianza baja
# Indicadores de `ResultadoClima.indicadores` que dependen de la lluvia: a estos les baja la confianza.
# La ET0 sale de las temperaturas, no de la lluvia: no se toca.
INDICADORES_AGUA = ("lluvia_anual", "balance_anual")

ConfianzaAgua = Literal["alta", "baja"]


@dataclass
class ResultadoContraste:
    """Lo que `servicio.py` pone en la salida. Nada de esto cambia un puntaje.

    - `contraste` → `Salida.contraste_mediciones`.
    - `riesgos` → "A revisar con el agrónomo".
    - `confianza_agua` → confianza de los indicadores de agua: "baja" si el pluviómetro difiere
      más de 15 % de NASA; "alta" si coinciden (no hace falta cambiar nada); None si no hubo
      comparación (sin pluviómetro o sin NASA POWER). Se aplica a `INDICADORES_AGUA`.
    - `motivo_agua` → el `motivo` de esos indicadores cuando la confianza baja.
    - `faltantes` → "Información que falta" (solo si el contraste no se pudo armar).
    """

    contraste: list[ContrasteMedicion] = field(default_factory=list)
    riesgos: list[str] = field(default_factory=list)
    confianza_agua: ConfianzaAgua | None = None
    motivo_agua: str | None = None
    faltantes: list[str] = field(default_factory=list)


# --- Formato -----------------------------------------------------------------


def _mm(x: float) -> str:
    """Milímetros redondeados con punto de miles: 1.204."""
    return f"{round(x):,}".replace(",", ".")


def _pct(d: int) -> str:
    """Diferencia con signo tipográfico: +5 %, −21 %, 0 %."""
    signo = "+" if d > 0 else "−" if d < 0 else ""
    return f"{signo}{abs(d)} %"


def _decimal(x: float) -> str:
    """Un decimal con coma: 2,8."""
    return f"{x:.1f}".replace(".", ",")


# --- Lluvia ------------------------------------------------------------------


def _umbral_seco_lluvia(clima: ResultadoClima) -> tuple[float | None, bool]:
    """Umbral de lluvia del año seco y si viene del corte por balance."""
    tipos = clima.tipos_de_anio
    if tipos is None:
        return None, False
    if tipos.metodo == "terciles_lluvia":
        return tipos.umbral_seco_mm, False
    secas = [c.lluvia_total_mm for c in clima.campanas if c.tipo == "seco"]
    return (max(secas), True) if secas else (None, True)


def _corregido(clima: ResultadoClima, factor: float) -> CorregidoAlLado | None:
    umbral, por_balance = _umbral_seco_lluvia(clima)
    if umbral is None:
        return None
    corregido = umbral * factor
    nota = f"Corregido con tu pluviómetro, al lado de NASA: año seco hasta {_mm(corregido)} mm (NASA: {_mm(umbral)} mm)"
    if por_balance:
        nota += (
            ". Los tipos de año se cortan por balance (lluvia − ET0); se escala la lluvia de la campaña "
            "seca más lluviosa"
        )
    nota += ". Solo informativo: no cambia ningún puntaje."
    return CorregidoAlLado(umbral_seco_mm=round(corregido, 1), nota=nota)


def _lluvia(mm: float, anios: int | None, clima: ResultadoClima, salida: ResultadoContraste) -> None:
    pocos_anios = anios is not None and anios < MIN_ANIOS_REGISTRO
    nota_anios = (
        f" · pocos años de registro ({anios}, menos de {MIN_ANIOS_REGISTRO}): contraste con confianza baja"
        if pocos_anios
        else ""
    )
    if pocos_anios:
        salida.riesgos.append(
            f"Tu pluviómetro tiene {anios} años de registro (menos de {MIN_ANIOS_REGISTRO}): "
            "el contraste con NASA tiene confianza baja"
        )

    ind = clima.indicadores.get("lluvia_anual")
    nasa = ind.valor if ind is not None else None
    if not clima.ok or nasa is None or nasa <= 0:
        salida.contraste.append(
            ContrasteMedicion(
                indicador="lluvia_anual",
                valor_productor=mm,
                valor_nasa=None,
                unidad="mm/año",
                diferencia_pct=None,
                confianza_resultante="baja" if pocos_anios else None,
                corregido_al_lado=None,
                texto=f"Tu pluviómetro: {_mm(mm)} mm/año · NASA POWER sin dato: no se pudo comparar{nota_anios}",
            )
        )
        return

    d = round((mm - nasa) / nasa * 100)
    difieren = abs(d) > UMBRAL_DIFERENCIA_PCT
    salida.confianza_agua = "baja" if difieren else "alta"
    estado = (
        f"difieren más de {UMBRAL_DIFERENCIA_PCT} %: confianza baja en agua"
        if difieren
        else "coinciden: confianza alta"
    )
    salida.contraste.append(
        ContrasteMedicion(
            indicador="lluvia_anual",
            valor_productor=mm,
            valor_nasa=nasa,
            unidad="mm/año",
            diferencia_pct=d,
            confianza_resultante="baja" if difieren or pocos_anios else "alta",
            corregido_al_lado=_corregido(clima, mm / nasa),
            texto=f"Tu pluviómetro: {_mm(mm)} mm/año · NASA: {_mm(nasa)} mm ({_pct(d)}) · {estado}{nota_anios}",
        )
    )
    if difieren:
        salida.motivo_agua = (
            f"Tu pluviómetro difiere {abs(d)} % de NASA POWER ({_mm(mm)} contra {_mm(nasa)} "
            "mm/año): confianza baja en agua. No cambia ningún puntaje"
        )
        salida.riesgos.append(
            f"Tu pluviómetro difiere {abs(d)} % de NASA POWER ({_mm(mm)} contra {_mm(nasa)} mm/año): "
            "el dato de agua tiene confianza baja"
        )


# --- Materia orgánica --------------------------------------------------------


def _materia_organica(pct: float, salida: ResultadoContraste) -> None:
    salida.contraste.append(
        ContrasteMedicion(
            indicador="materia_organica",
            valor_productor=pct,
            valor_nasa=None,
            unidad="%",
            diferencia_pct=None,
            confianza_resultante=None,
            corregido_al_lado=None,
            texto=f"Materia orgánica: {_decimal(pct)} % (dato del productor) · sin fuente NASA de materia orgánica "
            "para comparar",
        )
    )


# --- Público -----------------------------------------------------------------


def contrastar(mediciones: MedicionesPropias | None, clima: ResultadoClima) -> ResultadoContraste:
    """Pone las mediciones del productor al lado de NASA. No cambia puntajes. Nunca lanza."""
    salida = ResultadoContraste()
    if mediciones is None:
        return salida
    try:
        if mediciones.lluvia_anual_mm is not None:
            _lluvia(mediciones.lluvia_anual_mm, mediciones.anios_registro, clima, salida)
        if mediciones.materia_organica_pct is not None:
            _materia_organica(mediciones.materia_organica_pct, salida)
        return salida
    except Exception as e:  # noqa: BLE001 — nunca hacia afuera: va a "Información que falta"
        return ResultadoContraste(faltantes=[f"Contraste con tus mediciones: no se pudo armar ({type(e).__name__})"])


if __name__ == "__main__":
    import sys

    from app.clima.indicadores import calcular
    from app.clima.power import LAT_DEMO, LON_DEMO, pedir_power

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # la consola de Windows (cp1252) no tiene "−"
    clima = calcular(pedir_power(LAT_DEMO, LON_DEMO), LAT_DEMO, LON_DEMO)
    if not clima.ok:
        print(f"NASA POWER: {clima.motivo}")
    r = contrastar(MedicionesPropias(lluvia_anual_mm=650, anios_registro=10), clima)
    print(f"Período NASA: {clima.periodo} · confianza del agua: {r.confianza_agua}")
    for c in r.contraste:
        print(f"  {c.texto}")
        if c.corregido_al_lado:
            print(f"    {c.corregido_al_lado.nota} [umbral_seco_mm = {c.corregido_al_lado.umbral_seco_mm}]")
    for riesgo in r.riesgos:
        print(f"  A revisar con el agrónomo: {riesgo}")
    for f in r.faltantes:
        print(f"  Información que falta: {f}")
