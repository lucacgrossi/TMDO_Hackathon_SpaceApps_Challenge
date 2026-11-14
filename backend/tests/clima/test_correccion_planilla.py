"""Contraste de lluvia con la planilla del productor (docs/plan-planilla-lluvia.md, 5.3). Sin red."""

import json
from pathlib import Path

import pytest

from app.api.contrato import MedicionesPropias, MedicionMes
from app.clima import correccion as corr
from app.clima.indicadores import calcular
from app.clima.power import LAT_DEMO, LON_DEMO, SeriePower, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"


@pytest.fixture(scope="module")
def clima():
    return calcular(armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8"))), LAT_DEMO, LON_DEMO)


def _meses_de(clima, campanas: list[str], factor: float = 1.0) -> list[MedicionMes]:
    """Planilla mensual que copia la lluvia de NASA en esas campañas, multiplicada por `factor`."""
    meses = []
    for c in clima.campanas:
        if c.etiqueta not in campanas:
            continue
        y = int(c.etiqueta[:4])
        for m in (6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5):  # julio → junio, en orden cronológico
            anio = y + 1 if m < 6 else y
            meses.append(MedicionMes(mes=f"{anio}-{m + 1:02d}", lluvia_mm=round(c.lluvia_mm[m] * factor, 1)))
    return meses


def _nasa_media(clima, campanas):
    return sum(c.lluvia_total_mm for c in clima.campanas if c.etiqueta in campanas) / len(campanas)


SEIS = ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24"]


def test_seis_campanas_compara_en_el_mismo_periodo_y_no_contra_las_30(clima):
    r = corr.contrastar(MedicionesPropias(serie_mensual=_meses_de(clima, SEIS, 0.8)), clima)
    c = r.contraste[0]
    assert c.campanas_comparadas == SEIS
    assert c.valor_nasa == pytest.approx(_nasa_media(clima, SEIS), abs=0.1)
    assert c.valor_nasa != clima.indicadores["lluvia_anual"].valor  # no es la media de las 30
    assert c.diferencia_pct == -20
    assert c.confianza_resultante == "baja" and r.confianza_agua == "baja"
    assert "en las mismas campañas" in r.motivo_agua
    assert c.texto.startswith("Tu pluviómetro (2018/19 a 2023/24, 6 campañas):")
    assert "NASA en las mismas campañas" in c.texto
    assert [d.campana for d in c.detalle_campanas] == SEIS
    assert all(d.diferencia == -20 for d in c.detalle_campanas)
    assert c.corregido_al_lado is not None


def test_planilla_que_coincide_da_confianza_alta(clima):
    r = corr.contrastar(MedicionesPropias(serie_mensual=_meses_de(clima, SEIS, 1.05)), clima)
    c = r.contraste[0]
    assert c.diferencia_pct == 5 and c.confianza_resultante == "alta"
    assert r.confianza_agua == "alta" and r.riesgos == []


def test_una_campana_en_comun_alcanza(clima):
    """Decidido 14/11: alcanza 1 campaña en común; la confianza la decide solo la diferencia."""
    r = corr.contrastar(MedicionesPropias(serie_mensual=_meses_de(clima, SEIS[:1], 1.0)), clima)
    c = r.contraste[0]
    assert c.diferencia_pct == 0 and c.campanas_comparadas == SEIS[:1]
    assert c.confianza_resultante == "alta" and r.confianza_agua == "alta"
    assert c.texto.startswith("Tu pluviómetro (2018/19, 1 campaña):")
    assert "pocos años" not in c.texto and r.riesgos == []


def test_sin_campanas_en_comun_fila_sin_comparar(clima):
    meses = [MedicionMes(mes=f"{1980 + i // 12}-{i % 12 + 1:02d}", lluvia_mm=60) for i in range(6, 6 + 36)]
    r = corr.contrastar(MedicionesPropias(serie_mensual=meses), clima)
    c = r.contraste[0]
    assert c.valor_nasa is None and c.diferencia_pct is None and c.campanas_comparadas == []
    assert "no coincide con el período de NASA (1996/97 a 2025/26)" in c.texto
    assert r.confianza_agua is None


def test_sin_campanas_completas_fila_sin_comparar(clima):
    meses = [MedicionMes(mes=f"2023-{m:02d}", lluvia_mm=50) for m in range(1, 13)]  # enero a diciembre
    r = corr.contrastar(MedicionesPropias(serie_mensual=meses), clima)
    c = r.contraste[0]
    assert c.valor_nasa is None and "no tiene campañas completas" in c.texto
    assert c.valor_productor == 600


def test_planilla_y_lluvia_anual_manda_la_planilla(clima):
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=400, serie_mensual=_meses_de(clima, SEIS, 1.0)), clima)
    assert len(r.contraste) == 1
    c = r.contraste[0]
    assert c.diferencia_pct == 0 and c.campanas_comparadas == SEIS
    assert "se usó la planilla en lugar de la lluvia anual cargada a mano" in c.texto


def test_planilla_solo_con_temperaturas_usa_la_lluvia_anual(clima):
    meses = [MedicionMes(mes=f"2023-{m:02d}", t_min_c=5) for m in range(1, 13)]
    r = corr.contrastar(MedicionesPropias(lluvia_anual_mm=650, serie_mensual=meses), clima)
    assert r.contraste[0].campanas_comparadas is None  # contraste de siempre, contra las 30
    assert r.contraste[0].diferencia_pct == -21


def test_nasa_caido_muestra_la_planilla_sin_comparar():
    clima_caido = calcular(SeriePower(ok=False, motivo="timeout"), LAT_DEMO, LON_DEMO)
    meses = [MedicionMes(mes=f"{2019 + (m < 6)}-{m + 1:02d}", lluvia_mm=70) for m in range(12)]
    r = corr.contrastar(MedicionesPropias(serie_mensual=meses), clima_caido)
    c = r.contraste[0]
    assert c.valor_nasa is None and "NASA POWER sin dato" in c.texto and c.valor_productor == 840


def test_campanas_productor_arma_julio_junio_con_indice_0_enero():
    meses = [MedicionMes(mes=f"{2022 + (m < 6)}-{m + 1:02d}", lluvia_mm=m) for m in range(12)]
    camp = corr._campanas_productor(meses, "lluvia_mm")
    assert list(camp) == ["2022/23"]
    assert camp["2022/23"] == list(range(12))  # índice 0 = enero de 2023, 6 = julio de 2022
