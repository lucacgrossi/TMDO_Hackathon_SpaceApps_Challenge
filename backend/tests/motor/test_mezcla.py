import pytest

from app.motor import mezcla
from tests.motor.conftest import entradas


@pytest.mark.parametrize("anios, peso", [(None, 0), (0, 0), (1, 0.40), (2, 0.40), (3, 0.50), (5, 0.60),
                                         (9, 0.60), (10, 0.75), (25, 0.75)])
def test_peso_del_productor_crece_con_los_anios(anios, peso):
    assert mezcla.peso_productor(anios) == peso


def test_sin_mediciones_es_igual_a_nasa(ind):
    c = mezcla.mezclar(entradas(), ind)
    assert not c["hay_productor"] and c["datos"] == []
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx(ind["terciles"][t]["pp"])
    assert c["helada"] == pytest.approx([h / 30 for h in ind["anios_con_helada"]])


def test_pluviometro_anual_pesa_mas_que_nasa_con_6_anios(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 650, "anios_registro": 6}), ind)
    assert c["pesos"]["lluvia"] == 0.60
    nasa = c["lluvia_nasa_mm"]
    # 60 % del productor + 40 % de NASA.
    assert c["lluvia_mm"] == pytest.approx(0.6 * 650 + 0.4 * nasa, rel=1e-3)
    assert "tu pluviómetro 650 mm/año (60 %, 6 años)" in c["datos"][0]


def test_factor_extremo_se_limita(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 5000, "anios_registro": 10}), ind)
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (0.75 * mezcla.FACTOR_MAX + 0.25), rel=1e-3)


def _serie(anios: int, t_min_mayo: float, lluvia: float = 50.0) -> list[dict]:
    filas = []
    for a in range(2018, 2018 + anios):
        for m in range(1, 13):
            fila = {"mes": f"{a}-{m:02d}", "lluvia_mm": lluvia, "t_min_c": 5.0, "t_max_c": 30.0}
            if m == 5:
                fila["t_min_c"] = t_min_mayo
            filas.append(fila)
    return filas


def test_serie_con_heladas_que_nasa_no_ve(ind):
    # Mayo: NASA 8 de 30 años con helada (27 %); la estación del productor, todos los años.
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": _serie(6, -2.0)}), ind)
    assert c["pesos"]["helada"] == 0.60 and c["anios"]["helada"] == 6
    assert c["helada"][4] == pytest.approx(0.6 * 1 + 0.4 * 8 / 30)
    assert any("Heladas: tu estación" in d and "mayo" in d for d in c["datos"])


def test_serie_mensual_manda_sobre_el_anual(ind):
    med = {"serie_mensual": _serie(4, 5.0, lluvia=40.0), "lluvia_anual_mm": 2000, "anios_registro": 10}
    c = mezcla.mezclar(entradas(mediciones=med), ind)
    assert c["pesos"]["lluvia"] == 0.50  # 4 años de la serie, no los 10 del anual


def test_serie_rota_no_lanza(ind):
    med = {"serie_mensual": [{"mes": "x"}, {"mes": "2020-13", "lluvia_mm": 1}, {"mes": "2020-01", "lluvia_mm": "nan"}]}
    c = mezcla.mezclar(entradas(mediciones=med), ind)
    assert not c["hay_productor"]
