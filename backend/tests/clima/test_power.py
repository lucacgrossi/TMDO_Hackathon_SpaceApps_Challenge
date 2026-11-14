"""Tests de clima/power.py. Sin red: usan la respuesta real del lote demo guardada."""

import copy
import json
from pathlib import Path

import httpx
import pytest

from app.clima import power

FIXTURE = Path(__file__).parent / "fixtures" / "power_rio_cuarto.json"


@pytest.fixture
def respuesta():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def cache_vacia():
    power._cache.clear()
    yield
    power._cache.clear()


def test_arma_30_campanas_julio_junio(respuesta):
    s = power.armar_serie(respuesta)
    assert s.ok and s.motivo is None
    assert s.n == 30 == len(s.campanas)
    assert s.periodo == "1996/97 a 2025/26"
    assert [c.etiqueta for c in s.campanas[:2]] == ["1996/97", "1997/98"]
    assert s.campanas[-1].etiqueta == "2025/26"
    assert s.fuente == "NASA POWER mensual (comunidad AG)"
    assert s.resolucion == "~50 km (0,5° × 0,625°)"
    for c in s.campanas:
        assert len(c.lluvia_mm) == len(c.t_media_c) == len(c.t_min_c) == 12
        assert len(c.t_max_c) == len(c.amplitud_diaria_c) == 12


def test_indice_0_es_enero(respuesta):
    P = respuesta["properties"]["parameter"]
    c = next(c for c in power.armar_serie(respuesta).campanas if c.etiqueta == "2021/22")
    assert c.lluvia_mm[0] == P["PRECTOTCORR_SUM"]["202201"]  # enero 2022
    assert c.lluvia_mm[6] == P["PRECTOTCORR_SUM"]["202107"]  # julio 2021
    assert c.t_min_c[5] == P["T2M_MIN"]["202206"]  # junio 2022
    assert c.t_max_c[11] == P["T2M_MAX"]["202112"]  # diciembre 2021
    assert c.t_media_c[1] == P["T2M"]["202202"]  # febrero 2022
    assert c.amplitud_diaria_c[7] == P["T2M_RANGE"]["202108"]  # agosto 2021


def test_media_y_amplitud_son_medias_y_min_max_extremos(respuesta):
    # T2M_MIN/MAX son extremos del mes; T2M y T2M_RANGE, medias de los diarios.
    # Entonces la media queda entre los extremos y la amplitud diaria media es
    # menor que la amplitud extrema del mes, en todos los meses.
    for c in power.armar_serie(respuesta).campanas:
        for m in range(12):
            assert c.t_min_c[m] < c.t_media_c[m] < c.t_max_c[m]
            assert 0 < c.amplitud_diaria_c[m] < c.t_max_c[m] - c.t_min_c[m]


def test_t2m_media_anual_del_lote_demo(respuesta):
    s = power.armar_serie(respuesta)
    t_media = sum(c.t_media_anual_c for c in s.campanas) / s.n
    assert 15 <= t_media <= 18


def test_descarta_la_campana_en_curso(respuesta):
    # El fixture es del 14/11/2026: POWER trae 2026 hasta septiembre y -999 después.
    P = respuesta["properties"]["parameter"]["PRECTOTCORR_SUM"]
    assert P["202609"] > -999 and P["202610"] == -999
    etiquetas = [c.etiqueta for c in power.armar_serie(respuesta).campanas]
    assert "2026/27" not in etiquetas and etiquetas[-1] == "2025/26"


def test_no_usa_claves_anuales_13(respuesta):
    P = respuesta["properties"]["parameter"]
    assert "202113" in P["PRECTOTCORR_SUM"]  # el fixture sí las trae
    # Si se colara el anual, la campaña tendría 13 valores o el total se duplicaría.
    c = next(c for c in power.armar_serie(respuesta).campanas if c.etiqueta == "2021/22")
    esperado = sum(P["PRECTOTCORR_SUM"][k] for k in
                   ["202107", "202108", "202109", "202110", "202111", "202112",
                    "202201", "202202", "202203", "202204", "202205", "202206"])
    assert c.lluvia_total_mm == pytest.approx(esperado)


def test_lluvia_media_anual_del_lote_demo(respuesta):
    s = power.armar_serie(respuesta)
    media = sum(c.lluvia_total_mm for c in s.campanas) / s.n
    assert 800 <= media <= 850


@pytest.mark.parametrize("parametro", power.PARAMETROS)
def test_descarta_campana_con_faltante(respuesta, parametro):
    respuesta["properties"]["parameter"][parametro]["201103"] = -999.0  # marzo de 2010/11
    s = power.armar_serie(respuesta)
    etiquetas = [c.etiqueta for c in s.campanas]
    assert "2010/11" not in etiquetas
    # Sigue habiendo 30: entra la campaña 1995/96 que antes quedaba afuera.
    assert s.n == 30 and etiquetas[0] == "1995/96"


def test_descarta_mes_ausente(respuesta):
    del respuesta["properties"]["parameter"]["T2M_MAX"]["200008"]
    s = power.armar_serie(respuesta)
    assert "2000/01" not in [c.etiqueta for c in s.campanas]


def test_menos_de_15_campanas_da_error(respuesta):
    P = respuesta["properties"]["parameter"]["PRECTOTCORR_SUM"]
    for anio in range(1995, 2013):  # rompe un mes por año: quedan 13 campañas
        P[f"{anio}08"] = -999.0
    s = power.armar_serie(respuesta)
    assert not s.ok
    assert "13 campañas" in s.motivo and "15" in s.motivo


def test_respuesta_sin_parametros_da_error():
    s = power.armar_serie({"messages": ["algo salió mal"]})
    assert not s.ok and s.motivo


def test_error_de_red_no_lanza(monkeypatch):
    def falla(*args, **kwargs):
        raise httpx.ConnectError("sin red")

    monkeypatch.setattr(power.httpx, "get", falla)
    s = power.pedir_power(power.LAT_DEMO, power.LON_DEMO)
    assert s.ok is False
    assert "No se pudo conectar con NASA POWER" in s.motivo
    assert s.pedido and "community=AG" in s.pedido
    assert power._cache == {}  # los errores no quedan en caché


def test_timeout_no_lanza(monkeypatch):
    def lento(*args, **kwargs):
        raise httpx.ReadTimeout("lento")

    monkeypatch.setattr(power.httpx, "get", lento)
    s = power.pedir_power(power.LAT_DEMO, power.LON_DEMO)
    assert s.ok is False and "15 s" in s.motivo


def test_http_error_no_lanza(monkeypatch):
    def error_422(url, **kwargs):
        return httpx.Response(422, json={"messages": ["latitude fuera de rango"]},
                               request=httpx.Request("GET", url))

    monkeypatch.setattr(power.httpx, "get", error_422)
    s = power.pedir_power(95.0, 0.0)
    assert s.ok is False and "422" in s.motivo and "latitude fuera de rango" in s.motivo


def test_pide_una_vez_por_celda(monkeypatch, respuesta):
    pedidos = []

    def ok(url, **kwargs):
        pedidos.append(kwargs["params"])
        return httpx.Response(200, json=copy.deepcopy(respuesta), request=httpx.Request("GET", url))

    monkeypatch.setattr(power.httpx, "get", ok)
    a = power.pedir_power(power.LAT_DEMO, power.LON_DEMO)
    b = power.pedir_power(power.LAT_DEMO + 0.05, power.LON_DEMO - 0.05)  # misma celda
    assert a.ok and b is a and len(pedidos) == 1
    p = pedidos[0]
    assert p["parameters"] == "PRECTOTCORR_SUM,T2M,T2M_MIN,T2M_MAX,T2M_RANGE"
    assert p["community"] == "AG"
    assert p["end"] - p["start"] == 31
    assert a.celda == (-33.0, -64.375)
