"""Calendario y especies de las 4 columnas (H-003, H-008 y H-026 del reporte QA del 15/11)."""
import pytest

from app.motor import plantillas, reglas
from app.motor.cultivos import BARBECHO, floracion, siembra
from app.motor.estrategias import VERANO_DE_SEGUNDA, calendario
from tests.motor.conftest import entradas

VERANOS = ("soja", "maiz", "girasol", "sorgo", "mani")
JUNIO_A_NOVIEMBRE = range(5, 11)


def _correr(ind, **cambios):
    e = entradas(**cambios)
    return plantillas.armar(reglas.analizar(e, ind), e, ind)


def _col(r, i):
    return next(s for s in r["estrategias"] if s["id"] == i)


@pytest.mark.parametrize("verano", VERANOS)
def test_b_es_siempre_invierno_comercial_mas_soja_de_2a(ind, verano):
    b = _col(_correr(ind, verano=verano), "B")
    assert b["nombre"] == "Cultivo de invierno comercial"
    assert b["especies"] in ("Trigo + soja de 2ª", "Cebada + soja de 2ª")
    inv = "trigo" if b["especies"].startswith("Trigo") else "cebada"
    assert all(b["calendario"][m] == inv for m in JUNIO_A_NOVIEMBRE)  # ciclo completo
    assert all(b["calendario"][m] == "soja2" for m in VERANO_DE_SEGUNDA)
    if verano != "soja":
        assert any("ocupa el lugar" in x for x in b["por_que"])


@pytest.mark.parametrize("verano", VERANOS)
@pytest.mark.parametrize("invierno", ("trigo", "cebada"))
def test_el_invierno_comercial_conserva_su_ciclo_y_el_verano_va_de_2a(verano, invierno):
    cal = calendario(verano, invierno)
    assert all(cal[m] == invierno for m in JUNIO_A_NOVIEMBRE)
    v = "soja2" if verano == "soja" else verano
    assert all(cal[m] == v for m in VERANO_DE_SEGUNDA)
    assert cal[4] == BARBECHO  # mayo, entre la cosecha del verano y la siembra del invierno


def test_verano_de_2a_lo_dice_y_corre_la_floracion(ind):
    actual = _col(_correr(ind, verano="maiz", invierno="trigo"), "actual")
    assert any("maíz de 2ª de diciembre a abril" in x and "junio a noviembre" in x for x in actual["por_que"])
    assert floracion("maiz", calendario("maiz", "barbecho")) == [11, 0]   # diciembre y enero
    assert floracion("maiz", calendario("maiz", "trigo")) == [1, 2]       # sembrado en diciembre: febrero y marzo


@pytest.mark.parametrize("verano,secado,mes_siembra", [("soja", "octubre", "noviembre"), ("maiz", "septiembre", "octubre"),
                                                   ("girasol", "agosto", "septiembre")])
def test_la_cobertura_se_seca_un_mes_antes_de_la_siembra(ind, verano, secado, mes_siembra):
    cal = calendario(verano, "vicia")
    sv = siembra(verano, cal)
    assert cal[sv - 1] == BARBECHO and cal[sv - 2] == "vicia"
    a = _col(_correr(ind, verano=verano), "A")
    assert any(f"en {secado}, ~30 días antes de la siembra" in x and f"en {mes_siembra}" in x for x in a["revisar"])


@pytest.mark.parametrize("invierno,otro", [("trigo", "Cebada"), ("cebada", "Trigo")])
def test_b_no_repite_el_invierno_comercial_de_la_actual(ind, invierno, otro):
    for pesos in ({"agua": 3, "suelo": 3, "ingreso": 3, "erosion": 3}, {"agua": 5, "suelo": 3, "ingreso": 3, "erosion": 3}):
        r = _correr(ind, invierno=invierno, pesos=pesos)
        b = _col(r, "B")
        assert b["especies"] == f"{otro} + soja de 2ª"
        assert b["calendario"] != _col(r, "actual")["calendario"]
        assert f"tu rotación ya tiene {invierno}" in b["eleccion"]


def test_soja_de_2a_nombra_el_invierno_real(ind):
    b = _col(_correr(ind, no_sembrar=["trigo"]), "B")
    assert b["especies"] == "Cebada + soja de 2ª"
    assert any("efecto secante de la cebada antecesora" in x for x in b["revisar"])
    assert not any("trigo antecesor" in x for x in b["revisar"])
    b = _col(_correr(ind), "B")
    assert any("efecto secante del trigo antecesor" in x for x in b["revisar"])
