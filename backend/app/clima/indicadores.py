"""Indicadores climáticos del lote a partir de las 30 campañas de NASA POWER (dueño: Back 1).

Entra la `SeriePower` de `clima/power.py` (un solo pedido mensual) y sale todo lo climático
que usan el contrato y el motor de reglas, siempre del mismo período:

- ET0 de Hargreaves (FAO-56, ec. 52) por mes y campaña, con la radiación extraterrestre
  Ra de la latitud (FAO-56, ec. 21–25):
      ET0 [mm/día] = 0,0023 · (T2M + 17,8) · √T2M_RANGE · Ra [mm/día]
  T2M es la media del mes y T2M_RANGE la amplitud diaria media (no se usan T2M_MIN/T2M_MAX,
  que en POWER mensual son extremos del mes). ET0 del mes = ET0 diaria × días del mes.
- Balance hídrico = lluvia − ET0 (mm), por mes y por campaña.
- `clima_mensual`: climatología de 30 años por mes; años con helada (mínima del mes < 0 °C)
  y años con máxima ≥ 35 °C; "helada frecuente" si hubo helada en al menos 1 de cada 3 años.
- `tipos_de_anio`: las campañas se ordenan por balance (si falta la ET0, por lluvia, y se
  dice en `metodo`) y se cortan en tercios: puesto i < round(n/3) → seco, i < round(2n/3)
  → normal, el resto húmedo (regla del prototipo).
- `terciles_motor`: lluvia y ET0 medias de cada tercio, mes a mes, con la forma que pide
  `app/motor/reglas.py` (persona 3).
- `clima_celda`: la celda de POWER (0,5° × 0,625°) y dónde cae el lote, para dibujarla a la
  escala real del dato (`climaPos` del prototipo).

Convención: todo array de 12 meses va con índice 0 = enero. Nunca lanza: si POWER falló,
devuelve `ok=False`, indicadores `sin_dato` y el motivo para "Información que falta".

Correr desde backend/:  py -m app.clima.indicadores
"""

from __future__ import annotations

import calendar
import math
from dataclasses import dataclass, field

from app.api.contrato import ClimaCelda, ClimaMensual, Indicador, TiposDeAnio
from app.clima.power import CAMPANAS_MAX, FUENTE, LAT_DEMO, LON_DEMO, RESOLUCION, SeriePower, celda_power, pedir_power

TIPOS = ("seco", "normal", "humedo")
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")

# FAO-56
GSC = 0.0820            # constante solar, MJ m⁻² min⁻¹
MJ_A_MM = 0.408         # MJ m⁻² día⁻¹ → mm/día equivalentes de evaporación
HARGREAVES_K = 0.0023
DIA_JULIANO_MEDIO = (15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349)  # día 15 de cada mes

UMBRAL_HELADA_C = 0.0   # mínima del mes por debajo → hubo helada ese mes
UMBRAL_CALOR_C = 35.0   # máxima del mes igual o por encima → hubo día de 35 °C o más
FRACCION_HELADA_FRECUENTE = 1 / 3
BORDE_CELDA = 0.15      # a menos del 15 % del borde → "cerca del borde"

FUENTE_ET0 = "Hargreaves (FAO-56) con T2M y T2M_RANGE de NASA POWER"
FUENTE_BALANCE = "NASA POWER (lluvia) − ET0 de Hargreaves (FAO-56)"


# --- Fórmulas FAO-56 ---------------------------------------------------------

def ra_mm_dia(lat: float, dia_juliano: int) -> float | None:
    """Radiación extraterrestre Ra en mm/día (FAO-56, ec. 21–25). None en latitudes polares sin solución."""
    phi = math.radians(lat)
    dr = 1 + 0.033 * math.cos(2 * math.pi * dia_juliano / 365)
    delta = 0.409 * math.sin(2 * math.pi * dia_juliano / 365 - 1.39)
    x = -math.tan(phi) * math.tan(delta)
    if not -1 <= x <= 1:
        return None
    ws = math.acos(x)
    ra_mj = (24 * 60 / math.pi) * GSC * dr * (
        ws * math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.sin(ws))
    return ra_mj * MJ_A_MM


def et0_hargreaves_dia(t_media_c: float, amplitud_c: float, ra: float) -> float:
    """ET0 de referencia en mm/día (FAO-56, ec. 52)."""
    return HARGREAVES_K * (t_media_c + 17.8) * math.sqrt(max(amplitud_c, 0.0)) * ra


# --- Resultado ---------------------------------------------------------------

@dataclass
class CampanaClima:
    """Una campaña julio–junio con su ET0 y su balance. Arrays de 12, índice 0 = enero."""

    etiqueta: str
    lluvia_mm: list[float]
    et0_mm: list[float] | None
    balance_mm: list[float] | None
    t_min_c: list[float]
    t_max_c: list[float]
    tipo: str | None = None

    @property
    def lluvia_total_mm(self) -> float:
        return sum(self.lluvia_mm)

    @property
    def balance_total_mm(self) -> float | None:
        return sum(self.balance_mm) if self.balance_mm is not None else None


@dataclass
class ResultadoClima:
    """Todo lo climático del lote. Si `ok` es False, `motivo` va a "Información que falta"."""

    ok: bool
    motivo: str | None = None
    periodo: str | None = None
    n: int = 0
    campanas: list[CampanaClima] = field(default_factory=list)
    clima_mensual: ClimaMensual | None = None
    tipos_de_anio: TiposDeAnio | None = None
    terciles_motor: dict | None = None
    clima_celda: ClimaCelda | None = None
    indicadores: dict[str, Indicador] = field(default_factory=dict)
    faltantes: list[str] = field(default_factory=list)


# --- Cálculo -----------------------------------------------------------------

def _media(valores: list[float]) -> float:
    return sum(valores) / len(valores)


def _dias_del_mes(anio_inicio: int, mes: int) -> int:
    """Mes 0 = enero. Julio a diciembre son del año de inicio; enero a junio, del siguiente."""
    anio = anio_inicio + 1 if mes < 6 else anio_inicio
    return calendar.monthrange(anio, mes + 1)[1]


def _campanas_clima(serie: SeriePower, lat: float) -> list[CampanaClima]:
    ra = [ra_mm_dia(lat, d) for d in DIA_JULIANO_MEDIO]
    hay_et0 = all(r is not None for r in ra)
    salida = []
    for c in serie.campanas:
        et0 = balance = None
        if hay_et0:
            et0 = [et0_hargreaves_dia(c.t_media_c[m], c.amplitud_diaria_c[m], ra[m]) * _dias_del_mes(c.anio_inicio, m)
                   for m in range(12)]
            balance = [c.lluvia_mm[m] - et0[m] for m in range(12)]
        salida.append(CampanaClima(etiqueta=c.etiqueta, lluvia_mm=list(c.lluvia_mm), et0_mm=et0,
                                   balance_mm=balance, t_min_c=list(c.t_min_c), t_max_c=list(c.t_max_c)))
    return salida


def _cortar_terciles(campanas: list[CampanaClima]) -> TiposDeAnio:
    """Ordena por balance de la campaña (o por lluvia si no hay ET0) y corta en tercios."""
    por_balance = all(c.balance_mm is not None for c in campanas)
    valor = (lambda c: c.balance_total_mm) if por_balance else (lambda c: c.lluvia_total_mm)
    n = len(campanas)
    orden = sorted(campanas, key=valor)
    corte_seco, corte_normal = round(n / 3), round(2 * n / 3)
    for i, c in enumerate(orden):
        c.tipo = "seco" if i < corte_seco else "normal" if i < corte_normal else "humedo"
    grupos = {t: [c for c in campanas if c.tipo == t] for t in TIPOS}  # en orden cronológico
    return TiposDeAnio(
        metodo="terciles_balance" if por_balance else "terciles_lluvia",
        seco=[c.etiqueta for c in grupos["seco"]],
        normal=[c.etiqueta for c in grupos["normal"]],
        humedo=[c.etiqueta for c in grupos["humedo"]],
        umbral_seco_mm=round(max(valor(c) for c in grupos["seco"]), 1),
        umbral_humedo_mm=round(min(valor(c) for c in grupos["humedo"]), 1),
    )


def _terciles_motor(campanas: list[CampanaClima]) -> dict:
    """Forma de `indicadores["terciles"]` del motor: pp y et0 medios por mes de cada tercio."""
    salida = {}
    for t in TIPOS:
        grupo = [c for c in campanas if c.tipo == t]
        salida[t] = {
            "pp": [_media([c.lluvia_mm[m] for c in grupo]) for m in range(12)],
            "et0": [_media([c.et0_mm[m] for c in grupo]) for m in range(12)] if grupo[0].et0_mm else None,
            "n": len(grupo),
        }
    return salida


def _clima_mensual(serie: SeriePower, campanas: list[CampanaClima]) -> ClimaMensual:
    n = len(campanas)
    hel = [sum(1 for c in campanas if c.t_min_c[m] < UMBRAL_HELADA_C) for m in range(12)]
    calor = [sum(1 for c in campanas if c.t_max_c[m] >= UMBRAL_CALOR_C) for m in range(12)]
    hay_et0 = campanas[0].et0_mm is not None

    def prom(f) -> list[float]:
        return [round(_media([f(c, m) for c in campanas]), 1) for m in range(12)]

    return ClimaMensual(
        lluvia_mm=prom(lambda c, m: c.lluvia_mm[m]),
        minima_media_c=prom(lambda c, m: c.t_min_c[m]),
        maxima_media_c=prom(lambda c, m: c.t_max_c[m]),
        t_media_c=[round(_media([c.t_media_c[m] for c in serie.campanas]), 1) for m in range(12)],
        amplitud_diaria_c=[round(_media([c.amplitud_diaria_c[m] for c in serie.campanas]), 1) for m in range(12)],
        et0_mm=prom(lambda c, m: c.et0_mm[m]) if hay_et0 else [None] * 12,
        balance_mm=prom(lambda c, m: c.balance_mm[m]) if hay_et0 else [None] * 12,
        anios_con_helada=hel,
        anios_con_35c=calor,
        helada_frecuente=[h >= n * FRACCION_HELADA_FRECUENTE for h in hel],
        n_anios=n,
        periodo=serie.periodo,
        fuente=FUENTE,
        resolucion=RESOLUCION,
    )


def clima_celda(lat: float, lon: float) -> ClimaCelda:
    """Celda de POWER que contiene al lote y dónde cae el lote dentro de ella."""
    clat, clon = celda_power(lat, lon)
    oeste, sur, este, norte = clon - 0.3125, clat - 0.25, clon + 0.3125, clat + 0.25
    fy, fx = (lat - sur) / (norte - sur), (lon - oeste) / (este - oeste)
    ns = "sur" if fy < BORDE_CELDA else "norte" if fy > 1 - BORDE_CELDA else ""
    eo = "oeste" if fx < BORDE_CELDA else "este" if fx > 1 - BORDE_CELDA else ""
    posicion = f"cerca del borde {'-'.join(p for p in (ns, eo) if p)}" if ns or eo else "bien adentro"
    return ClimaCelda(bbox=(oeste, sur, este, norte), posicion_lote=posicion)


def _indicadores(serie: SeriePower, campanas: list[CampanaClima], mensual: ClimaMensual) -> dict[str, Indicador]:
    comunes = {"anios": serie.periodo, "resolucion": RESOLUCION}
    lluvia = _media([c.lluvia_total_mm for c in campanas])
    ind = {
        "lluvia_anual": Indicador(valor=round(lluvia), unidad="mm/campaña", fuente=FUENTE, confianza="media",
                                  nota=f"Media de {len(campanas)} campañas julio–junio; celda de ~50 km: contexto regional",
                                  **comunes),
        "meses_helada_frecuente": Indicador(
            valor=sum(mensual.helada_frecuente), unidad="meses", fuente=FUENTE, confianza="media",
            nota="Meses con mínima < 0 °C en al menos 1 de cada 3 años: "
                 + (", ".join(MESES[m] for m in range(12) if mensual.helada_frecuente[m]) or "ninguno"),
            **comunes),
    }
    if campanas[0].et0_mm is not None:
        et0 = _media([sum(c.et0_mm) for c in campanas])
        balance = _media([c.balance_total_mm for c in campanas])
        ind["et0_anual"] = Indicador(valor=round(et0), unidad="mm/campaña", fuente=FUENTE_ET0, confianza="media",
                                     nota="ET de referencia (cultivo de referencia), no la ET real del lote", **comunes)
        ind["balance_anual"] = Indicador(valor=round(balance), unidad="mm/campaña", fuente=FUENTE_BALANCE,
                                         confianza="media", nota="Lluvia − ET0, media de las campañas", **comunes)
    else:
        for clave, fuente in (("et0_anual", FUENTE_ET0), ("balance_anual", FUENTE_BALANCE)):
            ind[clave] = Indicador(valor=None, unidad="mm/campaña", fuente=fuente, confianza="sin_dato",
                                   motivo="Sin radiación extraterrestre para esta latitud", **comunes)
    return ind


def _sin_dato(motivo: str, lat: float, lon: float) -> ResultadoClima:
    ind = {
        clave: Indicador(valor=None, unidad=unidad, fuente=fuente, anios=None, resolucion=RESOLUCION,
                         confianza="sin_dato", motivo=motivo)
        for clave, unidad, fuente in (("lluvia_anual", "mm/campaña", FUENTE),
                                      ("meses_helada_frecuente", "meses", FUENTE),
                                      ("et0_anual", "mm/campaña", FUENTE_ET0),
                                      ("balance_anual", "mm/campaña", FUENTE_BALANCE))
    }
    return ResultadoClima(ok=False, motivo=motivo, clima_celda=clima_celda(lat, lon), indicadores=ind,
                          faltantes=[f"Clima de NASA POWER: {motivo}"])


def calcular(serie: SeriePower, lat: float, lon: float) -> ResultadoClima:
    """Indicadores climáticos a partir de la serie de POWER. Nunca lanza."""
    try:
        if not serie.ok or not serie.campanas:
            return _sin_dato(serie.motivo or "NASA POWER no devolvió campañas.", lat, lon)
        campanas = _campanas_clima(serie, lat)
        tipos = _cortar_terciles(campanas)
        mensual = _clima_mensual(serie, campanas)
        faltantes = []
        if len(campanas) < CAMPANAS_MAX:
            # POWER descarta las campañas con algún mes sin dato (−999): la serie es más corta y las
            # probabilidades se cuentan sobre menos años. Se dice, no se rellena.
            faltantes.append(f"Clima de NASA POWER: {len(campanas)} campañas completas de julio a junio, no "
                             f"{CAMPANAS_MAX} ({serie.periodo}); las campañas con meses sin dato se descartan")
        if tipos.metodo == "terciles_lluvia":
            faltantes.append("ET0 de Hargreaves: los tipos de año se cortaron por lluvia, no por balance")
        return ResultadoClima(
            ok=True, periodo=serie.periodo, n=len(campanas), campanas=campanas,
            clima_mensual=mensual, tipos_de_anio=tipos, terciles_motor=_terciles_motor(campanas),
            clima_celda=clima_celda(lat, lon), indicadores=_indicadores(serie, campanas, mensual),
            faltantes=faltantes,
        )
    except Exception as e:  # noqa: BLE001 — nunca hacia afuera: va a "Información que falta"
        return _sin_dato(f"No se pudieron calcular los indicadores climáticos ({type(e).__name__}).", lat, lon)


if __name__ == "__main__":
    r = calcular(pedir_power(LAT_DEMO, LON_DEMO), LAT_DEMO, LON_DEMO)
    if not r.ok:
        print(f"Error: {r.motivo}")
        raise SystemExit(1)
    m, t = r.clima_mensual, r.tipos_de_anio
    print(f"Período: {r.periodo} · n = {r.n} · celda {r.clima_celda.bbox} ({r.clima_celda.posicion_lote})")
    for clave, ind in r.indicadores.items():
        print(f"  {clave:24} {ind.valor} {ind.unidad} · {ind.fuente} · confianza {ind.confianza}")
    print(f"{'mes':11}{'lluvia':>8}{'ET0':>7}{'balance':>9}{'tmin':>7}{'tmax':>7}{'helada':>8}{'≥35':>5}")
    for i in range(12):
        print(f"{MESES[i]:11}{m.lluvia_mm[i]:8.0f}{m.et0_mm[i]:7.0f}{m.balance_mm[i]:9.0f}{m.minima_media_c[i]:7.1f}"
              f"{m.maxima_media_c[i]:7.1f}{m.anios_con_helada[i]:5d}/{r.n}{m.anios_con_35c[i]:5d}"
              f"{'  frecuente' if m.helada_frecuente[i] else ''}")
    print(f"Tipos de año ({t.metodo}): {len(t.seco)} secos (hasta {t.umbral_seco_mm} mm), {len(t.normal)} normales, "
          f"{len(t.humedo)} húmedos (desde {t.umbral_humedo_mm} mm)")
    print(f"Secos: {', '.join(t.seco)}")
