"""Tests de `servicio.analizar` y de POST /analizar, sin red (fuentes simuladas en conftest.py).

Correr desde backend/:  py -m pytest tests/api/test_servicio.py
"""

import copy
import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import servicio
from app.api import rutas
from app.api.contrato import Entrada, Salida
from app.clima import power
from app.main import app
from app.satelite import cobertura, elevacion, et, ndvi
from tests.api.conftest import CAMPANAS_NDVI_PEDIDAS, cobertura_ok

# TestClient no sale a internet, pero el event loop abre un socketpair local (ver test_rutas.py).
pytestmark = pytest.mark.enable_socket

cliente = TestClient(app)
ENTRADA = json.loads((Path(__file__).parents[1] / "ejemplos" / "entrada_demo.json").read_text(encoding="utf-8"))
PROHIBIDAS = ("recomend", "deberías", "deberia", "la mejor", "te conviene")


def _dibujado():
    e = copy.deepcopy(ENTRADA)
    e["lote"]["tipo"] = "dibujado"
    return e


# --- Motor simulado, con la forma de app/motor (reglas.analizar + plantillas.armar) ----------------


def _columna(id_, agua, suelo, pelados, balance_seco):
    return {
        "id": id_,
        "nombre": f"Columna {id_}",
        "especies": "Soja + vicia",
        "on": True,
        "motivo": "",
        "calendario": ["soja"] * 3 + ["barbecho"] * pelados + ["soja"] * (9 - pelados),
        "agua_por_tipo": {"seco": agua - 20, "normal": agua, "humedo": agua + 20},
        "agua_mm": {
            t: {"lluvia": 700, "uso": 800, "balance": balance_seco + d}
            for t, d in (("seco", 0), ("normal", 100), ("humedo", 200))
        },
        "suelo": suelo,
        "erosion": 80,
        "ingreso": 50,
        "meses_pelados": pelados,
        "helada": [5, 6],
        "helada_conflicto": [],
        "calor": [0],
        "aportes": [
            {"regla": "agua", "tipo": "seco", "efecto": {"agua": 10.5}, "dato": "Años secos: ..."},
            {"regla": "nitrogeno", "efecto": {"suelo": 5}, "dato": "Soja fija nitrógeno"},
            {"regla": "nitrogeno", "efecto": {"suelo": 30}, "dato": "Vicia fija nitrógeno"},
            {"regla": "rastrojo", "efecto": {"suelo": 5}, "dato": "Soja deja rastrojo"},
        ],
        "cercania": 60,
        "cercania_por_tipo": {"seco": 50, "normal": 60, "humedo": 70},
        "sensible_clima": True,
        "resumen": "Gana en suelo.",
        "por_que": ["Cubre el suelo"],
        "evidencia": ["dato"],
        "beneficios": ["2 meses más de cobertura que hoy"],
        "revisar": ["Secado ~30 días antes de la siembra"],
        "falta": ["Precios"],
    }


def _motor_simulado(recibido: dict):
    def analizar(entradas, indicadores):
        recibido.update(entradas=entradas, indicadores=indicadores)
        descartada = {
            "id": "C",
            "nombre": "Diversificar el verano",
            "especies": "",
            "calendario": None,
            "on": False,
            "motivo": "No sembrar sorgo ni girasol",
        }
        lista = [
            _columna("actual", 40, 30, 5, -400),
            _columna("A", 45, 80, 1, -450),
            _columna("B", 50, 40, 2, -380),
            descartada,
        ]
        return {"estrategias": lista, "choque": {"hay": False}, "pendiente_pct": 0.6, "pendiente_real": True}

    def armar(resultado, entradas, indicadores):
        resultado["estrategias"][3]["resumen"] = "Descartada: No sembrar sorgo ni girasol."
        resultado["choque"]["texto"] = ""
        return resultado

    return SimpleNamespace(analizar=analizar), SimpleNamespace(armar=armar)


# --- Salida completa ---------------------------------------------------------


def test_salida_valida_con_4_columnas():
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert isinstance(s, Salida)
    Salida.model_validate(s.model_dump())
    assert [e.id for e in s.estrategias] == ["actual", "A", "B", "C"]
    assert s.es_mock is False
    assert s.serie_anual is not None and len(s.serie_anual.campanas) == 30
    assert s.serie_anual.periodo == s.periodo_clima
    assert not any(f.startswith("Serie por campaña") for f in s.informacion_falta)
    assert s.contraste_mediciones == []
    assert s.periodo_clima == "1996/97 a 2025/26"
    assert s.clima_mensual.n_anios == 30
    assert s.lote.pendiente_pct.valor == 0.6
    assert s.lote.cobertura_agricola_pct.valor == 98.0
    assert s.aviso.startswith("Herramienta de apoyo")


def test_por_http_responde_200_con_el_contrato():
    r = cliente.post("/analizar", json=ENTRADA)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["es_mock"] is False
    assert len(cuerpo["estrategias"]) == 4


def test_visto_por_satelite_y_capas():
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    v = s.visto_por_satelite
    assert v.meses_con_dato == 11 and v.meses_ndvi_bajo == 4
    assert v.confianza == "baja" and v.motivo.startswith("NDVI < 0,3")
    assert v.meses[0].fecha.startswith("2026-01")  # índice 0 = enero
    assert s.capas.ndvi_mensual[10] is None
    assert s.capas.ndvi_mensual[0].item == "HLS-TEST-2026-01-15"
    assert "NDVI del lote · Noviembre 2025: sin escena HLS con < 30 % de nubes" in s.informacion_falta
    assert {"lluvia_anual", "balance_anual", "et_real_anual", "meses_cobertura_baja"} <= set(s.indicadores)


def test_capa_de_erosion_sale_de_satelite_capas():
    """Pendiente general × meses con NDVI bajo (satelite/capas.py), sin pedidos nuevos."""
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.erosion is not None
    assert s.capas.erosion["valor"] == round(0.6 * 4, 1)
    assert "erosion" not in s.capas.no_disponibles
    assert s.indicadores["riesgo_erosion"].unidad == "% × meses"
    assert not any(f.startswith("Capa de erosión") for f in s.informacion_falta)


def test_sin_pendiente_la_erosion_va_a_informacion_que_falta(monkeypatch):
    monkeypatch.setattr(elevacion, "calcular", lambda pol: {
        "pendiente_general": {"valor": None, "unidad": "%", "fuente": "NASADEM", "anios": None,
                              "resolucion": "30 m", "confianza": "sin_dato", "motivo": "caída"},
        "pendiente_maxima": {"valor": None, "unidad": "%", "fuente": "NASADEM", "anios": None,
                             "resolucion": "30 m", "confianza": "sin_dato", "motivo": "caída"},
    })
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.erosion is None and "erosion" in s.capas.no_disponibles
    assert "riesgo_erosion" not in s.indicadores
    assert "Capa de erosión: falta la pendiente o el NDVI del lote" in s.informacion_falta


def test_sin_lenguaje_de_recomendacion():
    texto = json.dumps(cliente.post("/analizar", json=ENTRADA).json(), ensure_ascii=False).lower()
    assert not any(p in texto for p in PROHIBIDAS)


# --- Cortes: 422 y 503 -------------------------------------------------------


def test_lote_con_lineas_cruzadas_da_422():
    e = _dibujado()
    e["lote"]["poligono"]["coordinates"] = [
        [[-64.24, -33.24], [-64.22, -33.26], [-64.22, -33.24], [-64.24, -33.26], [-64.24, -33.24]]
    ]
    r = cliente.post("/analizar", json=e)
    assert r.status_code == 422
    assert "se cruzan" in r.json()["mensaje"]


def test_lote_no_agricola_da_422_con_el_aviso(monkeypatch):
    aviso = "Marcá un lote de campo: según ESA WorldCover 2021, el 90 % del polígono es zona urbana."

    def urbano(poligono):
        return {**cobertura_ok(poligono), "es_agricola": False, "aviso": aviso}

    monkeypatch.setattr(cobertura, "calcular", urbano)
    r = cliente.post("/analizar", json=_dibujado())
    assert r.status_code == 422
    assert r.json() == {"mensaje": aviso}


def test_cobertura_sin_dato_no_bloquea(monkeypatch):
    def caida(poligono, **_):
        raise RuntimeError("sin red")

    monkeypatch.setattr(cobertura, "calcular", caida)
    s = servicio.analizar(Entrada.model_validate(_dibujado()))
    assert s.lote.cobertura_agricola_pct.confianza == "sin_dato"
    assert any(f.startswith("Cobertura agrícola del lote") for f in s.informacion_falta)


def test_power_caido_con_lote_dibujado_da_503(monkeypatch):
    monkeypatch.setattr(power, "pedir_power", lambda lat, lon: power.SeriePower(ok=False, motivo="timeout"))
    r = cliente.post("/analizar", json=_dibujado())
    assert r.status_code == 503
    assert r.json() == {"mensaje": servicio.MENSAJE_POWER_CAIDO}


def test_power_caido_con_lote_de_ejemplo_devuelve_la_demo(monkeypatch):
    monkeypatch.setattr(power, "pedir_power", lambda lat, lon: power.SeriePower(ok=False, motivo="timeout"))
    r = cliente.post("/analizar", json=ENTRADA)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["es_mock"] is True
    assert cuerpo["informacion_falta"][0] == rutas.AVISO_DEMO
    assert len(cuerpo["estrategias"]) == 4


# --- Una fuente satelital caída ----------------------------------------------


def test_fuente_satelital_caida_va_a_informacion_que_falta(monkeypatch):
    def caida(poligono, **_):
        raise ConnectionError("Planetary Computer caído")

    monkeypatch.setattr(ndvi, "calcular", caida)
    monkeypatch.setattr(
        et,
        "calcular",
        lambda p: {
            "et_real_anual": {
                "valor": None,
                "unidad": "mm/año",
                "fuente": "MODIS",
                "anios": None,
                "resolucion": "500 m",
                "confianza": "sin_dato",
                "motivo": "MODIS sin datos",
            }
        },
    )
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.indicadores["meses_cobertura_baja"].confianza == "sin_dato"
    assert s.visto_por_satelite.meses == [None] * 12 and s.visto_por_satelite.meses_con_dato == 0
    assert s.indicadores["et_real_anual"].confianza == "sin_dato"
    assert any("NDVI del lote" in f and "ConnectionError" in f for f in s.informacion_falta)
    assert "ET real del lote (MODIS): MODIS sin datos" in s.informacion_falta
    assert len(s.estrategias) == 4


def test_fuente_que_no_llega_a_tiempo_queda_sin_dato(monkeypatch):
    monkeypatch.setattr(servicio, "PRESUPUESTO_S", 0.5)

    def lenta(poligono):
        time.sleep(2)
        return {}

    monkeypatch.setattr(et, "calcular", lenta)
    t0 = time.monotonic()
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert time.monotonic() - t0 < 1.5
    assert s.indicadores["et_real_anual"].motivo == "la ET real (MODIS) no respondió a tiempo"


# --- Motor de reglas ---------------------------------------------------------


def test_sin_motor_usa_el_stub_con_4_columnas(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: None)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert [e.id for e in s.estrategias] == ["actual", "A", "B", "C"]
    assert all(e.valores is None and servicio.MOTOR_PENDIENTE in e.vacios for e in s.estrategias)
    assert servicio.MOTOR_PENDIENTE in s.informacion_falta


def test_motor_que_falla_no_rompe(monkeypatch):
    def roto(entradas, indicadores):
        raise KeyError("et0")

    monkeypatch.setattr(
        servicio, "_cargar_motor", lambda: (SimpleNamespace(analizar=roto), SimpleNamespace(armar=None))
    )
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert len(s.estrategias) == 4
    assert any("KeyError" in f for f in s.informacion_falta)


def test_traduce_el_motor_al_contrato(monkeypatch):
    recibido: dict = {}
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado(recibido))
    entrada = copy.deepcopy(ENTRADA)
    entrada["restricciones"] = ["sin_riego", "maquinaria_limitada"]
    entrada["no_sembrar"] = ["sorgo", "girasol"]
    s = servicio.analizar(Entrada.model_validate(entrada))

    # Lo que recibe el motor
    ent, ind = recibido["entradas"], recibido["indicadores"]
    assert ent["verano"] == "soja" and ent["pasada"] == "soja" and ent["maquinaria_limitada"] is True
    assert ent["pesos"] == {"agua": 3, "suelo": 3, "ingreso": 3, "erosion": 3}
    assert ent["textura"] == "franco" and ent["materia_organica_pct"] is None
    assert set(ind["terciles"]) == {"seco", "normal", "humedo"} and ind["n_anios"] == 30
    assert ind["anios_con_calor"] == s.clima_mensual.anios_con_35c
    assert ind["anios_con_helada"] == s.clima_mensual.anios_con_helada
    assert ind["pendiente_pct"] == 0.6
    assert ind["visto_satelite"] == {"meses_pelados": 4, "meses_con_dato": 11, "campania": "2025/26"}

    # Lo que sale en el contrato
    actual, a, c = s.estrategias[0], s.estrategias[1], s.estrategias[3]
    assert a.disponible and a.valores.aporte_n == 35 and a.valores.rastrojo == 5
    assert a.valores.agua_mm == -350 and a.valores.meses_cobertura_baja == 1
    assert a.valores.conflictos_helada_calor.meses_helada_frecuente == [5, 6]
    assert a.puntos.agua.seco == 25 and a.puntos.suelo == 80
    assert a.valores_por_tipo_anio["seco"].agua_mm == -450 and a.valores_por_tipo_anio["humedo"].cercania == 70
    assert a.diferencia_vs_actual.model_dump() == {"agua": 5, "suelo": 50, "erosion": 0, "ingreso": 0}
    assert actual.diferencia_vs_actual.model_dump() == {"agua": 0, "suelo": 0, "erosion": 0, "ingreso": 0}
    assert a.cercania == 60 and a.cercania_objetivos == {"agua": 45, "suelo": 80, "erosion": 80, "ingreso": 50}
    assert a.sensible_clima is True
    assert a.riesgos == ["Secado ~30 días antes de la siembra"]
    assert a.reglas_aplicadas[1].regla == "nitrogeno"
    assert "Precios" in a.vacios and any("Noviembre 2025" in v for v in a.vacios)
    assert not c.disponible and c.motivo_descarte == "No sembrar sorgo ni girasol"
    assert c.valores is None and c.puntos is None and c.resumen.startswith("Descartada")
    assert servicio.MOTOR_PENDIENTE not in s.informacion_falta


# --- Probabilidad climatológica por columna (RF25) ---------------------------

CULTIVOS = {
    "soja": {"nombre": "Soja", "grupo": "verano", "tolera_helada": False, "kc": 0.9},
    "barbecho": {"nombre": "Barbecho", "grupo": "barbecho", "tolera_helada": True, "kc": 0.15},
}
CULTIVOS_CLIMA = {k: {c: d[c] for c in ("nombre", "grupo", "tolera_helada")} for k, d in CULTIVOS.items()}


def test_probabilidades_por_columna(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado({}))
    monkeypatch.setattr(servicio, "_cargar_cultivos", lambda: CULTIVOS_CLIMA)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    actual, a, c = s.estrategias[0], s.estrategias[1], s.estrategias[3]
    m = s.clima_mensual

    # Actual: soja de septiembre a marzo → helada en septiembre (el único mes con soja y helada).
    assert [p.evento for p in actual.probabilidades] == ["helada", "siembra_seca", "calor"]
    h = actual.probabilidades[0]
    k = m.anios_con_helada[8]
    assert (h.mes, h.cultivo, h.anios, h.de) == (8, "soja", k, 30)
    assert h.texto == f"Helada en septiembre con soja en el lote: {k} de 30 años ({round(k / 30 * 100)} %)"
    assert h.fuente.endswith(s.periodo_clima)
    assert actual.probabilidades[2].texto.startswith("Máxima de 35 °C o más en enero con soja: ")

    # A: soja de mayo a marzo (1 mes de barbecho) → la siembra cae en mayo.
    assert [(p.evento, p.mes) for p in a.probabilidades if p.evento == "siembra_seca"] == [("siembra_seca", 4)]
    assert c.probabilidades == []  # descartada: sin calendario
    assert not any("Probabilidad climatológica" in f for f in s.informacion_falta)


def test_cargar_cultivos_sin_motor_da_none(monkeypatch):
    def falta(nombre):
        raise ImportError(nombre)

    monkeypatch.setattr(servicio.importlib, "import_module", falta)
    assert servicio._cargar_cultivos() is None


def test_cargar_cultivos_toma_solo_lo_que_pide_clima(monkeypatch):
    monkeypatch.setattr(servicio.importlib, "import_module", lambda nombre: SimpleNamespace(C=CULTIVOS))
    assert servicio._cargar_cultivos() == CULTIVOS_CLIMA


def test_motor_sin_catalogo_de_cultivos_lo_dice(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado({}))
    monkeypatch.setattr(servicio, "_cargar_cultivos", lambda: None)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert all(e.probabilidades == [] for e in s.estrategias)
    assert servicio.PROBABILIDAD_SIN_CULTIVOS in s.informacion_falta


def test_stub_sin_probabilidades_y_sin_aviso_extra(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: None)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert all(e.probabilidades == [] for e in s.estrategias)
    assert servicio.PROBABILIDAD_SIN_CULTIVOS not in s.informacion_falta


# --- Campaña del NDVI = última campaña de POWER -----------------------------


def test_ndvi_se_pide_de_nuevo_si_power_termina_en_otra_campana(monkeypatch):
    monkeypatch.setattr(ndvi, "campana_inicio", lambda hoy=None: 2024)  # el fixture de POWER termina en 2025/26
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert CAMPANAS_NDVI_PEDIDAS[-1] == 2025
    assert s.visto_por_satelite.campana == "2025/26"
    assert s.periodo_clima.endswith("2025/26")


def test_ndvi_se_pide_una_sola_vez_si_coincide_con_power(monkeypatch):
    monkeypatch.setattr(ndvi, "campana_inicio", lambda hoy=None: 2025)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert CAMPANAS_NDVI_PEDIDAS == [2025]
    assert s.visto_por_satelite.campana == "2025/26"


# --- Contraste con las mediciones del productor (RF15) ----------------------


def test_pluviometro_que_difiere_baja_la_confianza_del_agua_sin_cambiar_puntajes(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado({}))
    sin = servicio.analizar(Entrada.model_validate(ENTRADA))
    entrada = copy.deepcopy(ENTRADA)
    entrada["mediciones_propias"] = {"lluvia_anual_mm": 650, "anios_registro": 10, "materia_organica_pct": 2.8}
    s = servicio.analizar(Entrada.model_validate(entrada))

    lluvia, mo = s.contraste_mediciones
    assert lluvia.diferencia_pct == -21 and lluvia.confianza_resultante == "baja"
    assert mo.indicador == "materia_organica" and mo.valor_nasa is None
    for k in ("lluvia_anual", "balance_anual"):
        assert s.indicadores[k].confianza == "baja" and "21 %" in s.indicadores[k].motivo
        assert s.indicadores[k].valor == sin.indicadores[k].valor
    assert s.indicadores["et0_anual"].confianza == sin.indicadores["et0_anual"].confianza
    a, c = s.estrategias[1], s.estrategias[3]
    assert any("difiere 21 %" in r for r in a.riesgos) and a.riesgos[0] == "Secado ~30 días antes de la siembra"
    assert c.riesgos == []  # descartada: solo el motivo
    for e_sin, e_con in zip(sin.estrategias, s.estrategias):  # ningún puntaje cambia
        assert e_con.puntos == e_sin.puntos and e_con.cercania == e_sin.cercania
    assert not any("en preparación" in f and "Contraste" in f for f in s.informacion_falta)


def test_pluviometro_que_coincide_no_toca_la_confianza():
    entrada = copy.deepcopy(ENTRADA)
    entrada["mediciones_propias"] = {"lluvia_anual_mm": 800}
    s = servicio.analizar(Entrada.model_validate(entrada))
    assert s.contraste_mediciones[0].confianza_resultante == "alta"
    assert s.indicadores["lluvia_anual"].confianza == "media"
