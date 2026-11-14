"""Orquestación de /analizar (dueño: Back 1).

`analizar(entrada) -> Salida` conecta los tres dominios y arma la respuesta completa:

1. `satelite.lote.validar`: si el polígono no sirve → `ErrorServicio` 422 con el motivo.
2. En paralelo, con un presupuesto total de `PRESUPUESTO_S`:
   - clima: `clima.power.pedir_power` → `clima.indicadores.calcular`;
   - satélite: `cobertura`, `elevacion`, `ndvi` y `et` (cada una con el polígono del lote).
   Cada fuente que falla o no llega a tiempo queda `sin_dato` con su motivo y va a
   "Información que falta"; nunca rompe la respuesta.
3. WorldCover dice que el lote no es agrícola → 422 con su aviso. Sin dato de WorldCover no se
   bloquea. NASA POWER caído → 503 (la ruta sirve la respuesta precalculada si el lote es el de
   ejemplo): POWER es la base, sin él no hay comparación.
4. Motor de reglas (persona 3): `reglas.analizar` + `plantillas.armar`, traducido a los nombres
   del contrato. Si `app.motor` todavía no está en el código, un stub devuelve las 4 columnas
   fijas sin puntajes y lo dice en "Información que falta".
5. Probabilidad climatológica (RF25): `clima.probabilidad` con el calendario de cada columna
   disponible y el catálogo de `app.motor.cultivos` (clima no puede importar motor).

No usa FastAPI: lo llaman la ruta y `scripts/precalcular_demo.py` (Back 2), así el JSON de la
demo sale del mismo código que la API.

Correr desde backend/:  py -m app.servicio   (lote de ejemplo, con red)
"""

from __future__ import annotations

import concurrent.futures as cf
import importlib
import logging
import time
from types import ModuleType
from typing import Any, Callable

from app.api.contrato import (
    Capas,
    CapaNdviMes,
    Choque,
    ClimaCelda,
    Entrada,
    Estrategia,
    Faltante,
    Indicador,
    LoteSalida,
    MedicionesPropias,
    MesSatelite,
    Probabilidad,
    Salida,
    VistoPorSatelite,
)
from app.clima import correccion
from app.clima import indicadores as clima_indicadores
from app.clima import power
from app.clima import probabilidad as clima_probabilidad
from app.clima import serie as clima_serie
from app.satelite import capas, cobertura, elevacion, et, lote, ndvi

log = logging.getLogger("fieldshift.servicio")

PRESUPUESTO_S = 25.0  # /analizar tiene que responder en menos de 30 s (RNF7)
TIPOS = ("seco", "normal", "humedo")
OBJETIVOS = ("agua", "suelo", "erosion", "ingreso")
MENSAJE_POWER_CAIDO = "NASA POWER no responde, probá de nuevo en unos segundos."
MOTOR_PENDIENTE = "Motor de reglas pendiente: las columnas todavía no tienen puntajes"
PROBABILIDAD_SIN_CULTIVOS = "Probabilidad climatológica: falta el catálogo de cultivos del motor"


class ErrorServicio(Exception):
    """Error con texto para mostrar. La ruta lo traduce a HTTP (`estado`, `{mensaje}`)."""

    def __init__(self, estado: int, mensaje: str, *, power_caido: bool = False):
        super().__init__(mensaje)
        self.estado = estado
        self.mensaje = mensaje
        self.power_caido = power_caido


# --- Fuentes en paralelo -----------------------------------------------------


def _clima(lat: float, lon: float) -> clima_indicadores.ResultadoClima:
    return clima_indicadores.calcular(power.pedir_power(lat, lon), lat, lon)


def _ind_sin_dato(unidad: str, fuente: str, resolucion: str, motivo: str, anios: str | None = None) -> dict:
    return {
        "valor": None,
        "unidad": unidad,
        "fuente": fuente,
        "anios": anios,
        "resolucion": resolucion,
        "confianza": "sin_dato",
        "motivo": motivo,
    }


def _cobertura_sin_dato(motivo: str) -> dict:
    ind = _ind_sin_dato(
        getattr(cobertura, "UNIDAD", "%"),
        getattr(cobertura, "FUENTE", "ESA WorldCover"),
        getattr(cobertura, "RESOLUCION", "10 m"),
        motivo,
        str(getattr(cobertura, "ANIO", "")) or None,
    )
    return {"cultivo_pct": ind, "es_agricola": None, "clase_principal": None, "clases": [], "aviso": None}


def _elevacion_sin_dato(motivo: str) -> dict:
    ind = _ind_sin_dato(
        getattr(elevacion, "UNIDAD", "%"),
        getattr(elevacion, "FUENTE", "NASADEM"),
        getattr(elevacion, "RESOLUCION", "30 m"),
        motivo,
        getattr(elevacion, "ANIOS", None),
    )
    return {"pendiente_general": ind, "pendiente_maxima": dict(ind)}


def _ndvi_sin_dato(motivo: str) -> dict:
    fuente = getattr(ndvi, "FUENTE_HLS", "NASA HLS 30 m")
    return {
        "visto_por_satelite": {
            "campana": None,
            "fuente": fuente,
            "meses": [None] * 12,
            "meses_ndvi_bajo": None,
            "umbral": getattr(ndvi, "UMBRAL_NDVI_BAJO", 0.3),
            "orden_meses": getattr(ndvi, "ORDEN_TEXTO", None),
            "faltantes": [],
        },
        "meses_cobertura_baja": _ind_sin_dato(
            getattr(ndvi, "UNIDAD", "meses"), fuente, getattr(ndvi, "RESOLUCION_HLS", "30 m"), motivo
        ),
    }


def _et_sin_dato(motivo: str) -> dict:
    return {
        "et_real_anual": _ind_sin_dato(
            getattr(et, "UNIDAD", "mm/año"),
            getattr(et, "FUENTE", "MODIS ET"),
            getattr(et, "RESOLUCION", "500 m"),
            motivo,
        )
    }


# nombre: (módulo con `calcular(poligono)`, respaldo si falla, texto de la fuente para el motivo).
# Se guarda el módulo y no la función para que `calcular` se resuelva al llamar (y se pueda simular).
_SATELITE: dict[str, tuple[ModuleType, Callable[[str], dict], str]] = {
    "cobertura": (cobertura, _cobertura_sin_dato, "ESA WorldCover"),
    "elevacion": (elevacion, _elevacion_sin_dato, "la pendiente (NASADEM)"),
    "ndvi": (ndvi, _ndvi_sin_dato, "el NDVI del lote (HLS)"),
    "et": (et, _et_sin_dato, "la ET real (MODIS)"),
}


def _resultado(futuro: cf.Future, respaldo: Callable[[str], Any], fuente: str) -> Any:
    """Resultado del futuro, o el respaldo `sin_dato` si no terminó o lanzó."""
    if not futuro.done():
        return respaldo(f"{fuente} no respondió a tiempo")
    try:
        return futuro.result()
    except Exception as e:  # noqa: BLE001 — nunca hacia afuera
        log.warning("Falló %s: %r", fuente, e)
        return respaldo(f"No se pudo calcular {fuente} ({type(e).__name__})")


def _ultima_campana(clima: clima_indicadores.ResultadoClima) -> int | None:
    """Año de inicio de la última campaña de POWER ("2025/26" → 2025), o None si no hay."""
    try:
        return int(clima.campanas[-1].etiqueta.split("/")[0])
    except (IndexError, ValueError, AttributeError):
        return None


def _clima_sin_dato(motivo: str) -> clima_indicadores.ResultadoClima:
    return clima_indicadores.ResultadoClima(ok=False, motivo=motivo)


# --- Motor de reglas ---------------------------------------------------------


def _cargar_motor() -> tuple[ModuleType, ModuleType] | None:
    """`app.motor` (persona 3) si ya está en el código; si no, None y se usa el stub."""
    try:
        return importlib.import_module("app.motor.reglas"), importlib.import_module("app.motor.plantillas")
    except ImportError:
        return None


def _cargar_cultivos() -> dict[str, dict] | None:
    """Catálogo de cultivos de `app.motor.cultivos` con lo que pide `clima.probabilidad`.

    Lo arma el servicio porque `clima/` no puede importar `motor/`. None si el motor no está.
    """
    try:
        c = importlib.import_module("app.motor.cultivos").C
        return {
            clave: {"nombre": d["nombre"], "grupo": d["grupo"], "tolera_helada": bool(d["tolera_helada"])}
            for clave, d in c.items()
        }
    except Exception:  # noqa: BLE001 — sin catálogo: columnas sin probabilidades + motivo
        return None


def _probabilidades(
    lista: list[dict], clima: clima_indicadores.ResultadoClima, cultivos: dict[str, dict] | None
) -> dict[str, list[Probabilidad]]:
    """RF25 por columna disponible, según su calendario y el de la rotación actual."""
    if not cultivos:
        return {}
    cal_actual = lista[0].get("calendario") or []
    return {
        s["id"]: clima_probabilidad.probabilidades(s["calendario"], cultivos, clima, cal_actual)
        for s in lista
        if s.get("on") and s.get("calendario")
    }


def _entradas_motor(entrada: Entrada) -> dict:
    return {
        "verano": entrada.cultivo_verano,
        "invierno": entrada.invierno,
        "pasada": entrada.campana_pasada,
        "pesos": entrada.prioridades.model_dump(),
        "no_sembrar": list(entrada.no_sembrar),
        "maquinaria_limitada": "maquinaria_limitada" in entrada.restricciones,
        "anegable": entrada.anegable,
        "textura": entrada.textura_suelo,
        # El motor (app/motor/mezcla.py, #53) mezcla lluvia y temperaturas del productor con NASA,
        # con más peso cuantos más años de registro. La materia orgánica no la usa: no se pasa.
        "mediciones": _mediciones_motor(entrada.mediciones_propias),
    }


def _mediciones_motor(m: MedicionesPropias) -> dict:
    serie = m.serie_mensual or []
    return {
        "lluvia_anual_mm": m.lluvia_anual_mm,
        "anios_registro": m.anios_registro,
        "serie_mensual": [x.model_dump() for x in serie] or None,
    }


def _indicadores_motor(clima: clima_indicadores.ResultadoClima, pendiente: Any, vps: VistoPorSatelite) -> dict:
    m = clima.clima_mensual
    visto = None
    if vps.meses_ndvi_bajo is not None:
        visto = {"meses_pelados": vps.meses_ndvi_bajo, "meses_con_dato": vps.meses_con_dato, "campania": vps.campana}
    return {
        "terciles": clima.terciles_motor,
        "anios_con_helada": list(m.anios_con_helada),
        "anios_con_calor": list(m.anios_con_35c),
        "n_anios": m.n_anios,
        "pendiente_pct": pendiente,
        "visto_satelite": visto,
    }


def _motor_stub(entrada: Entrada, motivo: str = MOTOR_PENDIENTE) -> dict:
    """Las 4 columnas fijas, sin puntajes, con la misma forma que devuelve el motor."""
    nombres = (
        ("actual", "Lo que hacés hoy"),
        ("A", "Cobertura de invierno"),
        ("B", "Cultivo de invierno"),
        ("C", "Diversificar el verano"),
    )
    especies = f"{entrada.cultivo_verano} + {entrada.invierno}"
    return {
        "estrategias": [
            {
                "id": i,
                "nombre": n,
                "especies": especies if i == "actual" else "",
                "calendario": None,
                "on": True,
                "resumen": "Sin puntajes: motor de reglas pendiente.",
                "falta": [motivo],
            }
            for i, n in nombres
        ],
        "choque": {"hay": False, "texto": ""},
        "stub": True,
    }


def _correr_motor(entrada: Entrada, indicadores: dict) -> dict:
    motor = _cargar_motor()
    if motor is None:
        return _motor_stub(entrada)
    reglas, plantillas = motor
    try:
        entradas = _entradas_motor(entrada)
        resultado = reglas.analizar(entradas, indicadores)
        return plantillas.armar(resultado, entradas, indicadores)
    except Exception as e:  # noqa: BLE001 — nunca hacia afuera: columnas sin puntajes + motivo
        log.exception("Falló el motor de reglas")
        return _motor_stub(entrada, f"El motor de reglas no pudo evaluar las columnas ({type(e).__name__})")


def _suma_aportes(s: dict, regla: str) -> int:
    return round(sum(sum(a["efecto"].values()) for a in s.get("aportes", []) if a.get("regla") == regla))


def _puntos_normal(s: dict) -> dict[str, int]:
    return {"agua": s["agua_por_tipo"]["normal"], "suelo": s["suelo"], "erosion": s["erosion"], "ingreso": s["ingreso"]}


def _estrategia(
    s: dict,
    actual: dict,
    vacios_back: list[str],
    riesgos_back: list[str] | None = None,
    probabilidades: list[Probabilidad] | None = None,
) -> Estrategia:
    """Traduce una columna del motor a `Estrategia` del contrato."""
    vacios = list(dict.fromkeys([*s.get("falta", []), *vacios_back]))
    base = {
        "id": s["id"],
        "nombre": s["nombre"],
        "especies": s.get("especies", ""),
        "disponible": bool(s["on"]),
        "motivo_descarte": s.get("motivo") or None,
        "calendario": s.get("calendario"),
        "resumen": s.get("resumen", ""),
        "vacios": vacios,
        "probabilidades": probabilidades or [],
    }
    if not s["on"] or "agua_por_tipo" not in s:
        return Estrategia(**base)
    pts = _puntos_normal(s)
    pts_actual = _puntos_normal(actual) if "agua_por_tipo" in actual else pts
    por_tipo_cerc = s.get("cercania_por_tipo", {})
    return Estrategia(
        **base,
        valores={
            "agua_mm": s["agua_mm"]["normal"]["balance"],
            "meses_cobertura_baja": s["meses_pelados"],
            "aporte_n": _suma_aportes(s, "nitrogeno"),
            "rastrojo": _suma_aportes(s, "rastrojo"),
            "erosion": s["erosion"],
            "ingreso": s["ingreso"],
            "conflictos_helada_calor": {
                "meses_helada_frecuente": s.get("helada", []),
                "meses_conflicto_helada": s.get("helada_conflicto", []),
                "meses_calor": s.get("calor", []),
            },
        },
        puntos={"agua": s["agua_por_tipo"], "suelo": s["suelo"], "erosion": s["erosion"], "ingreso": s["ingreso"]},
        valores_por_tipo_anio={
            t: {
                "agua_mm": s["agua_mm"][t]["balance"],
                "lluvia_mm": s["agua_mm"][t]["lluvia"],
                "uso_mm": s["agua_mm"][t]["uso"],
                "cercania": por_tipo_cerc.get(t),
            }
            for t in TIPOS
        },
        diferencia_vs_actual={o: pts[o] - pts_actual[o] for o in OBJETIVOS},
        cercania=s.get("cercania"),
        cercania_objetivos=pts,
        sensible_clima=bool(s.get("sensible_clima", False)),
        reglas_aplicadas=[
            {"regla": a["regla"], "efecto": a["efecto"], "dato": a["dato"]} for a in s.get("aportes", [])
        ],
        por_que=s.get("por_que", []),
        evidencia=s.get("evidencia", []),
        beneficios=s.get("beneficios", []),
        riesgos=list(dict.fromkeys([*s.get("revisar", []), *(riesgos_back or [])])),
    )


# --- Satélite → contrato -----------------------------------------------------


def _indicador(d: dict | None, respaldo: dict) -> Indicador:
    try:
        return Indicador.model_validate(d)
    except Exception:  # noqa: BLE001 — dict mal formado: sin dato con su motivo
        return Indicador.model_validate(respaldo)


def _visto_por_satelite(r: dict, faltan: list[str]) -> tuple[VistoPorSatelite, Indicador, list[CapaNdviMes | None]]:
    vps = r.get("visto_por_satelite") or {}
    ind = _indicador(
        r.get("meses_cobertura_baja"), _ndvi_sin_dato("Respuesta del NDVI incompleta")["meses_cobertura_baja"]
    )
    meses: list[MesSatelite | None] = []
    crudos = list(vps.get("meses") or [None] * 12)[:12]
    crudos += [None] * (12 - len(crudos))
    for m in crudos:
        try:
            meses.append(MesSatelite.model_validate(m) if m else None)
        except Exception:  # noqa: BLE001
            meses.append(None)
    faltantes = []
    for f in vps.get("faltantes") or []:
        try:
            faltantes.append(Faltante.model_validate(f))
        except Exception:  # noqa: BLE001
            continue
    capas = [
        CapaNdviMes(coleccion=m.coleccion, item=m.item, fecha=m.fecha) if m and m.coleccion and m.item else None
        for m in meses
    ]
    if ind.confianza == "sin_dato":
        faltan.append(f"NDVI del lote (visto por satélite): {ind.motivo or 'sin dato'}")
    else:
        faltan += [f"NDVI del lote · {f.motivo}" for f in faltantes]
    visto = VistoPorSatelite(
        campana=vps.get("campana"),
        fuente=vps.get("fuente") or ind.fuente,
        meses=meses,
        meses_ndvi_bajo=vps.get("meses_ndvi_bajo"),
        meses_con_dato=sum(1 for m in meses if m),
        umbral=vps.get("umbral", 0.3),
        confianza=ind.confianza,
        motivo=ind.motivo or ind.nota,
        faltantes=faltantes,
        orden_meses=vps.get("orden_meses"),
    )
    return visto, ind, capas


def _faltante(nombre: str, ind: Indicador, faltan: list[str]) -> None:
    if ind.confianza == "sin_dato":
        faltan.append(f"{nombre}: {ind.motivo or 'sin dato'}")


# --- Punto de entrada --------------------------------------------------------


def analizar(entrada: Entrada) -> Salida:
    """Compara la rotación actual con A, B y C. Lanza solo `ErrorServicio` (422 / 503)."""
    inicio = time.monotonic()
    v = lote.validar(entrada.lote.poligono.model_dump())
    if not v["ok"]:
        raise ErrorServicio(422, v["motivo"] or "El polígono del lote no es válido.")
    poligono = v["poligono"]
    lat, lon = v["centro"]

    # El NDVI arranca en paralelo con la campaña que se espera que sea la última de POWER; si POWER
    # termina en otra, se vuelve a pedir con esa (NDVI, terciles y serie siempre en la misma campaña).
    campana_ndvi = ndvi.campana_inicio()
    pool = cf.ThreadPoolExecutor(max_workers=len(_SATELITE) + 2, thread_name_prefix="analizar")
    try:
        f_clima = pool.submit(_clima, lat, lon)
        f_sat = {
            k: pool.submit(mod.calcular, poligono, campana=campana_ndvi)
            if k == "ndvi"
            else pool.submit(mod.calcular, poligono)
            for k, (mod, _, _) in _SATELITE.items()
        }

        def restante() -> float:
            return max(0.0, PRESUPUESTO_S - (time.monotonic() - inicio))

        # Primero lo que puede cortar el análisis: WorldCover y POWER.
        cf.wait([f_clima, f_sat["cobertura"]], timeout=restante())
        cob = _resultado(f_sat["cobertura"], _cobertura_sin_dato, _SATELITE["cobertura"][2])
        if cob.get("es_agricola") is False:
            raise ErrorServicio(422, cob.get("aviso") or "Marcá un lote de campo: el polígono no es un cultivo.")
        clima = _resultado(f_clima, _clima_sin_dato, "NASA POWER")
        if not clima.ok:
            log.warning("NASA POWER sin dato: %s", clima.motivo)
            raise ErrorServicio(503, MENSAJE_POWER_CAIDO, power_caido=True)

        ultima = _ultima_campana(clima)
        if ultima is not None and ultima != campana_ndvi:
            log.info("NDVI: POWER termina en %s, no en %s; se pide de nuevo", ultima, campana_ndvi)
            f_sat["ndvi"].cancel()
            f_sat["ndvi"] = pool.submit(ndvi.calcular, poligono, campana=ultima)

        cf.wait(list(f_sat.values()), timeout=restante())
        sat = {k: _resultado(f_sat[k], resp, fuente) for k, (_, resp, fuente) in _SATELITE.items()}
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return _armar_salida(entrada, v, clima, sat, cob)


def _confianza_agua(indicadores: dict[str, Indicador], contraste: correccion.ResultadoContraste) -> dict:
    """Con las mediciones del productor lejos de NASA, baja la confianza (RF15). El valor no cambia.

    - Pluviómetro a más de 15 % de NASA → `INDICADORES_AGUA`.
    - Estación con 2 campañas o más de diferencia en heladas → `INDICADORES_HELADA` (planilla, 5.4).
    """
    bajan = {}
    if contraste.confianza_agua == "baja":
        bajan |= {k: contraste.motivo_agua for k in correccion.INDICADORES_AGUA}
    if contraste.confianza_helada == "baja":
        bajan |= {k: contraste.motivo_helada for k in correccion.INDICADORES_HELADA}
    return {
        k: ind.model_copy(update={"confianza": "baja", "motivo": bajan[k]})
        if k in bajan and ind.confianza != "sin_dato"
        else ind
        for k, ind in indicadores.items()
    }


def _con_linea_del_productor(
    probs: dict[str, list[Probabilidad]], contraste: correccion.ResultadoContraste
) -> dict[str, list[Probabilidad]]:
    """Suma en `Probabilidad.contraste` la línea de la estación del productor para el mismo evento y mes.

    La probabilidad (anios, pct, texto) sigue saliendo de las 30 campañas de NASA: no cambia.
    """
    if not contraste.lineas_probabilidad:
        return probs
    return {
        id_: [
            p.model_copy(update={"contraste": contraste.lineas_probabilidad.get((p.evento, p.mes))})
            if (p.evento, p.mes) in contraste.lineas_probabilidad
            else p
            for p in lista
        ]
        for id_, lista in probs.items()
    }


def _armar_salida(
    entrada: Entrada, v: dict, clima: clima_indicadores.ResultadoClima, sat: dict[str, dict], cob: dict
) -> Salida:
    faltan: list[str] = list(clima.faltantes)

    elev_resp = _elevacion_sin_dato("Respuesta de la pendiente incompleta")
    pendiente = _indicador(sat["elevacion"].get("pendiente_general"), elev_resp["pendiente_general"])
    pendiente_max = _indicador(sat["elevacion"].get("pendiente_maxima"), elev_resp["pendiente_maxima"])
    cultivo_pct = _indicador(cob.get("cultivo_pct"), _cobertura_sin_dato("Respuesta incompleta")["cultivo_pct"])
    et_real = _indicador(sat["et"].get("et_real_anual"), _et_sin_dato("Respuesta incompleta")["et_real_anual"])
    visto, cobertura_baja, capas_ndvi = _visto_por_satelite(sat["ndvi"], faltan)

    _faltante("Pendiente del lote (NASADEM)", pendiente, faltan)
    _faltante("Cobertura agrícola del lote (ESA WorldCover)", cultivo_pct, faltan)
    _faltante("ET real del lote (MODIS)", et_real, faltan)
    if entrada.calendario is not None:
        faltan.append("Calendario cargado a mano: las columnas usan el calendario de la rotación elegida")

    resultado = _correr_motor(entrada, _indicadores_motor(clima, pendiente.valor, visto))
    lista = resultado["estrategias"]
    if resultado.get("stub"):
        faltan.append(lista[0]["falta"][0])
    cultivos = _cargar_cultivos()
    if cultivos is None and not resultado.get("stub"):
        faltan.append(PROBABILIDAD_SIN_CULTIVOS)
    probs = _probabilidades(lista, clima, cultivos)
    vacios_back = list(dict.fromkeys(faltan))

    # RF15: las mediciones del productor van al lado de NASA; no cambian ningún puntaje.
    contraste = correccion.contrastar(entrada.mediciones_propias, clima)
    faltan += contraste.faltantes
    probs = _con_linea_del_productor(probs, contraste)

    estrategias = [_estrategia(s, lista[0], vacios_back, contraste.riesgos, probs.get(s["id"])) for s in lista]
    ch = resultado.get("choque") or {}

    serie_anual = clima_serie.serie_anual(clima)
    if serie_anual is None:
        faltan.append("Serie por campaña: no se pudo armar con las campañas de NASA POWER")
    # Capas del mapa (satelite/capas.py, Back 2): arma la escena NDVI de cada mes y el índice de
    # erosión con lo que ya devolvieron ndvi y elevacion, sin pedidos nuevos.
    capas_sat = capas.armar(sat["ndvi"], sat["elevacion"])
    erosion = capas_sat.get("erosion")
    if erosion is None:
        faltan.append("Capa de erosión: falta la pendiente o el NDVI del lote")
    indicador_erosion = {"riesgo_erosion": Indicador.model_validate(erosion)} if erosion else {}

    return Salida(
        lote=LoteSalida(
            localidad_aprox=None,
            area_ha=v["area_ha"],
            pendiente_pct=pendiente,
            pendiente_maxima_pct=pendiente_max,
            cobertura_agricola_pct=cultivo_pct,
        ),
        visto_por_satelite=visto,
        indicadores={
            **_confianza_agua(clima.indicadores, contraste),
            "et_real_anual": et_real,
            "meses_cobertura_baja": cobertura_baja,
            **indicador_erosion,
        },
        contraste_mediciones=contraste.contraste,
        clima_celda=clima.clima_celda or ClimaCelda(bbox=(0, 0, 0, 0), posicion_lote="sin dato"),
        clima_mensual=clima.clima_mensual,
        tipos_de_anio=clima.tipos_de_anio,
        serie_anual=serie_anual,
        capas=Capas(
            ndvi_mensual=capas_sat.get("ndvi_mensual") or capas_ndvi,
            erosion=erosion,
            no_disponibles=[*capas_sat.get("no_disponibles", []), "agua_regional_mensual", "heladas_regional_mensual"],
        ),
        estrategias=estrategias,
        choque=Choque(hay=bool(ch.get("hay")), objetivos=ch.get("objetivos", []), texto=ch.get("texto", "")),
        periodo_clima=clima.periodo or "",
        informacion_falta=list(dict.fromkeys(faltan)),
        es_mock=False,
    )


if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    ruta = Path(__file__).parents[1] / "tests" / "ejemplos" / "entrada_demo.json"
    t0 = time.monotonic()
    try:
        s = analizar(Entrada.model_validate(json.loads(ruta.read_text(encoding="utf-8"))))
    except ErrorServicio as e:
        print(f"{e.estado}: {e.mensaje}")
        sys.exit(1)
    print(f"Listo en {time.monotonic() - t0:.1f} s · período {s.periodo_clima}")
    for e in s.estrategias:
        print(f"  {e.id:6} {e.nombre:26} cercanía {e.cercania} · {e.resumen}")
    print("Información que falta:")
    for f in s.informacion_falta:
        print(f"  - {f}")
