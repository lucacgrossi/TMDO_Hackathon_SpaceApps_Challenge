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


def _ultimas(clima, n: int) -> tuple[list[str], float]:
    """Las últimas n campañas de NASA y su lluvia media: el período que usa la mezcla del motor."""
    ultimas = sorted(clima.campanas, key=lambda c: c.etiqueta)[-n:]
    return [c.etiqueta for c in ultimas], sum(c.lluvia_total_mm for c in ultimas) / len(ultimas)


def test_lote_demo_650_mm_sin_anios_difiere_21_pct_del_promedio_de_las_30(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650), clima)
    assert len(r.contraste) == 1
    c = r.contraste[0]
    assert c.indicador == "lluvia_anual"
    assert c.valor_nasa == clima.indicadores["lluvia_anual"].valor == 819
    assert c.diferencia_pct == -21 and c.campanas_comparadas is None
    assert c.confianza_resultante == "baja"
    assert r.confianza_agua == "baja"
    assert c.texto == ("Tu pluviómetro: 650 mm/año · NASA, promedio de las 30 campañas (sin años de registro): 819 mm "
                       "(−21 %) · difieren más de 15 %: confianza baja en agua")
    assert len(r.riesgos) == 1 and "difiere 21 % de NASA" in r.riesgos[0]
    assert r.faltantes == []


def test_con_anios_compara_con_las_ultimas_campanas_como_la_mezcla(clima):
    """H-006: el contraste a mano compara contra las mismas campañas que la mezcla del motor."""
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650, anios_registro=10), clima)
    c = r.contraste[0]
    etiquetas, vn = _ultimas(clima, 10)
    assert c.campanas_comparadas == etiquetas and etiquetas[-1] == "2025/26" and len(etiquetas) == 10
    assert c.valor_nasa == pytest.approx(vn, abs=0.05)
    assert c.diferencia_pct == round((650 - vn) / vn * 100) == -11
    assert c.confianza_resultante == "alta" and r.confianza_agua == "alta" and r.riesgos == []
    assert c.texto.startswith(f"Tu pluviómetro (10 años de registro): 650 mm/año · NASA en las últimas 10 campañas "
                              f"({etiquetas[0]} a 2025/26): {round(vn)} mm (−11 %)")


def test_corregido_al_lado_usa_la_lluvia_del_tercio_seco_si_el_corte_es_por_balance(clima):
    assert clima.tipos_de_anio.metodo == "terciles_balance"
    c = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650), clima).contraste[0]
    lluvia_seca = max(x.lluvia_total_mm for x in clima.campanas if x.tipo == "seco")
    assert c.corregido_al_lado.umbral_seco_mm == pytest.approx(lluvia_seca * 650 / 819, abs=0.1)
    assert "balance" in c.corregido_al_lado.nota
    assert c.corregido_al_lado.nota.endswith("Solo informativo.")


def test_corregido_al_lado_escala_el_umbral_si_el_corte_es_por_lluvia(clima):
    por_lluvia = clima.tipos_de_anio.model_copy(update={"metodo": "terciles_lluvia", "umbral_seco_mm": 700.0})
    c = corr.contrastar(
        MedicionesPropias(lluvia_anual_mm=650), clima.__class__(**{**clima.__dict__, "tipos_de_anio": por_lluvia})
    ).contraste[0]
    assert c.corregido_al_lado.umbral_seco_mm == pytest.approx(700 * 650 / 819, abs=0.1)
    assert "balance" not in c.corregido_al_lado.nota


def test_800_mm_coincide_con_nasa(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=800, anios_registro=12), clima)
    c = r.contraste[0]
    _, vn = _ultimas(clima, 12)
    assert c.diferencia_pct == round((800 - vn) / vn * 100) == 3
    assert c.confianza_resultante == "alta"
    assert r.confianza_agua == "alta"
    assert "coinciden: confianza alta" in c.texto
    assert r.riesgos == []


def test_un_anio_de_registro_alcanza_y_la_confianza_la_decide_la_diferencia(clima):
    """Decidido 14/11: como el motor, alcanza 1 año; más años pesan más en el motor, no acá.

    H-006: 1 año se compara con la última campaña de NASA (2025/26, 601 mm), como la mezcla.
    """
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=800, anios_registro=1), clima)
    c = r.contraste[0]
    assert c.valor_productor == 800 and c.campanas_comparadas == ["2025/26"]
    assert c.diferencia_pct == 33
    assert c.confianza_resultante == "baja" and r.confianza_agua == "baja"
    assert "pocos años" not in c.texto
    assert "NASA en la última campaña (2025/26): 601 mm (+33 %)" in c.texto
    assert r.riesgos == ["Tu pluviómetro difiere 33 % de NASA POWER en la última campaña 2025/26 (800 contra 601 "
                         "mm/año): el dato de agua tiene confianza baja"]


@pytest.mark.parametrize("mm, anios", [(790, 1), (790, 3), (700, 5), (650, 10), (800, 40)])
def test_contraste_y_mezcla_del_motor_dicen_la_misma_diferencia(clima, mm, anios):
    """H-006: la fila del contraste y la evidencia del motor comparan contra las mismas campañas."""
    from app.motor import mezcla

    m = clima.clima_mensual
    ind = {"terciles": clima.terciles_motor, "anios_con_helada": list(m.anios_con_helada),
           "anios_con_calor": list(m.anios_con_35c), "n_anios": m.n_anios,
           "campanas_nasa": [{"campana": c.etiqueta, "lluvia_mm": list(c.lluvia_mm), "t_min_c": list(c.t_min_c),
                              "t_max_c": list(c.t_max_c)} for c in clima.campanas]}
    med = {"lluvia_anual_mm": mm, "anios_registro": anios}
    mz = mezcla.mezclar({"mediciones": med}, ind)
    c = corr.contrastar(MedicionesPropias(**med), clima).contraste[0]
    assert c.campanas_comparadas == mz["periodo_comparado"]["lluvia"]
    assert c.diferencia_pct == mz["diferencia_lluvia_pct"]


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
