"""Contrato de la planilla de mediciones (docs/plan-planilla-lluvia.md, 5.1). Sin red."""

import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.contrato import ContrasteMedicion, Entrada, MedicionesPropias, MedicionMes, Probabilidad
from app.api.mock import planilla_mock

ENTRADA = json.loads((Path(__file__).parents[1] / "ejemplos" / "entrada_demo.json").read_text(encoding="utf-8"))


def test_mes_valido_con_una_sola_variable():
    m = MedicionMes(mes="2023-01", lluvia_mm=120.5)
    assert m.t_min_c is None and m.t_max_c is None


def test_mes_sin_ninguna_variable_falla():
    with pytest.raises(ValidationError, match="no trae lluvia ni temperaturas"):
        MedicionMes(mes="2023-01")


@pytest.mark.parametrize("mes", ["2023-13", "2023-1", "01/2023", "2023-00"])
def test_mes_con_formato_invalido_falla(mes):
    with pytest.raises(ValidationError):
        MedicionMes(mes=mes, lluvia_mm=10)


@pytest.mark.parametrize("campo,valor", [("lluvia_mm", -1), ("lluvia_mm", 1001), ("t_min_c", -21), ("t_max_c", 51)])
def test_valores_fuera_de_rango_fallan(campo, valor):
    with pytest.raises(ValidationError):
        MedicionMes(mes="2023-01", **{campo: valor})


def test_entrada_sin_serie_mensual_sigue_validando():
    e = Entrada.model_validate(ENTRADA)
    assert e.mediciones_propias.serie_mensual is None


def test_entrada_con_serie_mensual():
    datos = copy.deepcopy(ENTRADA)
    datos["mediciones_propias"] = {"serie_mensual": [{"mes": "2023-01", "lluvia_mm": 120.5, "t_min_c": 12.1}]}
    e = Entrada.model_validate(datos)
    assert e.mediciones_propias.serie_mensual[0].lluvia_mm == 120.5


def test_serie_de_mas_de_40_anios_falla():
    meses = [{"mes": f"{1900 + i // 12}-{i % 12 + 1:02d}", "lluvia_mm": 1} for i in range(481)]
    with pytest.raises(ValidationError):
        MedicionesPropias(serie_mensual=meses)


def test_contraste_y_probabilidad_aceptan_los_campos_nuevos_opcionales():
    c = ContrasteMedicion(
        indicador="helada", valor_productor=4, valor_nasa=2, unidad="campañas con helada", texto="…", mes=4,
        campanas_comparadas=["2019/20", "2020/21"],
        detalle_campanas=[{"campana": "2019/20", "productor": 1, "nasa": 0, "diferencia": 1}],
    )
    assert c.detalle_campanas[0].campana == "2019/20"
    viejo = ContrasteMedicion(indicador="lluvia_anual", valor_productor=650, unidad="mm/año", texto="…")
    assert viejo.campanas_comparadas is None and viejo.mes is None
    p = Probabilidad(evento="helada", mes=4, cultivo="soja", anios=3, de=30, pct=10, texto="…", fuente="…")
    assert p.contraste is None


def test_mock_de_la_planilla_valida():
    r = planilla_mock()
    assert r.ok and r.serie.granularidad == "mensual"
    assert len(r.serie.meses) == 12 and r.serie.campanas_completas["lluvia_mm"] == ["2022/23"]
    # Los meses del mock son los que el front manda en /analizar.
    MedicionesPropias(serie_mensual=[m.model_dump() for m in r.serie.meses])
