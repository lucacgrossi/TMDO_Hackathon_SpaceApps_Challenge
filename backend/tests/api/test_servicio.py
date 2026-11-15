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


def test_que_le_falta_en_numeros_contra_la_columna_con_mas_puntos():
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    disp = [e for e in s.estrategias if e.disponible and e.cercania_objetivos]
    assert any(e.que_le_falta for e in disp)
    for e in disp:
        esperadas = sum(1 for o in servicio.OBJETIVOS
                        if max(x.cercania_objetivos[o] for x in disp) > e.cercania_objetivos[o])
        assert len(e.que_le_falta) == esperadas
        for texto in e.que_le_falta:
            assert " pts, " in texto and " menos que " in texto
    for e in s.estrategias:
        if not e.disponible:
            assert e.que_le_falta == []


def test_que_le_falta_sin_diferencias_queda_vacio_y_no_cuenta_descartadas():
    from app.api.contrato import Estrategia

    def col(id_, pts, disponible=True):
        return Estrategia(id=id_, nombre=f"Columna {id_}", especies="", disponible=disponible,
                          motivo_descarte=None if disponible else "descartada", calendario=None,
                          resumen="", cercania_objetivos=pts if disponible else None)
    iguales = {"agua": 50, "suelo": 50, "erosion": 50, "ingreso": 50}
    cols = [col("actual", iguales), col("A", dict(iguales, suelo=80)), col("B", iguales, disponible=False)]
    servicio.completar_que_le_falta(cols)
    assert cols[1].que_le_falta == []
    assert cols[0].que_le_falta == ["Salud del suelo: 50 pts, 30 menos que A · Columna A (80 pts)"]
    assert cols[2].que_le_falta == []


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


def test_poligono_sin_datos_de_worldcover_da_422(monkeypatch):
    """H-002: un polígono en el mar (WorldCover sin datos) no se analiza como lote agrícola."""
    monkeypatch.setattr(cobertura, "calcular", lambda p: cobertura._sin_cobertura("sin tesela"))
    r = cliente.post("/analizar", json=_dibujado())
    assert r.status_code == 422
    assert r.json() == {"mensaje": cobertura.AVISO_SIN_DATOS}


def _en(lat: float, lon: float, d: float = 0.004) -> dict:
    """Entrada dibujada con un cuadrado de ~2 × d grados centrado en (lat, lon)."""
    e = _dibujado()
    anillo = [[lon - d, lat + d], [lon + d, lat + d], [lon + d, lat - d], [lon - d, lat - d], [lon - d, lat + d]]
    e["lote"]["poligono"]["coordinates"] = [anillo]
    e["lote"]["centro"] = [lat, lon]
    e["lat"], e["lon"] = lat, lon
    return e


def test_lote_en_el_hemisferio_norte_da_422_sin_pedir_a_power(monkeypatch):
    """H-014: Iowa (42,03, −93,75). Se rechaza antes de pedir datos a NASA POWER o al satélite."""
    pedidos = []

    def no_llamar(*args, **kwargs):
        pedidos.append(args)
        raise AssertionError("no debería pedir datos")

    monkeypatch.setattr(power, "pedir_power", no_llamar)
    monkeypatch.setattr(cobertura, "calcular", no_llamar)
    r = cliente.post("/analizar", json=_en(42.03, -93.75))
    assert r.status_code == 422
    assert r.json() == {"mensaje": servicio.MENSAJE_HEMISFERIO_NORTE}
    assert pedidos == []


def test_lote_en_el_hemisferio_sur_sigue():
    assert cliente.post("/analizar", json=_en(-35.0, -61.0)).status_code == 200


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
    assert ent["textura"] == "franco" and "materia_organica_pct" not in ent
    assert ent["mediciones"] == {"lluvia_anual_mm": None, "anios_registro": None, "serie_mensual": None}
    assert set(ind["terciles"]) == {"seco", "normal", "humedo"} and ind["n_anios"] == 30
    # NASA campaña por campaña, para mezclar con el mismo período del registro del productor (#64).
    cn = ind["campanas_nasa"]
    assert len(cn) == 30 and cn[0]["campana"] == "1996/97" and cn[-1]["campana"] == "2025/26"
    assert all(len(c[k]) == 12 for c in cn for k in ("lluvia_mm", "t_min_c", "t_max_c"))
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


def test_stub_nombra_a_b_como_cultivo_de_invierno_comercial(monkeypatch):
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: None)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.estrategias[2].nombre == "Cultivo de invierno comercial"


def test_el_motor_recibe_todas_las_restricciones():
    e = copy.deepcopy(ENTRADA)
    e["restricciones"] = ["sin_riego", "sin_hacienda", "maquinaria_limitada"]
    entradas = servicio._entradas_motor(Entrada.model_validate(e))
    assert entradas["restricciones"] == ["sin_riego", "sin_hacienda", "maquinaria_limitada"]
    assert entradas["maquinaria_limitada"] is True


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


def test_pluviometro_que_difiere_baja_la_confianza_del_agua_y_llega_al_motor(monkeypatch):
    recibido = {}
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado(recibido))
    sin = servicio.analizar(Entrada.model_validate(ENTRADA))
    entrada = copy.deepcopy(ENTRADA)
    # Sin años de registro: contra el promedio de las 30 campañas (819 mm), −21 %. Con años, el contraste
    # compara contra las últimas campañas, como la mezcla del motor (H-006).
    entrada["mediciones_propias"] = {"lluvia_anual_mm": 650, "materia_organica_pct": 2.8}
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
    # El peso de la medición en los puntajes lo pone el motor (mezcla.py): acá solo se verifica que le llegue.
    assert recibido["entradas"]["mediciones"] == {"lluvia_anual_mm": 650, "anios_registro": None, "serie_mensual": None}
    assert "materia_organica_pct" not in recibido["entradas"]
    assert not any("en preparación" in f and "Contraste" in f for f in s.informacion_falta)


def test_pluviometro_que_coincide_no_toca_la_confianza():
    entrada = copy.deepcopy(ENTRADA)
    entrada["mediciones_propias"] = {"lluvia_anual_mm": 800}
    s = servicio.analizar(Entrada.model_validate(entrada))
    assert s.contraste_mediciones[0].confianza_resultante == "alta"
    assert s.indicadores["lluvia_anual"].confianza == "media"


def _planilla_desde_power(campanas: list[str], factor: float) -> list[dict]:
    """Planilla mensual que copia la lluvia de POWER (fixture) en esas campañas, por `factor`."""
    serie = power.armar_serie(json.loads((Path(__file__).parents[1] / "clima" / "fixtures" / "power_rio_cuarto.json")
                                         .read_text(encoding="utf-8")))
    meses = []
    for c in serie.campanas:
        if c.etiqueta in campanas:
            for m in (6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5):
                anio = c.anio_inicio + 1 if m < 6 else c.anio_inicio
                meses.append({"mes": f"{anio}-{m + 1:02d}", "lluvia_mm": round(c.lluvia_mm[m] * factor, 1)})
    return meses


def test_planilla_compara_en_las_mismas_campanas_y_llega_al_motor(monkeypatch):
    """Planilla (5.3 y 5.5): mismas campañas que NASA, confianza baja en agua y la serie llega al motor."""
    recibido = {}
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado(recibido))
    sin = servicio.analizar(Entrada.model_validate(ENTRADA))
    seis = ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24"]
    entrada = copy.deepcopy(ENTRADA)
    entrada["mediciones_propias"] = {"lluvia_anual_mm": 900, "serie_mensual": _planilla_desde_power(seis, 0.8)}
    s = servicio.analizar(Entrada.model_validate(entrada))

    (lluvia,) = s.contraste_mediciones
    assert lluvia.campanas_comparadas == seis and lluvia.diferencia_pct == -20
    assert "se usó la planilla" in lluvia.texto
    for k in ("lluvia_anual", "balance_anual"):
        assert s.indicadores[k].confianza == "baja" and "mismas campañas" in s.indicadores[k].motivo
        assert s.indicadores[k].valor == sin.indicadores[k].valor
    assert any("difiere 20 %" in r for r in s.estrategias[1].riesgos)
    med = recibido["entradas"]["mediciones"]
    assert med["lluvia_anual_mm"] == 900 and len(med["serie_mensual"]) == 72
    assert med["serie_mensual"][0] == {"mes": "2018-07", "lluvia_mm": med["serie_mensual"][0]["lluvia_mm"],
                                       "t_min_c": None, "t_max_c": None}
    # Las probabilidades salen de las 30 campañas de NASA: la planilla no las cambia.
    for e_sin, e_con in zip(sin.estrategias, s.estrategias):
        assert e_con.probabilidades == e_sin.probabilidades


def test_planilla_con_heladas_baja_la_confianza_y_suma_la_linea_sin_cambiar_probabilidades(monkeypatch):
    """Planilla con temperaturas (5.4): confianza de heladas, línea del productor y la serie llega al motor."""
    recibido = {}
    monkeypatch.setattr(servicio, "_cargar_motor", lambda: _motor_simulado(recibido))
    monkeypatch.setattr(servicio, "_cargar_cultivos", lambda: CULTIVOS_CLIMA)
    sin = servicio.analizar(Entrada.model_validate(ENTRADA))

    serie = power.armar_serie(json.loads((Path(__file__).parents[1] / "clima" / "fixtures" / "power_rio_cuarto.json")
                                         .read_text(encoding="utf-8")))
    ultimas = serie.campanas[-6:]
    meses = []
    for c in ultimas:
        for m in (6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5):
            t_min = -3.0 if m in (9, 10) else c.t_min_c[m]  # heladas en octubre y noviembre que NASA no tiene
            meses.append({"mes": f"{c.anio_inicio + 1 if m < 6 else c.anio_inicio}-{m + 1:02d}",
                          "t_min_c": t_min, "t_max_c": c.t_max_c[m]})
    entrada = copy.deepcopy(ENTRADA)
    entrada["mediciones_propias"] = {"serie_mensual": meses}
    s = servicio.analizar(Entrada.model_validate(entrada))

    assert s.indicadores["meses_helada_frecuente"].confianza == "baja"
    assert "heladas que NASA POWER no ve" in s.indicadores["meses_helada_frecuente"].motivo
    assert s.indicadores["meses_helada_frecuente"].valor == sin.indicadores["meses_helada_frecuente"].valor
    assert s.indicadores["lluvia_anual"].confianza == sin.indicadores["lluvia_anual"].confianza
    assert any(c.indicador == "helada" and c.mes == 10 for c in s.contraste_mediciones)
    assert len(recibido["entradas"]["mediciones"]["serie_mensual"]) == 72  # el motor la mezcla (mezcla.py)
    for e_sin, e_con in zip(sin.estrategias, s.estrategias):
        for p_sin, p_con in zip(e_sin.probabilidades, e_con.probabilidades):
            assert (p_con.anios, p_con.de, p_con.pct, p_con.texto) == (p_sin.anios, p_sin.de, p_sin.pct, p_sin.texto)
            if p_con.evento in ("helada", "calor") and p_con.contraste:
                assert p_con.contraste.startswith("Tu estación:")


# --- Capas armonizadas sobre la grilla del lote (plan-armonizacion-capas.md) -----

from app.api.mock import salida_mock  # noqa: E402
from tests.api.conftest import elevacion_ok, ndvi_ok  # noqa: E402

_EJEMPLO = salida_mock().capas  # grilla y CapaRaster válidas del mock (42 × 30)
_GRILLA = _EJEMPLO.grilla.model_dump()
_PEND = _EJEMPLO.pendiente_mapa.model_dump()
_CULT = _EJEMPLO.cultivo_mapa.model_dump()


def _con_capas(monkeypatch, pend=_PEND, cult=_CULT, grilla=_GRILLA, motivo_pend=None):
    monkeypatch.setattr(elevacion, "calcular", lambda pol: {**elevacion_ok(pol), "mapa": pend, "grilla": grilla,
                                                             "mapa_motivo": motivo_pend})
    monkeypatch.setattr(cobertura, "calcular", lambda pol: {**cobertura_ok(pol), "mapa": cult, "grilla": grilla,
                                                             "mapa_motivo": None})


def test_capas_de_pendiente_y_cultivo_salen_en_la_grilla(monkeypatch):
    _con_capas(monkeypatch)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    c = s.capas
    assert c.grilla is not None and (c.grilla.ancho, c.grilla.alto) == (42, 30)
    assert c.pendiente_mapa.id == "pendiente" and c.cultivo_mapa.id == "cultivo"
    assert all((x.bounds, x.ancho, x.alto) == (c.grilla.bounds, 42, 30) for x in c.capas_raster())
    assert "pendiente_mapa" not in c.no_disponibles and "cultivo_mapa" not in c.no_disponibles


def test_capa_que_falta_va_a_no_disponibles_con_el_motivo(monkeypatch):
    _con_capas(monkeypatch, pend=None, motivo_pend="NASADEM no respondió")
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.pendiente_mapa is None and "pendiente_mapa" in s.capas.no_disponibles
    assert "Capa de pendiente: NASADEM no respondió" in s.informacion_falta
    assert s.capas.cultivo_mapa is not None


def test_capa_mal_armada_no_rompe_analizar(monkeypatch):
    _con_capas(monkeypatch, cult={**_CULT, "escala": {"cortes": [0, 1], "colores": ["#000"], "etiquetas": []}})
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.cultivo_mapa is None and "cultivo_mapa" in s.capas.no_disponibles
    assert any(f.startswith("Capa de cultivo: no se pudo leer") for f in s.informacion_falta)
    assert s.capas.pendiente_mapa is not None


def test_ndvi_del_mes_trae_su_mapa(monkeypatch):
    mapa = {**_PEND, "id": "ndvi", "titulo": "NDVI", "unidad": "NDVI", "fecha": "2026-01-15"}

    def ndvi_con_mapas(poligono, campana=None):
        r = ndvi_ok(poligono, campana)
        return {**r, "mapas": [mapa] * 12, "grilla": _GRILLA}

    _con_capas(monkeypatch)
    monkeypatch.setattr(ndvi, "calcular", ndvi_con_mapas)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    con_mapa = [m for m in s.capas.ndvi_mensual if m and m.mapa]
    assert con_mapa and all(m.mapa.id == "ndvi" for m in con_mapa)
    assert "ndvi_mapa" not in s.capas.no_disponibles


def test_sin_capas_nuevas_la_salida_es_la_de_antes():
    """Con las fuentes de siempre (sin grilla ni mapas), las capas nuevas van vacías y no rompen nada."""
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.grilla is None and s.capas.capas_raster() == []
    assert any(s.capas.ndvi_mensual)


def _meses_bajos(meses: int) -> dict:
    """`meses_bajos_mapa` de ndvi.py sobre la misma grilla: `meses` en cada píxel del lote, nodata afuera."""
    import base64

    import numpy as np

    pend = np.frombuffer(base64.b64decode(_PEND["valores"]), dtype="<i2")
    q = np.where(pend == _PEND["nodata"], _PEND["nodata"], meses).astype("<i2")
    return {**_PEND, "id": "meses_bajos", "titulo": "Meses con NDVI bajo", "unidad": "meses", "factor": 1.0,
            "valores": base64.b64encode(q.tobytes()).decode(), "confianza": "alta"}


def _con_erosion_por_pixel(monkeypatch, meses_bajos):
    _con_capas(monkeypatch)
    monkeypatch.setattr(ndvi, "calcular", lambda pol, campana=None: {**ndvi_ok(pol, campana),
                                                                      "meses_bajos_mapa": meses_bajos})


def test_capa_de_erosion_por_pixel_sale_en_la_grilla_y_cierra_con_la_tabla(monkeypatch):
    _con_erosion_por_pixel(monkeypatch, _meses_bajos(4))
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    c = s.capas
    assert c.erosion_mapa is not None and c.erosion_mapa.id == "erosion"
    assert (c.erosion_mapa.bounds, c.erosion_mapa.ancho, c.erosion_mapa.alto) == (
        c.grilla.bounds, c.grilla.ancho, c.grilla.alto)
    assert "erosion_mapa" not in c.no_disponibles
    # El mapa es pendiente del píxel × meses del píxel (4). El número de la tabla lo elige Back 2
    # (satelite/capas.py, #73: pendiente general × meses medios por píxel) y servicio solo exige que
    # cierre con el mapa: valor_lote == riesgo_erosion.
    assert c.erosion_mapa.resumen.media == pytest.approx(c.pendiente_mapa.resumen.media * 4, abs=0.1)
    assert c.erosion_mapa.resumen.valor_lote == s.indicadores["riesgo_erosion"].valor
    assert c.erosion["metodo"] == "por_pixel"


def test_sin_meses_bajos_por_pixel_la_erosion_queda_del_lote_y_dice_por_que(monkeypatch):
    _con_erosion_por_pixel(monkeypatch, None)
    s = servicio.analizar(Entrada.model_validate(ENTRADA))
    assert s.capas.erosion_mapa is None and "erosion_mapa" in s.capas.no_disponibles
    assert s.capas.erosion["metodo"] == "lote" and "riesgo_erosion" in s.indicadores
    assert any(f.startswith("Capa de erosión por píxel: ") for f in s.informacion_falta)
