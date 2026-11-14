"""NASA POWER mensual: un solo pedido y las últimas 30 campañas julio–junio.

Pide a la API de NASA POWER (comunidad AG) la serie mensual de un punto y la
reordena en campañas agrícolas de julio a junio. No calcula indicadores: eso
lo hace ``clima/indicadores.py`` con lo que devuelve este módulo.

Convenciones
------------
- En todos los arrays de 12 meses, **el índice 0 es enero** (11 = diciembre),
  aunque la campaña arranque en julio. La campaña "2021/22" tiene en el índice
  6 julio de 2021 y en el índice 0 enero de 2022.
- Una campaña entra solo si tiene los 12 meses completos en los 3 parámetros.
  Se descartan las claves ``AAAA13`` (total o valor anual) y los faltantes
  (``-999``, el ``fill_value`` de POWER).
- ``pedir_power`` nunca lanza excepción: si algo falla devuelve ``ok=False``
  con el ``motivo`` en texto, para que vaya a "Información que falta".

Qué es cada parámetro (verificado el 14/11/2026)
------------------------------------------------
- ``PRECTOTCORR_SUM``: lluvia total del mes, corregida, en **mm/mes**. Ojo: la
  respuesta de POWER la etiqueta "mm/day", pero el valor es la suma del mes
  (enero 2020 en el lote demo: 74,6 mensual = suma de los 31 diarios).
- ``T2M_MIN`` / ``T2M_MAX`` mensuales son **extremos del mes, no medias**: la
  mínima más baja y la máxima más alta del mes. Fuente: la definición del
  parámetro en https://power.larc.nasa.gov/api/system/manager/parameters/T2M_MIN?community=AG
  ("The minimum hourly air (dry bulb) temperature at 2 meters [...] in the
  period of interest", igual para T2M_MAX con "maximum"). Lo comprobamos con
  los datos: para el lote demo, cada mes de 2020 el valor mensual coincide
  exacto con el mínimo de los ``T2M_MIN`` diarios (y el máximo de los
  ``T2M_MAX`` diarios), no con su promedio (julio 2020: mensual −1,84 °C =
  mínimo diario −1,84 °C; la media de las mínimas diarias es 2,12 °C).
  Sirven para "hubo helada en el mes" (mínima < 0 °C) o "hubo un día ≥ 35 °C",
  pero **no para Hargreaves**, que necesita medias. En el mismo chequeo, el
  ``T2M`` mensual coincide con la media diaria y ``T2M_RANGE`` mensual con la
  media de la amplitud diaria (máxima − mínima), que es lo que usa Hargreaves.
"""

from __future__ import annotations

import ssl
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

import certifi
import httpx

URL_POWER = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMETROS = ("PRECTOTCORR_SUM", "T2M_MIN", "T2M_MAX")
FUENTE = "NASA POWER mensual (comunidad AG)"
RESOLUCION = "~50 km (0,5° × 0,625°)"
TIMEOUT_S = 15.0
CAMPANAS_MAX = 30
CAMPANAS_MIN = 15
FALTANTE = -999.0

# Lote demo: zona de Río Cuarto.
LAT_DEMO, LON_DEMO = -33.2477, -64.2325


@dataclass(frozen=True)
class Campana:
    """Una campaña julio–junio. Arrays de 12 con índice 0 = enero."""

    etiqueta: str  # "2021/22"
    anio_inicio: int  # 2021 (julio–diciembre de este año, enero–junio del siguiente)
    lluvia_mm: list[float]  # PRECTOTCORR_SUM, mm/mes
    t_min_c: list[float]  # T2M_MIN, °C: mínima más baja del mes (extremo, no media)
    t_max_c: list[float]  # T2M_MAX, °C: máxima más alta del mes (extremo, no media)

    @property
    def lluvia_total_mm(self) -> float:
        return sum(self.lluvia_mm)


@dataclass
class SeriePower:
    """Resultado de ``pedir_power``. Si ``ok`` es False, ``motivo`` dice por qué."""

    ok: bool
    motivo: str | None = None
    campanas: list[Campana] = field(default_factory=list)
    periodo: str | None = None  # "1995/96 a 2024/25"
    n: int = 0
    fuente: str = FUENTE
    resolucion: str = RESOLUCION
    celda: tuple[float, float] | None = None  # centro de la celda de POWER (lat, lon)
    pedido: str | None = None  # URL exacta del pedido, para trazar el dato

    def a_dict(self) -> dict[str, Any]:
        return asdict(self)


def celda_power(lat: float, lon: float) -> tuple[float, float]:
    """Centro de la celda de POWER (grilla de 0,5° de latitud × 0,625° de longitud)."""
    return (round(lat / 0.5) * 0.5, round(lon / 0.625) * 0.625)


def _contexto_ssl() -> ssl.SSLContext:
    # Certificados del sistema + los de certifi. Con solo certifi el pedido falla
    # en máquinas con antivirus o proxy que inspeccionan HTTPS (pasa en Windows
    # con AVG): su certificado raíz está en el almacén del sistema, no en certifi.
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(certifi.where())
    return ctx


def _valido(v: Any) -> bool:
    return isinstance(v, (int, float)) and v > FALTANTE


def armar_serie(respuesta: dict[str, Any]) -> SeriePower:
    """Arma las campañas julio–junio a partir del JSON de POWER (sin red).

    El rango de años sale de las claves de la respuesta, no de la fecha de hoy,
    así el mismo JSON siempre da el mismo resultado.
    """
    try:
        parametros = respuesta["properties"]["parameter"]
        series = [parametros[p] for p in PARAMETROS]
    except (KeyError, TypeError):
        return SeriePower(ok=False, motivo="La respuesta de NASA POWER no trae los parámetros pedidos.")

    # Claves AAAAMM con MM de 01 a 12: así se descarta la AAAA13 (anual).
    anios = sorted(
        {int(k[:4]) for k in series[0] if len(k) == 6 and k.isdigit() and 1 <= int(k[4:]) <= 12}
    )
    if not anios:
        return SeriePower(ok=False, motivo="La respuesta de NASA POWER no trae meses.")

    campanas: list[Campana] = []
    for y in range(anios[0], anios[-1]):
        # Mes m (0 = enero): julio a diciembre son del año y; enero a junio, del y + 1.
        claves = [f"{y + 1 if m < 6 else y}{m + 1:02d}" for m in range(12)]
        valores = [[s.get(k) for k in claves] for s in series]
        if not all(_valido(v) for fila in valores for v in fila):
            continue  # campaña incompleta en algún mes o parámetro
        lluvia, t_min, t_max = ([float(v) for v in fila] for fila in valores)
        campanas.append(
            Campana(
                etiqueta=f"{y}/{str(y + 1)[2:]}",
                anio_inicio=y,
                lluvia_mm=lluvia,
                t_min_c=t_min,
                t_max_c=t_max,
            )
        )

    campanas = campanas[-CAMPANAS_MAX:]
    n = len(campanas)
    if n < CAMPANAS_MIN:
        return SeriePower(
            ok=False,
            motivo=(
                f"NASA POWER devolvió {n} campañas completas (julio–junio); "
                f"se necesitan al menos {CAMPANAS_MIN}."
            ),
            campanas=campanas,
            n=n,
        )
    return SeriePower(
        ok=True,
        campanas=campanas,
        periodo=f"{campanas[0].etiqueta} a {campanas[-1].etiqueta}",
        n=n,
    )


_cache: dict[tuple[float, float, int], SeriePower] = {}


def pedir_power(lat: float, lon: float) -> SeriePower:
    """Pide POWER mensual para el punto y devuelve las últimas 30 campañas julio–junio.

    Un solo GET con ``PRECTOTCORR_SUM``, ``T2M_MIN`` y ``T2M_MAX`` desde el año
    actual − 32 hasta el año actual − 1. Guarda en memoria por celda de POWER
    (solo los pedidos que salieron bien). Nunca lanza excepción.
    """
    fin = date.today().year - 1
    inicio = fin - 31
    celda = celda_power(lat, lon)
    clave = (*celda, fin)
    if clave in _cache:
        return _cache[clave]

    params = {
        "parameters": ",".join(PARAMETROS),
        "community": "AG",
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "start": inicio,
        "end": fin,
        "format": "JSON",
    }
    pedido = str(httpx.URL(URL_POWER, params=params))
    try:
        r = httpx.get(URL_POWER, params=params, timeout=TIMEOUT_S, verify=_contexto_ssl())
        if r.status_code != 200:
            detalle = ""
            try:
                detalle = "; ".join(str(m) for m in r.json().get("messages", []))
            except Exception:
                pass
            motivo = f"NASA POWER respondió HTTP {r.status_code}." + (f" {detalle}" if detalle else "")
            serie = SeriePower(ok=False, motivo=motivo)
        else:
            serie = armar_serie(r.json())
    except httpx.TimeoutException:
        serie = SeriePower(ok=False, motivo=f"NASA POWER no respondió en {TIMEOUT_S:.0f} s.")
    except httpx.HTTPError as e:
        serie = SeriePower(ok=False, motivo=f"No se pudo conectar con NASA POWER ({type(e).__name__}).")
    except ValueError:
        serie = SeriePower(ok=False, motivo="NASA POWER devolvió una respuesta que no es JSON válido.")
    except Exception as e:  # nunca hacia afuera
        serie = SeriePower(ok=False, motivo=f"Error inesperado al leer NASA POWER ({type(e).__name__}).")

    serie.celda = celda
    serie.pedido = pedido
    if serie.ok:
        _cache[clave] = serie
    return serie


if __name__ == "__main__":
    s = pedir_power(LAT_DEMO, LON_DEMO)
    if not s.ok:
        print(f"Error: {s.motivo}")
        raise SystemExit(1)
    media = sum(c.lluvia_total_mm for c in s.campanas) / s.n
    print(f"Fuente:     {s.fuente} · {s.resolucion}")
    print(f"Celda:      {s.celda}")
    print(f"Período:    {s.periodo}")
    print(f"n:          {s.n} campañas")
    print(f"Lluvia media anual (julio–junio): {media:.0f} mm")
