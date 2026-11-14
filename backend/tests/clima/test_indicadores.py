"""Tests de clima/indicadores.py. Sin red: usan la respuesta real de POWER del lote demo guardada."""

import json
import math
from pathlib import Path

import pytest

from app.clima import indicadores as ind
from app.clima.power import LAT_DEMO, LON_DEMO, SeriePower, armar_serie

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"


@pytest.fixture(scope="module")
def r():
    serie = armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8")))
    return ind.calcular(serie, LAT_DEMO, LON_DEMO)


# --- FAO-56 ------------------------------------------------------------------

def test_ra_ejemplo_8_fao56():
    """FAO-56, ejemplo 8: 20° S, 3 de septiembre (día 246) → Ra = 32,2 MJ m⁻² día⁻¹."""
    ra_mj = ind.ra_mm_dia(-20.0, 246) / ind.MJ_A_MM
    assert ra_mj == pytest.approx(32.2, abs=0.1)


def test_ra_es_mayor_en_verano_austral():
    assert ind.ra_mm_dia(LAT_DEMO, 15) > ind.ra_mm_dia(LAT_DEMO, 196)


def test_ra_sin_solucion_en_noche_polar():
    assert ind.ra_mm_dia(-80.0, 172) is None


def test_hargreaves_ecuacion_52():
    # 0,0023 · (20 + 17,8) · √12 · 15 = 4,517 mm/día
    assert ind.et0_hargreaves_dia(20, 12, 15) == pytest.approx(0.0023 * 37.8 * math.sqrt(12) * 15)
    assert ind.et0_hargreaves_dia(20, -1, 15) == 0  # amplitud negativa (dato raro) no rompe


# --- Lote demo ---------------------------------------------------------------

def test_resultado_ok_con_30_campanas(r):
    assert r.ok and r.motivo is None
    assert r.n == 30 and r.periodo == "1996/97 a 2025/26"
    assert r.faltantes == []


def test_clima_mensual_valida_el_contrato_y_tiene_12_meses(r):
    m = r.clima_mensual
    assert m.n_anios == 30
    for campo in ("lluvia_mm", "minima_media_c", "maxima_media_c", "t_media_c", "et0_mm", "balance_mm",
                  "anios_con_helada", "anios_con_35c", "helada_frecuente"):
        assert len(getattr(m, campo)) == 12, campo


def test_lluvia_media_del_lote_demo(r):
    assert r.indicadores["lluvia_anual"].valor == 819


def test_heladas_frecuentes_en_invierno(r):
    m = r.clima_mensual
    assert all(m.helada_frecuente[i] for i in (5, 6, 7))          # junio a agosto
    assert not any(m.helada_frecuente[i] for i in (0, 1, 2, 10, 11))  # verano
    assert all(h <= 30 for h in m.anios_con_helada)


def test_helada_frecuente_es_1_de_cada_3_anios(r):
    m = r.clima_mensual
    assert m.helada_frecuente == [h >= 10 for h in m.anios_con_helada]


def test_et0_mayor_en_verano_y_balance_coherente(r):
    m = r.clima_mensual
    assert m.et0_mm[0] > m.et0_mm[6]  # enero > julio
    for i in range(12):
        assert m.balance_mm[i] == pytest.approx(m.lluvia_mm[i] - m.et0_mm[i], abs=0.11)


def test_terciles_10_10_10_por_balance(r):
    t = r.tipos_de_anio
    assert t.metodo == "terciles_balance"
    assert len(t.seco) == len(t.normal) == len(t.humedo) == 10
    assert set(t.seco + t.normal + t.humedo) == {c.etiqueta for c in r.campanas}
    assert t.umbral_seco_mm < t.umbral_humedo_mm


def test_las_secas_tienen_menos_balance_que_las_humedas(r):
    por_tipo = {tipo: [c.balance_total_mm for c in r.campanas if c.tipo == tipo] for tipo in ind.TIPOS}
    assert max(por_tipo["seco"]) <= min(por_tipo["normal"])
    assert max(por_tipo["normal"]) <= min(por_tipo["humedo"])


def test_terciles_motor_tiene_la_forma_que_pide_el_motor(r):
    tm = r.terciles_motor
    assert set(tm) == {"seco", "normal", "humedo"}
    for t in tm.values():
        assert len(t["pp"]) == len(t["et0"]) == 12 and t["n"] == 10
    assert sum(tm["seco"]["pp"]) < sum(tm["humedo"]["pp"])


def test_indicadores_trazables(r):
    for clave, i in r.indicadores.items():
        assert i.valor is not None, clave
        assert i.unidad and i.fuente and i.resolucion and i.anios, clave
        assert i.confianza == "media", clave


# --- Celda de POWER ----------------------------------------------------------

def test_celda_del_lote_demo():
    c = ind.clima_celda(LAT_DEMO, LON_DEMO)
    assert c.bbox == pytest.approx((-64.6875, -33.25, -64.0625, -32.75))
    assert c.posicion_lote == "cerca del borde sur"


def test_celda_bien_adentro():
    assert ind.clima_celda(-33.0, -64.375).posicion_lote == "bien adentro"


# --- Fallas ------------------------------------------------------------------

def test_power_caido_no_lanza_y_va_a_falta():
    r = ind.calcular(SeriePower(ok=False, motivo="NASA POWER no respondió en 15 s."), LAT_DEMO, LON_DEMO)
    assert not r.ok
    assert r.clima_celda is not None  # la celda se dibuja igual
    assert r.faltantes == ["Clima de NASA POWER: NASA POWER no respondió en 15 s."]
    assert all(i.valor is None and i.confianza == "sin_dato" for i in r.indicadores.values())


def test_sin_et0_corta_por_lluvia(monkeypatch):
    serie = armar_serie(json.loads(FIXTURE.read_text(encoding="utf-8")))
    monkeypatch.setattr(ind, "ra_mm_dia", lambda lat, dia: None)
    r = ind.calcular(serie, LAT_DEMO, LON_DEMO)
    assert r.ok and r.tipos_de_anio.metodo == "terciles_lluvia"
    assert r.terciles_motor["seco"]["et0"] is None
    assert r.indicadores["balance_anual"].confianza == "sin_dato"
    assert any("por lluvia" in f for f in r.faltantes)
