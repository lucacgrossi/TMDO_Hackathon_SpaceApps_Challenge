"""Tests de clima/correccion.py (RF15). Sin red: usan la respuesta real de POWER del lote demo guardada."""

import json
import re
import unicodedata
from pathlib import Path

import pytest

from app.api.contrato import MedicionesPropias, Salida
from app.clima import correccion as corr
from app.clima.indicadores import calcular
from app.clima.power import LAT_DEMO, LON_DEMO, SeriePower, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"


@pytest.fixture(scope="module")
def clima():
    return calcular(armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8"))), LAT_DEMO, LON_DEMO)


@pytest.fixture(scope="module")
def clima_caido():
    return calcular(SeriePower(ok=False, motivo="NASA POWER no respondió (timeout)."), LAT_DEMO, LON_DEMO)


def test_lote_demo_650_mm_difiere_21_pct_y_baja_la_confianza(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650, anios_registro=10), clima)
    assert len(r.contraste) == 1
    c = r.contraste[0]
    assert c.indicador == "lluvia_anual"
    assert c.valor_nasa == clima.indicadores["lluvia_anual"].valor == 824
    assert c.diferencia_pct == -21
    assert c.confianza_resultante == "baja"
    assert r.confianza_agua == "baja"
    assert c.texto == "Tu pluviómetro: 650 mm/año · NASA: 824 mm (−21 %) · difieren más de 15 %: confianza baja en agua"
    assert len(r.riesgos) == 1 and "difiere 21 % de NASA" in r.riesgos[0]
    assert r.faltantes == []


def test_corregido_al_lado_usa_la_lluvia_del_tercio_seco_si_el_corte_es_por_balance(clima):
    assert clima.tipos_de_anio.metodo == "terciles_balance"
    c = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650), clima).contraste[0]
    lluvia_seca = max(x.lluvia_total_mm for x in clima.campanas if x.tipo == "seco")
    assert c.corregido_al_lado.umbral_seco_mm == pytest.approx(lluvia_seca * 650 / 824, abs=0.1)
    assert "balance" in c.corregido_al_lado.nota
    assert "no cambia ningún puntaje" in c.corregido_al_lado.nota


def test_corregido_al_lado_escala_el_umbral_si_el_corte_es_por_lluvia(clima):
    por_lluvia = clima.tipos_de_anio.model_copy(update={"metodo": "terciles_lluvia", "umbral_seco_mm": 700.0})
    c = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650),
                        clima.__class__(**{**clima.__dict__, "tipos_de_anio": por_lluvia})).contraste[0]
    assert c.corregido_al_lado.umbral_seco_mm == pytest.approx(700 * 650 / 824, abs=0.1)
    assert "balance" not in c.corregido_al_lado.nota


def test_800_mm_coincide_con_nasa(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=800, anios_registro=12), clima)
    c = r.contraste[0]
    assert c.diferencia_pct == -3
    assert c.confianza_resultante == "alta"
    assert r.confianza_agua == "alta"
    assert "coinciden: confianza alta" in c.texto
    assert r.riesgos == []


def test_pocos_anios_se_muestra_con_confianza_baja(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=800, anios_registro=3), clima)
    c = r.contraste[0]
    assert c.valor_productor == 800 and c.valor_nasa == 824
    assert c.confianza_resultante == "baja"
    assert "pocos años de registro" in c.texto
    assert r.confianza_agua == "alta"  # un registro corto no empeora el dato de NASA
    assert any("3 años de registro" in x for x in r.riesgos)


def test_solo_materia_organica_es_dato_del_productor(clima):
    r = corr.contrastar(MedicionesPropias(materia_organica_pct=2.8), clima)
    assert len(r.contraste) == 1
    c = r.contraste[0]
    assert c.indicador == "materia_organica"
    assert c.valor_nasa is None and c.diferencia_pct is None and c.confianza_resultante is None
    assert c.texto.startswith("Materia orgánica: 2,8 % (dato del productor)")
    assert r.confianza_agua is None and r.riesgos == []


def test_sin_mediciones_todo_vacio(clima):
    for m in (MedicionesPropias(), None):
        r = corr.contrastar(m, clima)
        assert r.contraste == [] and r.riesgos == [] and r.faltantes == [] and r.confianza_agua is None


def test_clima_caido_muestra_la_medicion_sin_comparar(clima_caido):
    assert not clima_caido.ok
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650, anios_registro=10, materia_organica_pct=3), clima_caido)
    lluvia, mo = r.contraste
    assert lluvia.valor_productor == 650 and lluvia.valor_nasa is None and lluvia.diferencia_pct is None
    assert lluvia.confianza_resultante is None and lluvia.corregido_al_lado is None
    assert "no se pudo comparar" in lluvia.texto
    assert mo.indicador == "materia_organica"
    assert r.confianza_agua is None


def test_nunca_lanza(clima):
    roto = clima.__class__(**{**clima.__dict__, "indicadores": None})
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650), roto)
    assert r.contraste == [] and len(r.faltantes) == 1


def test_entra_en_la_salida_del_contrato(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650, anios_registro=3, materia_organica_pct=2.8), clima)
    campo = Salida.model_fields["contraste_mediciones"]
    assert campo.annotation.__args__[0] is type(r.contraste[0])
    for c in r.contraste:
        assert type(c).model_validate(c.model_dump()) == c


def _normalizar(t: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn").lower()


@pytest.mark.parametrize("mm,anios,mo", [(650, 10, 2.8), (800, 3, None), (1200, None, 4.0), (300, 2, 1.5)])
def test_sin_lenguaje_prohibido(clima, clima_caido, mm, anios, mo):
    for cl in (clima, clima_caido):
        r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=mm, anios_registro=anios, materia_organica_pct=mo), cl)
        textos = [c.texto for c in r.contraste] + r.riesgos + r.faltantes
        textos += [c.corregido_al_lado.nota for c in r.contraste if c.corregido_al_lado]
        for t in textos:
            assert not re.search(r"\brecomendamos\b|\bdeberias\b|\bla mejor\b", _normalizar(t)), t
