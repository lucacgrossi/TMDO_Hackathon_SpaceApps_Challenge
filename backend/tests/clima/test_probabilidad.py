"""Tests de clima/probabilidad.py (RF25). Sin red: usan la respuesta real de POWER del lote demo guardada."""

import json
import re
import unicodedata
from pathlib import Path

import pytest

from app.api.contrato import Probabilidad
from app.clima import indicadores as ind
from app.clima import probabilidad as pr
from app.clima.power import LAT_DEMO, LON_DEMO, SeriePower, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"
FUENTE = "NASA POWER mensual (comunidad AG) · ~50 km (0,5° × 0,625°) · 1995/96 a 2024/25"

CULTIVOS = {
    "soja": {"nombre": "Soja", "grupo": "verano", "tolera_helada": False},
    "soja2": {"nombre": "Soja 2ª", "grupo": "verano", "tolera_helada": False},
    "girasol": {"nombre": "Girasol", "grupo": "verano", "tolera_helada": False},
    "trigo": {"nombre": "Trigo", "grupo": "invierno", "tolera_helada": True},
    "vicia": {"nombre": "Vicia", "grupo": "cobertura", "tolera_helada": True},
    "barbecho": {"nombre": "Barbecho", "grupo": "barbecho", "tolera_helada": True},
}
SOJA_BARBECHO = pr.SOJA_BARBECHO
SOJA_VICIA = pr.SOJA_VICIA
# Girasol de septiembre a febrero (ventana del prototipo): septiembre tiene heladas en el lote demo.
GIRASOL = ["girasol"] * 2 + ["barbecho"] * 6 + ["girasol"] * 4
# Trigo de junio a noviembre + soja de segunda de diciembre a abril.
TRIGO_SOJA2 = ["soja2"] * 4 + ["barbecho"] + ["trigo"] * 6 + ["soja2"]


@pytest.fixture(scope="module")
def clima():
    serie = armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8")))
    return ind.calcular(serie, LAT_DEMO, LON_DEMO)


def _por_evento(probs, evento):
    return [p for p in probs if p.evento == evento]


# --- Formas y textos ---------------------------------------------------------


def test_soja_barbecho_lote_demo(clima):
    probs = pr.probabilidades(SOJA_BARBECHO, CULTIVOS, clima, SOJA_BARBECHO)
    assert [p.texto for p in probs] == [
        "Siembra de soja (noviembre) con menos de la mitad de la lluvia normal: 5 de 30 años (17 %)",
        "Máxima de 35 °C o más en enero con soja: 29 de 30 años (97 %)",
    ]
    assert all(isinstance(p, Probabilidad) for p in probs)
    assert all(p.fuente == FUENTE and p.de == 30 for p in probs)


def test_soja_vicia_primero_el_cultivo_nuevo(clima):
    probs = pr.probabilidades(SOJA_VICIA, CULTIVOS, clima, SOJA_BARBECHO)
    siembras = _por_evento(probs, "siembra_seca")
    assert [(p.cultivo, p.mes) for p in siembras] == [("vicia", 4), ("soja", 10)]
    assert siembras[0].texto == (
        "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)"
    )


def test_helada_con_cultivo_que_no_la_tolera(clima):
    probs = pr.probabilidades(GIRASOL, CULTIVOS, clima, SOJA_BARBECHO)
    helada = _por_evento(probs, "helada")
    assert len(helada) == 1
    h = helada[0]
    k = clima.clima_mensual.anios_con_helada[8]
    assert (h.mes, h.cultivo, h.anios, h.de) == (8, "girasol", k, 30)
    assert h.texto == f"Helada en septiembre con girasol en el lote: {k} de 30 años ({round(k / 30 * 100)} %)"
    assert probs[0].evento == "helada"  # orden: helada, siembra seca, calor


def test_helada_elige_el_mes_con_mas_anios(clima):
    # Soja todo el año (caso extremo): el mes con más heladas es julio (índice 6).
    probs = pr.probabilidades(["soja"] * 12, CULTIVOS, clima, SOJA_BARBECHO)
    fr = clima.clima_mensual.anios_con_helada
    h = _por_evento(probs, "helada")[0]
    assert h.mes == fr.index(max(fr)) == 6


def test_cultivos_que_toleran_helada_no_dan_helada(clima):
    probs = pr.probabilidades(TRIGO_SOJA2, CULTIVOS, clima, SOJA_BARBECHO)
    assert _por_evento(probs, "helada") == []


def test_nombres_y_meses_en_minuscula(clima):
    probs = pr.probabilidades(TRIGO_SOJA2, CULTIVOS, clima, SOJA_BARBECHO)
    textos = " ".join(p.texto for p in probs)
    assert "soja 2ª" in textos and "trigo" in textos
    assert not re.search(r"\b(Soja|Trigo|Junio|Diciembre|Enero)\b", textos)


def test_siembra_seca_hasta_dos_y_sin_repetir(clima):
    probs = pr.probabilidades(TRIGO_SOJA2, CULTIVOS, clima, SOJA_BARBECHO)
    siembras = _por_evento(probs, "siembra_seca")
    # Campaña julio → junio: trigo arranca en junio pero viene de mayo barbecho → siembra de trigo en junio;
    # soja 2ª arranca en diciembre. Ninguno está en la rotación actual: queda el orden de la campaña.
    assert [(p.cultivo, p.mes) for p in siembras] == [("soja2", 11), ("trigo", 5)]
    assert len({p.cultivo for p in siembras}) == len(siembras) <= 2


def test_meses_de_siembra_recorren_julio_a_junio():
    assert pr.meses_de_siembra(SOJA_VICIA) == [(10, "soja"), (4, "vicia")]
    # Un cultivo que ocupa todo el año no cambia nunca: no hay mes de siembra.
    assert pr.meses_de_siembra(["soja"] * 12) == []


# --- Conteo k contra un cálculo a mano --------------------------------------------


def test_k_de_siembra_seca_a_mano(clima):
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    pp = raw["properties"]["parameter"]["PRECTOTCORR_SUM"]
    # Noviembre de cada campaña 1995/96 … 2024/25 = noviembre de 1995 … 2024.
    noviembres = [pp[f"{anio}11"] for anio in range(1995, 2025)]
    media = sum(noviembres) / 30
    k = sum(1 for v in noviembres if v < 0.5 * media)
    p = _por_evento(pr.probabilidades(SOJA_BARBECHO, CULTIVOS, clima, SOJA_BARBECHO), "siembra_seca")[0]
    assert (p.mes, p.anios, p.pct) == (10, k, round(k / 30 * 100))


def test_k_de_calor_a_mano(clima):
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    tx = raw["properties"]["parameter"]["T2M_MAX"]
    enero = [tx[f"{anio}01"] for anio in range(1996, 2026)]
    k = sum(1 for v in enero if v >= 35)
    p = _por_evento(pr.probabilidades(SOJA_BARBECHO, CULTIVOS, clima, SOJA_BARBECHO), "calor")[0]
    assert (p.mes, p.cultivo, p.anios) == (0, "soja", k)


def test_pct_redondea_como_el_prototipo():
    assert pr._pct(1, 2) == 50
    assert pr._pct(1, 40) == 3  # 2,5 → 3 (Math.round), no 2 (round de Python)
    assert pr._pct(14, 30) == 47


# --- Barbecho y casos borde -----------------------------------------------------


def test_barbecho_no_cuenta(clima):
    assert pr.probabilidades(["barbecho"] * 12, CULTIVOS, clima, SOJA_BARBECHO) == []
    # Barbecho en los meses de helada: no hay helada aunque julio tenga 26 de 30 años.
    assert _por_evento(pr.probabilidades(SOJA_BARBECHO, CULTIVOS, clima, SOJA_BARBECHO), "helada") == []


def test_calor_solo_cultivos_de_verano(clima):
    trigo = ["barbecho"] * 5 + ["trigo"] * 6 + ["barbecho"]
    assert _por_evento(pr.probabilidades(trigo, CULTIVOS, clima, SOJA_BARBECHO), "calor") == []


def test_clima_caido_devuelve_lista_vacia():
    caido = ind.calcular(SeriePower(ok=False, motivo="sin conexión"), LAT_DEMO, LON_DEMO)
    assert pr.probabilidades(SOJA_BARBECHO, CULTIVOS, caido, SOJA_BARBECHO) == []


def test_entradas_raras_no_lanzan(clima):
    assert pr.probabilidades(["soja"] * 5, CULTIVOS, clima, SOJA_BARBECHO) == []
    assert pr.probabilidades(SOJA_BARBECHO, {}, clima, SOJA_BARBECHO) == []
    assert pr.probabilidades(["desconocido"] * 12, CULTIVOS, clima, []) == []
    assert pr.probabilidades(SOJA_BARBECHO, CULTIVOS, clima, None) != []


# --- Lenguaje -------------------------------------------------------------------


def _normalizar(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn").lower()


@pytest.mark.parametrize("cal", [SOJA_BARBECHO, SOJA_VICIA, GIRASOL, TRIGO_SOJA2, ["soja"] * 12])
def test_sin_lenguaje_prohibido_y_con_conteo(clima, cal):
    for p in pr.probabilidades(cal, CULTIVOS, clima, SOJA_BARBECHO):
        t = _normalizar(p.texto)
        assert not re.search(r"\b(recomendamos|deberias|la mejor)\b", t)
        assert f"{p.anios} de {p.de} anos ({p.pct} %)" in t
