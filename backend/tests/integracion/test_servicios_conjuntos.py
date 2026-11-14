"""Integración de punta a punta: cada servicio externo fallando por separado, entradas que
cambian el camino del motor y las mediciones del productor por todas sus vías (ver `conftest.py`).

Complementa a `test_flujo_completo.py` (camino feliz y caídas totales): acá se verifica que una
fuente que falla solo afecta lo que depende de ella, lo dice en "Información que falta" y no
toca el resto de la respuesta.
"""

from __future__ import annotations

import copy
import io
import json
import re
from datetime import date, timedelta

import numpy as np
import pytest

from app.api.contrato import Salida
from tests.integracion.conftest import FIX_POWER, FIX_SAT, RED

pytestmark = pytest.mark.enable_socket  # TestClient usa un socketpair local, no internet

PROHIBIDO = re.compile(r"te recomendamos|deber[ií]as|\bla mejor\b|\bel mejor\b", re.IGNORECASE)


def _analizar(cliente, entrada: dict) -> dict:
    r = cliente.post("/analizar", json=entrada)
    assert r.status_code == 200, r.text
    salida = r.json()
    Salida.model_validate(salida)
    return salida


def _con(entrada_demo: dict, **cambios) -> dict:
    return {**copy.deepcopy(entrada_demo), **cambios}


def _puntos(salida: dict) -> dict:
    return {e["id"]: e["puntos"] for e in salida["estrategias"]}


def _probabilidades(salida: dict) -> dict:
    return {(e["id"], p["evento"], p["mes"], p["cultivo"]): (p["anios"], p["de"])
            for e in salida["estrategias"] for p in e["probabilidades"]}


def _falta(salida: dict, texto: str) -> bool:
    return any(texto in f for f in salida["informacion_falta"])


# --- 1. Una fuente satelital caída: solo cae lo que depende de ella -----------------------------

def test_nasadem_caido_usa_aws_y_saca_solo_la_capa_de_pendiente(cliente, entrada_demo, red_nasa):
    base = _analizar(cliente, entrada_demo)
    red_nasa["pc"]["caidas"] = {"nasadem"}
    s = _analizar(cliente, entrada_demo)

    assert RED["aws_terrain"] >= 1
    assert s["lote"]["pendiente_pct"]["valor"] == pytest.approx(base["lote"]["pendiente_pct"]["valor"], abs=0.1)
    assert "AWS" in s["lote"]["pendiente_pct"]["fuente"]
    assert s["capas"]["pendiente_mapa"] is None and "pendiente_mapa" in s["capas"]["no_disponibles"]
    assert _falta(s, "Capa de pendiente")
    # Lo que no depende de NASADEM sale igual.
    assert s["capas"]["cultivo_mapa"] is not None
    assert s["visto_por_satelite"] == base["visto_por_satelite"]
    assert s["indicadores"]["et_real_anual"] == base["indicadores"]["et_real_anual"]


def test_worldcover_caido_no_bloquea_ni_cambia_los_puntajes(cliente, entrada_demo, red_nasa):
    base = _analizar(cliente, entrada_demo)
    red_nasa["pc"]["caidas"] = {"esa-worldcover"}
    s = _analizar(cliente, entrada_demo)

    assert s["lote"]["cobertura_agricola_pct"]["confianza"] == "sin_dato"
    assert s["capas"]["cultivo_mapa"] is None and "cultivo_mapa" in s["capas"]["no_disponibles"]
    assert _falta(s, "ESA WorldCover")
    assert _puntos(s) == _puntos(base)  # WorldCover no entra al motor
    assert s["capas"]["pendiente_mapa"] is not None


def test_et_de_modis_caida_solo_saca_la_et_real(cliente, entrada_demo, red_nasa):
    base = _analizar(cliente, entrada_demo)
    red_nasa["pc"]["caidas"] = {"modis-16A3GF-061"}
    s = _analizar(cliente, entrada_demo)

    assert s["indicadores"]["et_real_anual"]["valor"] is None
    assert s["indicadores"]["et_real_anual"]["confianza"] == "sin_dato"
    assert s["informacion_falta"] and all("ET real" in f for f in s["informacion_falta"])
    assert _puntos(s) == _puntos(base)
    assert s["capas"]["ndvi_mensual"] == base["capas"]["ndvi_mensual"]


def test_hls_sin_escenas_usa_modis_de_respaldo(cliente, entrada_demo, red_nasa):
    """Sin escena limpia de HLS, cada mes cae a MODIS 250 m, y la tabla y el mapa lo dicen."""
    red_nasa["pc"]["sin_escenas"] = {"hls2-s30", "hls2-l30"}
    s = _analizar(cliente, entrada_demo)

    meses = [m for m in s["visto_por_satelite"]["meses"] if m]
    assert meses, s["informacion_falta"]
    assert all(m["coleccion"] == "modis-13Q1-061" for m in meses)
    assert RED["pc_busqueda:modis-13Q1-061"] >= len(meses)
    for mes, capa in zip(s["visto_por_satelite"]["meses"], s["capas"]["ndvi_mensual"], strict=True):
        if mes and capa:
            assert (capa["coleccion"], capa["item"]) == (mes["coleccion"], mes["item"])


def test_sin_ndvi_el_motor_sigue_y_la_erosion_va_a_falta(cliente, entrada_demo, red_nasa):
    red_nasa["pc"]["caidas"] = {"hls2-s30", "hls2-l30", "modis-13Q1-061"}
    s = _analizar(cliente, entrada_demo)

    assert s["visto_por_satelite"]["confianza"] == "sin_dato"
    assert s["visto_por_satelite"]["meses_con_dato"] == 0
    assert "riesgo_erosion" not in s["indicadores"]
    assert _falta(s, "NDVI del lote") and _falta(s, "Capa de erosión")
    assert all(e["cercania"] is not None for e in s["estrategias"] if e["disponible"])


def test_lote_no_agricola_da_422_con_el_aviso_de_worldcover(cliente, entrada_demo, red_nasa):
    grilla = np.load(FIX_SAT / "grilla_worldcover.npy")
    grilla[0][grilla[0] == 40] = 50  # todo el cultivo pasa a ser zona construida
    buf = io.BytesIO()
    np.save(buf, grilla)
    red_nasa["pc"]["grilla_worldcover"] = buf.getvalue()

    r = cliente.post("/analizar", json=entrada_demo)
    assert r.status_code == 422  # ni con el lote de ejemplo se devuelve la demo: el aviso es del lote
    assert "Marcá un lote de campo" in r.json()["mensaje"]


# --- 2. NASA POWER define la campaña de toda la salida -------------------------------------------

def test_power_con_meses_sin_dato_corre_la_campana_de_todo(cliente, entrada_demo, red_nasa):
    """Si POWER termina antes, el NDVI se vuelve a pedir para esa campaña, las probabilidades se
    cuentan sobre las campañas que hay y la serie más corta va a "Información que falta"."""
    datos = json.loads(FIX_POWER.read_text(encoding="utf-8"))
    for valores in datos["properties"]["parameter"].values():
        for clave in list(valores)[-30:]:  # los últimos ~2,5 años en −999
            valores[clave] = -999.0
    red_nasa["power_datos"] = datos
    s = _analizar(cliente, entrada_demo)

    ultima = s["serie_anual"]["campanas"][-1]["campana"]
    assert s["periodo_clima"].endswith(ultima)
    assert s["visto_por_satelite"]["campana"] == ultima
    n = len(s["serie_anual"]["campanas"])
    assert n < 30
    assert all(de == n for _, de in _probabilidades(s).values())
    assert _falta(s, f"{n} campañas completas")


def test_power_con_pocas_campanas_da_503(cliente, entrada_demo, red_nasa):
    datos = json.loads(FIX_POWER.read_text(encoding="utf-8"))
    for valores in datos["properties"]["parameter"].values():
        for clave in list(valores)[-280:]:  # 13 claves por año: quedan ~10 campañas completas (< 15)
            valores[clave] = -999.0
    red_nasa["power_datos"] = datos
    entrada = copy.deepcopy(entrada_demo)
    entrada["lote"]["tipo"] = "dibujado"
    assert cliente.post("/analizar", json=entrada).status_code == 503


def test_power_se_pide_una_sola_vez_por_celda(cliente, entrada_demo):
    _analizar(cliente, entrada_demo)
    _analizar(cliente, _con(entrada_demo, cultivo_verano="maiz"))
    assert RED["nasa_power"] == 1


# --- 3. Polígonos inválidos: 422 con el texto para el usuario ------------------------------------

@pytest.mark.parametrize("anillo, texto", [
    ([[-64.2381, -33.2436], [-64.2268, -33.2517], [-64.2268, -33.2436], [-64.2381, -33.2517],
      [-64.2381, -33.2436]], "se cruzan"),
    ([[-64.2381, -33.2436], [-64.2380, -33.2436], [-64.2380, -33.2437], [-64.2381, -33.2436]], "Muy chico"),
    ([[-65, -33], [-63, -33], [-63, -35], [-65, -35], [-65, -33]], "Muy grande"),
])
def test_poligono_invalido_da_422_antes_de_llamar_a_nasa(cliente, entrada_demo, anillo, texto):
    entrada = copy.deepcopy(entrada_demo)
    entrada["lote"]["tipo"] = "dibujado"
    entrada["lote"]["poligono"]["coordinates"] = [anillo]
    r = cliente.post("/analizar", json=entrada)
    assert r.status_code == 422
    assert texto in r.json()["mensaje"]
    assert sum(RED.values()) == 0  # ni POWER ni Planetary Computer


# --- 4. Entradas que cambian el camino del motor --------------------------------------------------

@pytest.mark.parametrize("no_sembrar, columna", [
    (["vicia", "centeno"], "A"), (["trigo", "cebada"], "B"), (["sorgo", "girasol"], "C"),
])
def test_no_sembrar_descarta_la_columna_en_gris_con_motivo(cliente, entrada_demo, no_sembrar, columna):
    s = _analizar(cliente, _con(entrada_demo, no_sembrar=no_sembrar))
    assert [e["id"] for e in s["estrategias"]] == ["actual", "A", "B", "C"]  # siempre 4 columnas
    e = next(e for e in s["estrategias"] if e["id"] == columna)
    assert e["disponible"] is False and e["motivo_descarte"]
    assert e["puntos"] is None and e["cercania"] is None and e["probabilidades"] == []
    otras = [x for x in s["estrategias"] if x["id"] != columna]
    assert all(x["disponible"] and x["cercania"] is not None for x in otras)


def test_textos_de_la_salida_real_no_recomiendan(cliente, entrada_demo):
    """Principio "compara, no recomienda", sobre la salida del motor real con varias entradas."""
    entradas = [
        entrada_demo,
        _con(entrada_demo, cultivo_verano="maiz", invierno="trigo", campana_pasada="soja"),
        _con(entrada_demo, prioridades={"agua": 5, "suelo": 1, "ingreso": 5, "erosion": 1}),
        _con(entrada_demo, no_sembrar=["vicia", "centeno"], restricciones=["maquinaria_limitada"]),
        _con(entrada_demo, anegable="si", textura_suelo="arenoso",
             mediciones_propias={"lluvia_anual_mm": 600, "anios_registro": 7, "materia_organica_pct": 2.1}),
    ]
    for entrada in entradas:
        texto = json.dumps(_analizar(cliente, entrada), ensure_ascii=False)
        m = PROHIBIDO.search(texto)
        assert m is None, texto[max(0, m.start() - 100):m.end() + 50]


# --- 5. Mediciones del productor por todas sus vías ----------------------------------------------

def test_pluviometro_a_mano_llega_al_contraste_y_al_motor(cliente, entrada_demo):
    base = _analizar(cliente, entrada_demo)
    s = _analizar(cliente, _con(entrada_demo, mediciones_propias={"lluvia_anual_mm": 600, "anios_registro": 7}))

    fila = next(c for c in s["contraste_mediciones"] if c["indicador"] == "lluvia_anual")
    assert fila["diferencia_pct"] < -15 and fila["confianza_resultante"] == "baja"
    assert s["indicadores"]["lluvia_anual"]["confianza"] == "baja"
    assert s["indicadores"]["lluvia_anual"]["valor"] == base["indicadores"]["lluvia_anual"]["valor"]  # NASA no cambia
    assert s["estrategias"][0]["puntos"]["agua"] != base["estrategias"][0]["puntos"]["agua"]  # mezcla del motor
    comunes = _probabilidades(s).keys() & _probabilidades(base).keys()
    assert comunes and all(_probabilidades(s)[k] == _probabilidades(base)[k] for k in comunes)


def test_materia_organica_se_muestra_y_no_puntua(cliente, entrada_demo):
    base = _analizar(cliente, entrada_demo)
    s = _analizar(cliente, _con(entrada_demo, mediciones_propias={"materia_organica_pct": 2.5}))
    assert any(c["indicador"] == "materia_organica" for c in s["contraste_mediciones"])
    assert _puntos(s) == _puntos(base)
    assert [e["cercania"] for e in s["estrategias"]] == [e["cercania"] for e in base["estrategias"]]


def test_planilla_diaria_llega_al_contraste(cliente, entrada_demo):
    """Registro diario (fecha dd/mm/aaaa) → /mediciones/planilla → /analizar."""
    filas = ["fecha;lluvia_mm"]
    dia, fin = date(2022, 7, 1), date(2025, 6, 30)  # 3 campañas completas dentro del período de POWER
    while dia <= fin:
        filas.append(f"{dia:%d/%m/%Y};{'2,5' if dia.day % 3 == 0 else '0'}")
        dia += timedelta(days=1)
    r = cliente.post("/mediciones/planilla",
                     files={"archivo": ("diario.csv", ("\n".join(filas) + "\n").encode(), "text/csv")})
    assert r.status_code == 200, r.text
    serie = r.json()["serie"]
    assert len(serie["campanas_completas"]["lluvia_mm"]) == 3

    s = _analizar(cliente, _con(entrada_demo, mediciones_propias={"serie_mensual": serie["meses"]}))
    fila = next(c for c in s["contraste_mediciones"] if c["indicador"] == "lluvia_anual")
    assert len(fila["campanas_comparadas"]) == 3
