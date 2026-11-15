import copy
import re

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
    assert ("Lluvia: tu registro 589 mm/año (60 %, 6 campañas) contra NASA POWER en las mismas 6 campañas "
            "(2020/21 a 2025/26) 736 mm (−20 %)") in texto
    assert texto.endswith(f"{c['lluvia_mm']:.0f} mm/año para las reglas")


def test_la_diferencia_es_la_misma_cuenta_que_el_contraste(ind):
    # Productor con otra estacionalidad: más lluvia en verano, menos en invierno.
    campanas = ["2015/16", "2016/17", "2017/18", "2018/19"]
    serie = _planilla(campanas, lluvia=lambda m, v: v * (1.2 if m in (0, 1, 2, 10, 11) else 0.7))
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    prod = sum(f["lluvia_mm"] for f in serie) / len(campanas)
    vn = _media_nasa(campanas)
    d = c["diferencia_lluvia_pct"]
    assert d == round((prod - vn) / vn * 100)  # fórmula de clima/correccion.py
    # Un solo factor anual (el % del texto) para los 12 meses y los 3 tipos de año.
    ajuste = 0.5 * (1 + d / 100) + 0.5
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx([p * ajuste for p in ind["terciles"][t]["pp"]])
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * ajuste)


def _cuenta_del_texto(texto: str) -> tuple[int, int, int, int]:
    """(NASA de las 30, diferencia %, peso %, valor de las reglas) tal como los lee el productor."""
    m = re.search(r"NASA de las 30 campañas \((\d+) mm\) con ese ([−+]?)(\d+) % al (\d+) %: (\d+) mm/año para "
                  r"las reglas", texto)
    assert m, texto
    signo = -1 if m.group(2) == "−" else 1
    return int(m.group(1)), signo * int(m.group(3)), int(m.group(4)), int(m.group(5))


def _planilla_otra_estacionalidad(campanas: list[str], x: float) -> list[dict]:
    """Planilla con X veces la lluvia anual de NASA, pero con el invierno al triple (factor por mes > 1,5)."""
    invierno = (4, 5, 6, 7)
    inv = sum(_nasa(c)["lluvia_mm"][m] for c in campanas for m in invierno) / len(campanas)
    total = _media_nasa(campanas)
    k = (x * total - 3 * inv) / (total - inv)
    assert k > 0
    return _planilla(campanas, lluvia=lambda m, v: v * (3 if m in invierno else k))


# --- H-001: con planilla, el valor de las reglas es la cuenta del texto ---------

DOCE = ["2013/14", "2014/15", "2015/16", "2016/17", "2017/18", "2018/19", "2019/20", "2020/21", "2021/22",
        "2022/23", "2023/24", "2024/25"]


@pytest.mark.parametrize("campanas", [["2024/25"], ULTIMAS_6[:3], ULTIMAS_6, DOCE])
@pytest.mark.parametrize("x", [0.84, 0.95])
def test_productor_mide_menos_el_valor_de_las_reglas_baja_y_cierra_con_el_texto(ind, campanas, x):
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": _planilla_otra_estacionalidad(campanas, x)}), ind)
    d, w = c["diferencia_lluvia_pct"], c["pesos"]["lluvia"]
    assert d == round((x - 1) * 100) < 0
    assert c["lluvia_mm"] < c["lluvia_nasa_mm"]
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (1 + w * d / 100))
    nasa30, d_txt, w_txt, valor = _cuenta_del_texto(c["datos"][0])
    assert (d_txt, w_txt, valor) == (d, round(w * 100), round(c["lluvia_mm"]))
    assert abs(nasa30 * (1 + w_txt / 100 * d_txt / 100) - valor) <= 1  # la cuenta se rehace con lo que se lee


def test_productor_mide_mas_el_valor_de_las_reglas_sube(ind):
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": _planilla_otra_estacionalidad(ULTIMAS_6, 1.1)}), ind)
    assert c["diferencia_lluvia_pct"] == 10
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (1 + 0.6 * 0.10))
    assert c["lluvia_mm"] > c["lluvia_nasa_mm"]


# --- H-007: los años de registro son campañas completas -----------------------


def test_anios_de_registro_son_campanas_completas_no_anios_calendario(ind):
    # Enero de 2022 a diciembre de 2024: 3 años calendario, 2 campañas completas (2022/23 y 2023/24).
    serie = [{"mes": f"{a}-{m:02d}", "lluvia_mm": 60.0, "t_min_c": -1.0 if m == 7 else 5.0, "t_max_c": 30.0}
             for a in (2022, 2023, 2024) for m in range(1, 13)]
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    assert c["periodo_comparado"]["lluvia"] == ["2022/23", "2023/24"]
    assert c["anios"] == {"lluvia": 2, "helada": 2, "calor": 2}
    assert c["pesos"] == {"lluvia": 0.40, "helada": 0.40, "calor": 0.40}  # no 50 % (3 años calendario)
    assert "(40 %, 2 campañas) contra NASA POWER en las mismas 2 campañas (2022/23 a 2023/24)" in c["datos"][0]


def test_planilla_sin_ninguna_campana_completa_no_entra_y_lo_dice(ind):
    serie = [{"mes": f"2024-{m:02d}", "lluvia_mm": 60.0, "t_min_c": -3.0} for m in range(1, 9)]
    med = {"serie_mensual": serie, "lluvia_anual_mm": 2000, "anios_registro": 10}
    c = mezcla.mezclar(entradas(mediciones=med), ind)
    assert not c["hay_productor"] and c["pesos"]["lluvia"] == 0 and c["anios"]["lluvia"] == 0
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"])  # tampoco usa la lluvia anual: manda la planilla
    assert mezcla.SIN_CAMPANA_COMPLETA in c["datos"][0] and "no entra en las reglas" in c["datos"][0]
    assert c["helada"] == pytest.approx([h / 30 for h in ind["anios_con_helada"]])


def test_planilla_con_campanas_fuera_de_nasa_usa_solo_las_comunes(ind):
    serie = _planilla(ULTIMAS_6) + [{"mes": f"2026-{m:02d}", "lluvia_mm": 500.0} for m in range(7, 13)]
    c = mezcla.mezclar(entradas(mediciones={"serie_mensual": serie}), ind)
    assert c["periodo_comparado"]["lluvia"] == ULTIMAS_6 and c["diferencia_lluvia_pct"] == -20


def test_lluvia_anual_contra_las_ultimas_n_campanas(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 650, "anios_registro": 6}), ind)
    vn = _media_nasa(ULTIMAS_6)  # 736 mm, no los 819 de las 30
    assert c["periodo_comparado"]["lluvia"] == ULTIMAS_6
    assert c["diferencia_lluvia_pct"] == round((650 - vn) / vn * 100) == -12
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (1 - 0.6 * 0.12))
    assert ("tu pluviómetro 650 mm/año (60 %, 6 años) contra NASA POWER en las últimas 6 campañas "
            "(2020/21 a 2025/26) 736 mm (−12 %) → NASA de las 30 campañas (819 mm) con ese −12 % al 60 %: "
            f"{c['lluvia_mm']:.0f} mm/año para las reglas") in c["datos"][0]


def test_lluvia_anual_de_un_anio_contra_la_ultima_campana(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 790, "anios_registro": 1}), ind)
    assert c["periodo_comparado"]["lluvia"] == ["2025/26"] and c["diferencia_lluvia_pct"] == 31
    assert "contra NASA POWER en la última campaña (2025/26) 601 mm (+31 %)" in c["datos"][0]


def test_lluvia_anual_sin_anios_va_contra_las_30_y_lo_dice(ind):
    # H-006: sin años de registro no se sabe qué período cubre: contra el promedio de las 30, como el contraste.
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 700}), ind)
    assert c["periodo_comparado"]["lluvia"] == [] and c["pesos"]["lluvia"] == 0.40 and c["anios"]["lluvia"] == 0
    assert c["diferencia_lluvia_pct"] == round((700 - c["lluvia_nasa_mm"]) / c["lluvia_nasa_mm"] * 100) == -15
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (1 - 0.4 * 0.15))
    assert c["lluvia_mm"] < c["lluvia_nasa_mm"]
    assert mezcla.SIN_ANIOS in c["datos"][0]


def test_lluvia_anual_con_mas_anios_que_nasa_usa_las_30(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 800, "anios_registro": 40}), ind)
    assert len(c["periodo_comparado"]["lluvia"]) == 30 and c["pesos"]["lluvia"] == 0.75
    assert "en las últimas 30 campañas (1996/97 a 2025/26)" in c["datos"][0]


def test_factor_extremo_se_limita_y_la_evidencia_lo_dice(ind):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 5000, "anios_registro": 10}), ind)
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (0.75 * mezcla.FACTOR_MAX + 0.25))
    assert c["lluvia_limitada"] and "limitado a +50 %" in c["datos"][0]
    assert c["datos"][0].endswith(f"al 75 %: {c['lluvia_mm']:.0f} mm/año para las reglas")
    normal = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 700, "anios_registro": 10}), ind)
    assert not normal["lluvia_limitada"] and "limitado" not in normal["datos"][0]


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
    assert c["periodo_comparado"]["lluvia"] == [] and c["diferencia_lluvia_pct"] == -28
    for t in mezcla.TIPOS:
        assert c["terciles"][t]["pp"] == pytest.approx([p * (0.6 * 0.72 + 0.4) for p in ind["terciles"][t]["pp"]])
    assert mezcla.SIN_CAMPANAS in c["datos"][0]


def test_sin_campanas_nasa_el_anual_va_contra_las_30(ind_sin_campanas):
    c = mezcla.mezclar(entradas(mediciones={"lluvia_anual_mm": 650, "anios_registro": 6}), ind_sin_campanas)
    assert c["diferencia_lluvia_pct"] == -21
    assert c["lluvia_mm"] == pytest.approx(c["lluvia_nasa_mm"] * (1 - 0.6 * 0.21))
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
