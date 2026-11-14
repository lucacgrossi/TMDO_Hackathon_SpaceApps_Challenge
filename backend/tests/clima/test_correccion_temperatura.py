"""Contraste de heladas y calor con la planilla del productor (docs/plan-planilla-lluvia.md, 5.4). Sin red."""

import json
from pathlib import Path

import pytest

from app.api.contrato import MedicionesPropias, MedicionMes
from app.clima import correccion as corr
from app.clima.indicadores import calcular
from app.clima.power import LAT_DEMO, LON_DEMO, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"
SEIS = ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24"]
MAYO = 4


@pytest.fixture(scope="module")
def clima():
    return calcular(armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8"))), LAT_DEMO, LON_DEMO)


def _estacion(clima, campanas, cambios=None, solo_tmin=False):
    """Planilla con las temperaturas de NASA en esas campañas; `cambios[(campaña, mes)] = t_min` las pisa."""
    cambios = cambios or {}
    meses = []
    for c in clima.campanas:
        if c.etiqueta not in campanas:
            continue
        y = int(c.etiqueta[:4])
        for m in (6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5):
            t_min = cambios.get((c.etiqueta, m), c.t_min_c[m])
            meses.append(MedicionMes(mes=f"{y + 1 if m < 6 else y}-{m + 1:02d}", t_min_c=t_min,
                                     t_max_c=None if solo_tmin else c.t_max_c[m]))
    return meses


def _sin_helada_nasa_en_mayo(clima):
    return [c.etiqueta for c in clima.campanas if c.etiqueta in SEIS and c.t_min_c[MAYO] >= 0]


def test_estacion_igual_a_nasa_no_toca_la_confianza(clima):
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, SEIS)), clima)
    heladas = [c for c in r.contraste if c.indicador == "helada"]
    assert heladas and all(c.valor_productor == c.valor_nasa for c in heladas)
    assert all(c.confianza_resultante == "alta" and c.campanas_comparadas == SEIS for c in heladas)
    assert r.confianza_helada is None and r.riesgos == []
    assert r.confianza_agua is None  # sin lluvia en la planilla, no hay contraste de agua


def test_heladas_que_nasa_no_ve_bajan_la_confianza_y_suman_un_riesgo(clima):
    libres = _sin_helada_nasa_en_mayo(clima)
    assert len(libres) >= 2, "el fixture necesita al menos 2 mayos sin helada en NASA"
    cambios = {(c, MAYO): -3.0 for c in libres[:2]}
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, SEIS, cambios)), clima)
    mayo = next(c for c in r.contraste if c.indicador == "helada" and c.mes == MAYO)
    assert mayo.valor_productor - mayo.valor_nasa == 2
    assert mayo.confianza_resultante == "baja"
    assert mayo.texto.startswith("Heladas en mayo: tu estación, ")
    assert "NASA en las mismas campañas" in mayo.texto
    assert sum(d.diferencia for d in mayo.detalle_campanas) == 2
    assert r.confianza_helada == "baja" and "mayo" in r.motivo_helada
    assert any(x.startswith("Tu estación registra heladas que NASA POWER no ve (mayo") for x in r.riesgos)
    assert r.lineas_probabilidad[("helada", MAYO)].startswith("Tu estación: helada en mayo en ")


@pytest.mark.parametrize("n,umbral", [(1, 1), (2, 1), (3, 1), (4, 2), (6, 2), (9, 3), (10, 4), (30, 10)])
def test_umbral_de_diferencia_es_1_de_cada_3_campanas(n, umbral):
    """Decidido 14/11: mismo criterio que la helada frecuente, desde 1 campaña. Con 6 da 2 (lo del plan)."""
    assert corr.umbral_diferencia(n) == umbral


def test_con_una_campana_en_comun_ya_compara(clima):
    """Como el motor, alcanza 1 año: con 1 campaña, 1 helada de diferencia ya baja la confianza."""
    libre = _sin_helada_nasa_en_mayo(clima)[0]
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, [libre], {(libre, MAYO): -3.0})), clima)
    mayo = next(c for c in r.contraste if c.indicador == "helada" and c.mes == MAYO)
    assert (mayo.valor_productor, mayo.valor_nasa) == (1, 0)
    assert mayo.texto.endswith("1 de 1 campañas · NASA en las mismas campañas, 0 de 1")
    assert mayo.confianza_resultante == "baja" and r.confianza_helada == "baja"
    assert not any("pocos años" in x for x in r.riesgos)


def test_una_helada_de_diferencia_en_6_campanas_no_alcanza(clima):
    libre = _sin_helada_nasa_en_mayo(clima)[0]
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, SEIS, {(libre, MAYO): -3.0})), clima)
    mayo = next(c for c in r.contraste if c.indicador == "helada" and c.mes == MAYO)
    assert mayo.valor_productor - mayo.valor_nasa == 1
    assert mayo.confianza_resultante == "alta" and r.confianza_helada is None


def test_calor_compara_maximas_de_35(clima):
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, SEIS)), clima)
    enero = next(c for c in r.contraste if c.indicador == "calor" and c.mes == 0)
    assert enero.unidad == "campañas con ≥ 35 °C"
    assert enero.texto.startswith("Máxima de 35 °C o más en enero: tu estación, ")
    assert ("calor", 0) in r.lineas_probabilidad


def test_solo_minimas_no_arma_calor(clima):
    r = corr.contrastar(MedicionesPropias(serie_mensual=_estacion(clima, SEIS, solo_tmin=True)), clima)
    assert not any(c.indicador == "calor" for c in r.contraste)


def test_registro_fuera_del_periodo_de_nasa_va_a_faltantes(clima):
    meses = [MedicionMes(mes=f"{1980 + (m < 6)}-{m + 1:02d}", t_min_c=-1) for m in range(12)]
    r = corr.contrastar(MedicionesPropias(serie_mensual=meses), clima)
    assert r.contraste == []
    assert any("no coincide con el período de NASA" in f for f in r.faltantes)


def test_lluvia_y_temperaturas_juntas(clima):
    meses = _estacion(clima, SEIS)
    nasa = {c.etiqueta: c for c in clima.campanas}
    con_lluvia = [m.model_copy(update={"lluvia_mm": 50.0}) for m in meses]
    r = corr.contrastar(MedicionesPropias(serie_mensual=con_lluvia), clima)
    indicadores = {c.indicador for c in r.contraste}
    assert {"lluvia_anual", "helada", "calor"} <= indicadores
    assert nasa  # el fixture tiene las campañas
