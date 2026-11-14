import re

from app.motor import plantillas, reglas
from tests.motor.conftest import entradas

DIMS = ("agua", "suelo", "erosion", "ingreso")


def _correr(ind, **cambios):
    e = entradas(**cambios)
    return plantillas.armar(reglas.analizar(e, ind), e, ind)


def _col(r, i):
    return next(s for s in r["estrategias"] if s["id"] == i)


def test_siempre_4_columnas_con_puntajes(ind):
    r = _correr(ind)
    assert [s["id"] for s in r["estrategias"]] == ["actual", "A", "B", "C"]
    for s in r["estrategias"]:
        assert s["on"] and len(s["calendario"]) == 12
        assert set(s["agua_por_tipo"]) == {"seco", "normal", "humedo"}
        assert all(0 <= v <= 100 for v in [*s["agua_por_tipo"].values(), s["suelo"], s["erosion"], s["ingreso"]])
        assert s["aportes"] and all({"regla", "efecto", "dato"} <= a.keys() for a in s["aportes"])
        assert s["por_que"] and s["evidencia"] and s["falta"] is not None


def test_lote_demo_valores_razonables(ind):
    r = _correr(ind)
    actual, a = _col(r, "actual"), _col(r, "A")
    assert actual["meses_pelados"] == 6 and a["meses_pelados"] == 1
    assert a["suelo"] > actual["suelo"] and a["erosion"] > actual["erosion"]
    assert actual["agua_por_tipo"]["seco"] < actual["agua_por_tipo"]["normal"] < actual["agua_por_tipo"]["humedo"]
    assert _col(r, "C")["especies"].startswith("Sorgo")


def test_no_sembrar_descarta_con_motivo(ind):
    r = _correr(ind, no_sembrar=["vicia", "centeno"])
    a = _col(r, "A")
    assert a["on"] is False and a["motivo"] == "No sembrar vicia ni centeno"
    assert a["resumen"].startswith("Descartada") and "agua_por_tipo" not in a


def test_prioridades_eligen_especies(ind):
    assert _col(_correr(ind), "B")["especies"].startswith("Trigo")
    assert _col(_correr(ind, pesos={"agua": 5, "suelo": 3, "ingreso": 3, "erosion": 3}), "B")["especies"].startswith("Cebada")
    assert _col(_correr(ind, pesos={"agua": 1, "suelo": 3, "ingreso": 3, "erosion": 5}), "A")["especies"].endswith("centeno")


def test_prioridades_cambian_la_cercania_al_cuadrado(ind):
    suelo = _correr(ind, pesos={"agua": 1, "suelo": 5, "ingreso": 1, "erosion": 1})
    ingreso = _correr(ind, pesos={"agua": 1, "suelo": 1, "ingreso": 5, "erosion": 1})
    a_suelo, a_ingreso = _col(suelo, "A"), _col(ingreso, "A")
    assert a_suelo["cercania"] > a_ingreso["cercania"]
    v = reglas.valores(a_suelo)
    esperado = round((v["agua"] + 25 * v["suelo"] + v["ingreso"] + v["erosion"]) / 28)
    assert a_suelo["cercania"] == esperado


def test_prioridades_van_de_1_a_5(ind):
    # Un 0 (o un valor fuera de rango) se lleva a 1: ningún objetivo queda afuera.
    cero = _correr(ind, pesos={"agua": 0, "suelo": 0, "ingreso": 5, "erosion": 0})
    uno = _correr(ind, pesos={"agua": 1, "suelo": 1, "ingreso": 5, "erosion": 1})
    assert _col(cero, "actual")["cercania"] == _col(uno, "actual")["cercania"]
    v = reglas.valores(_col(uno, "actual"))
    assert _col(uno, "actual")["cercania"] == round((v["agua"] + v["suelo"] + 25 * v["ingreso"] + v["erosion"]) / 28)
    assert reglas.prioridad({"agua": 9}, "agua") == 5 and reglas.prioridad({}, "agua") == 3


def test_lluvia_del_productor_cambia_agua_y_erosion(ind):
    nasa = _correr(ind)
    prod = _correr(ind, mediciones={"lluvia_anual_mm": 650, "anios_registro": 6})
    a_n, a_p = _col(nasa, "actual"), _col(prod, "actual")
    assert a_p["agua_por_tipo"]["seco"] < a_n["agua_por_tipo"]["seco"]
    assert a_p["erosion"] != a_n["erosion"]
    assert a_p["agua_nasa_mm"]["seco"] == a_n["agua_mm"]["seco"]["balance"]
    assert any("Con tus mediciones" in x for x in a_p["evidencia"])
    assert any("tu pluviómetro 650 mm/año" in x for x in a_p["evidencia"])


def test_temperaturas_del_productor_cambian_el_ingreso(ind):
    filas = [{"mes": f"{a}-{m:02d}", "t_min_c": 5.0, "t_max_c": 38.0 if m in (1, 2) else 30.0}
             for a in range(2016, 2026) for m in range(1, 13)]
    nasa = _correr(ind)
    prod = _correr(ind, mediciones={"serie_mensual": filas})
    assert _col(prod, "actual")["ingreso"] < _col(nasa, "actual")["ingreso"]


def test_sin_et0_no_lanza_y_lo_dice(ind):
    for t in ind["terciles"].values():
        t["et0"] = None
    r = _correr(ind)
    assert all("agua_por_tipo" in s for s in r["estrategias"])
    assert any("ET0" in f for f in _col(r, "actual")["falta"])


def test_sin_pendiente_usa_defecto_y_lo_dice(ind):
    ind["pendiente_pct"] = None
    r = _correr(ind)
    assert r["pendiente_real"] is False
    assert any("Pendiente del lote" in f for f in _col(r, "actual")["falta"])


def test_rf14_satelite_contra_calendario(ind):
    assert any("Lo que vio el satélite" in x for x in _col(_correr(ind), "actual")["revisar"])
    ind["visto_satelite"]["meses_pelados"] = 6
    assert not any("Lo que vio el satélite" in x for x in _col(_correr(ind), "actual")["revisar"])


def test_choque_de_objetivos(ind):
    r = _correr(ind, pesos={"agua": 5, "suelo": 4, "ingreso": 1, "erosion": 1})
    ch = r["choque"]
    assert set(ch) >= {"hay", "objetivos", "texto"}
    if ch["hay"]:
        assert "chocan en este lote" in ch["texto"] and "Ninguna cumple las dos" in ch["texto"]


def test_anegable_castiga_agua_en_anios_humedos(ind):
    r_no, r_si = _correr(ind, anegable="no"), _correr(ind, anegable="si")
    c_no, c_si = _col(r_no, "C"), _col(r_si, "C")
    assert c_si["agua_por_tipo"]["humedo"] < c_no["agua_por_tipo"]["humedo"]
    assert c_si["agua_por_tipo"]["seco"] == c_no["agua_por_tipo"]["seco"]


def test_textos_sin_lenguaje_prohibido(ind):
    prohibido = re.compile(r"recomend|deber[ií]as|la mejor", re.IGNORECASE)
    for kwargs in ({}, {"no_sembrar": ["sorgo", "girasol"]}, {"pesos": {"agua": 5, "suelo": 4, "ingreso": 1, "erosion": 1}},
                   {"mediciones": {"lluvia_anual_mm": 650, "anios_registro": 2}}):
        r = _correr(ind, **kwargs)
        textos = [r["choque"]["texto"]]
        for s in r["estrategias"]:
            textos += [s["resumen"], *s["por_que"], *s["evidencia"], *s["beneficios"], *s["revisar"], *s["falta"]]
        assert not [t for t in textos if prohibido.search(t)]
