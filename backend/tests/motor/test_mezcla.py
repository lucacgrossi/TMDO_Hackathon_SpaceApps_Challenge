import copy

import pytest

from app.motor import mezcla
from tests.motor.conftest import IND, entradas

ULTIMAS_6 = ["2020/21", "2021/22", "2022/23", "2023/24", "2024/25", "2025/26"]


def _nasa(campana: str) -> dict:
    return next(c for c in IND["campanas_nasa"] if c["campana"] == campana)


def _planilla(campanas: list[str], lluvia=lambda m, v: 0.8 * v, t_min=None, t_max=None) -> list[dict]:
    """Planilla mensual del productor sobre esas campañas, armada desde NASA del mismo período."""
    filas = []
    for c in campanas:
        n, y = _nasa(c), int(c[:4])
        for m in range(12):
            filas.append({"mes": f"{y + 1 if m < 6 else y}-{m + 1:02d}", "lluvia_mm": lluvia(m, n["lluvia_mm"][m]),
                          "t_min_c": t_min(m, n["t_min_c"][m]) if t_min else n["t_min_c"][m],
                          "t_max_c": t_max(m, n["t_max_c"][m]) if t_max else n["t_max_c"][m]})
    return filas


def _media_nasa(campanas: list[str]) -> float:
    return sum(sum(_nasa(c)["lluvia_mm"]) for c in campanas) / len(campanas)


@pytest.mark.parametrize("anios, peso", [(None, 0), (0, 0), (1, 0.40), (2, 0.40), (3, 0.50), (5, 0.60),
                                         (9, 0.60), (10, 0.75), (25, 0.75)])
def test_peso_del_productor_crece_con_los_anios(anios, peso):
    assert mezcla.peso_productor(anios) == peso


def test_sin_mediciones_es_igual_a_nasa(ind):
    c = mezcla.mezclar(entradas(), ind)
    assert not c["hay_productor"] and c["datos"] == [] and c["diferencia_lluvia_pct"] is None
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx(ind["terciles"][t]["pp"])
    assert c["helada"] == pytest.approx([h / 30 for h in ind["anios_con_helada"]])


# --- #64: el mismo período que el contraste ----------------------------------


def test_lote_demo_planilla_al_80_usa_la_diferencia_del_contraste(ind):
    # 6 campañas (2020/21 a 2025/26) al 80 % de NASA: el contraste da 589 contra 736 mm (−20 %).
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": _planilla(ULTIMAS_6)}), ind)
    assert c["periodo_comparado"]["lluvia"] == ULTIMAS_6
    assert c["diferencia_lluvia_pct"] == -20  # no −28 (contra el promedio de las 30)
    assert c["pesos"]["lluvia"] == 0.60
    # El −20 % se aplica a las 30 campañas: pp × (0,6·0,8 + 0,4) en los tres tipos de año.
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx([p * 0.88 for p in ind["terciles"][t]["pp"]])
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * 0.88)
    texto = c["datos"][0]
    assert ("Lluvia: tu registro 589 mm/año (60 %, 6 años) contra NASA POWER en las mismas 6 campañas "
            "(2020/21 a 2025/26) 736 mm (−20 %)") in texto
    assert texto.endswith(f"{c['lluvia_mm']:.0f} mm/año para las reglas")


def test_la_diferencia_es_la_misma_cuenta_que_el_contraste(ind):
    # Productor con otra estacionalidad: más lluvia en verano, menos en invierno.
    campanas = ["2015/16", "2016/17", "2017/18", "2018/19"]
    serie = _planilla(campanas, lluvia=lambda m, v: v * (1.2 if m in (0, 1, 2, 10, 11) else 0.7))
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    prod = sum(f["lluvia_mm"] for f in serie) / len(campanas)
    vn = _media_nasa(campanas)
    assert c["diferencia_lluvia_pct"] == round((prod - vn) / vn * 100)  # fórmula de clima/correccion.py
    # Sobre las mismas campañas, los factores por mes reproducen exactamente la lluvia del productor.
    f = [(c["terciles"]["seco"]["pp"][m] / c["terciles"]["seco"]["pp_nasa"][m] - 0.5) / 0.5 for m in range(12)]
    n_mes = [sum(_nasa(x)["lluvia_mm"][m] for x in campanas) / len(campanas) for m in range(12)]
    assert sum(n_mes[m] * f[m] for m in range(12)) == pytest.approx(prod)


def test_planilla_con_campanas_fuera_de_nasa_usa_solo_las_comunes(ind):
    serie = _planilla(ULTIMAS_6) + [{"mes": f"2026-{m:02d}", "lluvia_mm": 500.0} for m in range(7, 13)]
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    assert c["periodo_comparado"]["lluvia"] == ULTIMAS_6 and c["diferencia_lluvia_pct"] == -20


def test_lluvia_anual_contra_las_ultimas_n_campanas(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 650, "anios_registro": 6}), ind)
    vn = _media_nasa(ULTIMAS_6)  # 736 mm, no los 819 de las 30
    assert c["periodo_comparado"]["lluvia"] == ULTIMAS_6
    assert c["diferencia_lluvia_pct"] == round((650 - vn) / vn * 100) == -12
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (0.6 * 650 / vn + 0.4), rel=1e-6)
    assert ("tu pluviómetro 650 mm/año (60 %, 6 años) contra NASA POWER en las últimas 6 campañas "
            "(2020/21 a 2025/26) 736 mm (−12 %)") in c["datos"][0]


def test_lluvia_anual_con_mas_anios_que_nasa_usa_las_30(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 800, "anios_registro": 40}), ind)
    assert len(c["periodo_comparado"]["lluvia"]) == 30 and c["pesos"]["lluvia"] == 0.75
    assert "en las últimas 30 campañas (1996/97 a 2025/26)" in c["datos"][0]


def test_factor_extremo_se_limita(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 5000, "anios_registro": 10}), ind)
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (0.75 * mezcla.FACTOR_MAX + 0.25), rel=1e-3)


def test_heladas_y_calor_en_las_mismas_campanas(ind):
    # La estación ve helada en mayo y 35 °C o más en diciembre en las 6 campañas.
    serie = _planilla(ULTIMAS_6, t_min=lambda m, v: -2.0 if m == 4 else v,
                      t_max=lambda m, v: 37.0 if m == 11 else v)
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    nk_mayo = sum(1 for x in ULTIMAS_6 if _nasa(x)["t_min_c"][4] < 0)
    nk_dic = sum(1 for x in ULTIMAS_6 if _nasa(x)["t_max_c"][11] >= 35)
    assert c["periodo_comparado"]["helada"] == c["periodo_comparado"]["calor"] == ULTIMAS_6
    assert c["helada"][4] == pytest.approx(8 / 30 + 0.6 * (6 - nk_mayo) / 6)
    assert c["calor"][11] == pytest.approx(min(1.0, 26 / 30 + 0.6 * (6 - nk_dic) / 6))
    # Los meses donde coinciden con NASA en las mismas campañas quedan como NASA de las 30.
    assert c["helada"][6] == pytest.approx(26 / 30) and c["calor"][0] == pytest.approx(29 / 30)
    assert any("Heladas: tu estación" in d and "mismas 6 campañas" in d and "mayo" in d for d in c["datos"])


def test_terciles_y_probabilidades_de_nasa_no_cambian(ind):
    antes = copy.deepcopy(ind)
    serie = _planilla(ULTIMAS_6, t_min=lambda m, v: -2.0 if m == 4 else v)
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    assert ind == antes  # los indicadores de NASA (y lo que sale de ellos) no se tocan
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp_nasa"] == ind["terciles"][t]["pp"]
        assert c["terciles"][t]["n"] == ind["terciles"][t]["n"] == 10
        assert c["terciles"][t]["et0"] == ind["terciles"][t]["et0"]


# --- Sin NASA campaña por campaña: como antes de #64 --------------------------


def test_sin_campanas_nasa_la_planilla_va_contra_las_30_y_lo_dice(ind_sin_campanas):
    ind = ind_sin_campanas
    serie = _planilla(ULTIMAS_6)
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    nasa_mes = mezcla._nasa_mensual(ind["terciles"])
    por_mes = mezcla._por_mes(serie, "lluvia_mm")
    factores = [mezcla._limitar(sum(v) / len(v) / nasa_mes[m]) for m, v in enumerate(por_mes)]
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx(
            [p * (0.6 * factores[m] + 0.4) for m, p in enumerate(ind["terciles"][t]["pp"])])
    assert c["periodo_comparado"]["lluvia"] == [] and c["diferencia_lluvia_pct"] == -28
    assert mezcla.SIN_CAMPANAS in c["datos"][0]


def test_sin_campanas_nasa_el_anual_va_contra_las_30(ind_sin_campanas):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 650, "anios_registro": 6}), ind_sin_campanas)
    assert c["lluvia_mm"] == pytest.approx(0.6 * 650 + 0.4 * c["lluvia_nasa_mm"], rel=1e-3)
    assert "tu pluviómetro 650 mm/año (60 %, 6 años)" in c["datos"][0] and mezcla.SIN_CAMPANAS in c["datos"][0]


def test_sin_campanas_nasa_las_heladas_van_contra_las_30(ind_sin_campanas):
    serie = _planilla(ULTIMAS_6, t_min=lambda m, v: -2.0 if m == 4 else 5.0)
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind_sin_campanas)
    assert c["pesos"]["helada"] == 0.60 and c["anios"]["helada"] == 6
    assert c["helada"][4] == pytest.approx(0.6 * 1 + 0.4 * 8 / 30)
    assert any("Heladas: tu estación" in d and mezcla.SIN_CAMPANAS in d for d in c["datos"])


def test_planilla_sin_campanas_en_comun_va_contra_las_30_y_lo_dice(ind):
    serie = [{"mes": f"{a}-{m:02d}", "lluvia_mm": 50.0} for a in range(1980, 1984) for m in range(1, 13)]
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    assert c["pesos"]["lluvia"] == 0.50 and c["periodo_comparado"]["lluvia"] == []
    assert mezcla.SIN_COMUNES in c["datos"][0]


# --- Entradas raras: nunca lanza ----------------------------------------------


def test_serie_mensual_manda_sobre_el_anual(ind):
    med = {"serie_mensual": _planilla(ULTIMAS_6[:4], lluvia=lambda m, v: 40.0), "lluvia_anual_mm": 2000,
           "anios_registro": 10}
    c = mezcla.mezclar(entradas(mediciones=med), ind)
    assert c["pesos"]["lluvia"] == 0.50  # 4 años de la serie, no los 10 del anual


def test_serie_rota_no_lanza(ind):
    med = {"serie_mensual": [{"mes": "x"}, {"mes": "2020-13", "lluvia_mm": 1}, {"mes": "2020-01", "lluvia_mm": "nan"}]}
    c = mezcla.mezclar(entradas(mediciones=med), ind)
    assert not c["hay_productor"]


def test_campanas_nasa_rotas_no_lanzan(ind):
    ind["campanas_nasa"] = [None, {"campana": "2020/21", "lluvia_mm": [1, 2]}, {"lluvia_mm": [1] * 12},
                            {"campana": "2021/22", "lluvia_mm": ["x"] * 12}]
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": _planilla(ULTIMAS_6)}), ind)
    assert c["periodo_comparado"]["lluvia"] == [] and mezcla.SIN_CAMPANAS in c["datos"][0]
