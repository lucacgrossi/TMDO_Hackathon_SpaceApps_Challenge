"""Tests de clima/serie.py (RF24). Sin red: usan la respuesta real de POWER del lote demo guardada."""

import json
from pathlib import Path

import pytest

from app.api.contrato import SerieAnual
from app.clima import indicadores as ind
from app.clima import serie as se
from app.clima.power import FUENTE, LAT_DEMO, LON_DEMO, RESOLUCION, SeriePower, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"


def _serie_power() -> SeriePower:
    return armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8")))


@pytest.fixture(scope="module")
def clima():
    return ind.calcular(_serie_power(), LAT_DEMO, LON_DEMO)


@pytest.fixture(scope="module")
def s(clima):
    return se.serie_anual(clima)


def test_valida_contra_el_contrato(s):
    assert isinstance(s, SerieAnual)
    SerieAnual.model_validate(s.model_dump())


def test_fuente_resolucion_y_periodo_de_power(s):
    assert s.fuente == FUENTE and s.resolucion == RESOLUCION
    assert s.periodo == "1995/96 a 2024/25"


def test_30_campanas_en_orden_cronologico(s, clima):
    etiquetas = [c.campana for c in s.campanas]
    assert len(etiquetas) == 30
    assert etiquetas[0] == "1995/96" and etiquetas[-1] == "2024/25"
    assert etiquetas == [c.etiqueta for c in clima.campanas]
    assert [int(e[:4]) for e in etiquetas] == list(range(1995, 2025))


def test_lluvia_y_balance_redondeados(s, clima):
    for fila, c in zip(s.campanas, clima.campanas, strict=True):
        assert fila.lluvia_mm == round(c.lluvia_total_mm)
        assert fila.balance_mm == round(c.balance_total_mm)


def test_tipos_coinciden_con_tipos_de_anio(s, clima):
    t = clima.tipos_de_anio
    por_tipo = {tipo: [c.campana for c in s.campanas if c.tipo == tipo] for tipo in ind.TIPOS}
    assert por_tipo == {"seco": t.seco, "normal": t.normal, "humedo": t.humedo}


def test_promedios_contra_calculo_a_mano(s, clima):
    lluvias = [sum(c.lluvia_mm) for c in clima.campanas]  # mm por campaña, julio–junio
    assert s.ultimas_10_mm == pytest.approx(sum(lluvias[20:]) / 10, abs=0.05)
    assert s.previas_20_mm == pytest.approx(sum(lluvias[:20]) / 20, abs=0.05)
    assert s.secos_en_ultimas_10 == sum(1 for c in clima.campanas[20:] if c.tipo == "seco")
    assert 0 <= s.secos_en_ultimas_10 <= 10


def test_ventana_como_el_prototipo():
    assert se.ventana(30) == 10
    assert se.ventana(18) == 6
    assert se.ventana(15) == 5
    assert se.ventana(45) == 10  # nunca más de 10


def test_con_18_campanas_toma_las_ultimas_6():
    completa = _serie_power()
    corta = SeriePower(ok=True, campanas=completa.campanas[-18:], n=18,
                       periodo=f"{completa.campanas[-18].etiqueta} a {completa.campanas[-1].etiqueta}")
    clima = ind.calcular(corta, LAT_DEMO, LON_DEMO)
    s = se.serie_anual(clima)
    assert s is not None and len(s.campanas) == 18
    assert s.periodo == "2007/08 a 2024/25"
    lluvias = [sum(c.lluvia_mm) for c in clima.campanas]
    assert s.ultimas_10_mm == pytest.approx(sum(lluvias[12:]) / 6, abs=0.05)
    assert s.previas_20_mm == pytest.approx(sum(lluvias[:12]) / 12, abs=0.05)
    assert s.secos_en_ultimas_10 == sum(1 for c in clima.campanas[12:] if c.tipo == "seco")


def test_sin_et0_el_balance_va_vacio(monkeypatch):
    monkeypatch.setattr(ind, "ra_mm_dia", lambda lat, dia: None)
    s = se.serie_anual(ind.calcular(_serie_power(), LAT_DEMO, LON_DEMO))
    assert s is not None and len(s.campanas) == 30
    assert all(c.balance_mm is None for c in s.campanas)
    assert all(c.tipo in ind.TIPOS for c in s.campanas)


def test_clima_caido_devuelve_none():
    clima = ind.calcular(SeriePower(ok=False, motivo="NASA POWER no respondió en 15 s."), LAT_DEMO, LON_DEMO)
    assert se.serie_anual(clima) is None


def test_nunca_lanza_con_datos_rotos(clima):
    roto = ind.ResultadoClima(ok=True, periodo=clima.periodo, n=1, campanas=[None])  # type: ignore[list-item]
    assert se.serie_anual(roto) is None
    assert se.serie_anual(ind.ResultadoClima(ok=True, periodo="x", n=0)) is None
