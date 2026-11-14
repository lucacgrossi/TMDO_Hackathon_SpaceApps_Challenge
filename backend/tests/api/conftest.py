"""Fuentes simuladas para los tests de la API: nada sale a internet.

NASA POWER se reemplaza por el fixture real del lote demo (`tests/clima/fixtures/power_rio_cuarto.json`)
y cada función de `satelite/` por un dict con la misma forma que devuelve Back 2.
"""

import json
from pathlib import Path

import pytest

from app.clima import power
from app.satelite import cobertura, elevacion, et, ndvi

FIXTURE_POWER = Path(__file__).parents[1] / "clima" / "fixtures" / "power_rio_cuarto.json"


def ind(valor, unidad, fuente, resolucion, confianza="alta", **extra):
    return {
        "valor": valor,
        "unidad": unidad,
        "fuente": fuente,
        "anios": extra.pop("anios", "2021"),
        "resolucion": resolucion,
        "confianza": confianza,
        **extra,
    }


def cobertura_ok(poligono):
    return {
        "cultivo_pct": ind(98.0, "%", "ESA WorldCover 2021 v200", "10 m", nota="9310 de 9500 píxeles"),
        "es_agricola": True,
        "clase_principal": {"codigo": 40, "nombre": "Cultivo", "pct": 98.0},
        "clases": [{"codigo": 40, "nombre": "Cultivo", "pct": 98.0}],
        "aviso": None,
    }


def elevacion_ok(poligono):
    return {
        "pendiente_general": ind(0.6, "%", "NASADEM", "30 m", anios="2000", nota="Plano ajustado"),
        "pendiente_maxima": ind(1.8, "%", "NASADEM", "30 m", confianza="media", anios="2000"),
    }


def _mes(i):
    anio = 2026 if i < 6 else 2025
    fecha = f"{anio}-{i + 1:02d}-15"
    return {
        "mes": fecha[:7],
        "fecha": fecha,
        "ndvi_medio": 0.2 if i in (6, 7, 8, 9) else 0.7,
        "nubes_escena": 3.0,
        "coleccion": "hls2-s30",
        "item": f"HLS-TEST-{fecha}",
        "pixeles": 1050,
        "fuente": "NASA HLS S30 (Sentinel-2) · 30 m",
    }


CAMPANAS_NDVI_PEDIDAS: list = []  # campañas con que se llamó a ndvi.calcular en el test


def ndvi_ok(poligono, campana=None):
    CAMPANAS_NDVI_PEDIDAS.append(campana)
    meses = [None if i == 10 else _mes(i) for i in range(12)]
    return {
        "visto_por_satelite": {
            "campana": f"{campana}/{str(campana + 1)[2:]}" if campana else "2025/26",
            "fuente": "NASA HLS 30 m",
            "meses": meses,
            "meses_ndvi_bajo": 4,
            "umbral": 0.3,
            "orden_meses": "índice 0 = enero",
            "faltantes": [{"mes": "2025-11", "motivo": "Noviembre 2025: sin escena HLS con < 30 % de nubes"}],
        },
        "meses_cobertura_baja": ind(
            4,
            "meses",
            "NASA HLS 30 m",
            "30 m",
            confianza="baja",
            anios="2025/26",
            nota="NDVI < 0,3 en 4 de 11 meses con dato",
        ),
    }


def et_ok(poligono):
    return {"et_real_anual": ind(720, "mm/año", "NASA MODIS MOD16A2", "500 m", confianza="media", anios="2025")}


@pytest.fixture(scope="session")
def serie_power():
    return power.armar_serie(json.loads(FIXTURE_POWER.read_text(encoding="utf-8")))


@pytest.fixture(autouse=True)
def fuentes_simuladas(monkeypatch, serie_power):
    CAMPANAS_NDVI_PEDIDAS.clear()
    monkeypatch.setattr(power, "pedir_power", lambda lat, lon: serie_power)
    monkeypatch.setattr(cobertura, "calcular", cobertura_ok)
    monkeypatch.setattr(elevacion, "calcular", elevacion_ok)
    monkeypatch.setattr(ndvi, "calcular", ndvi_ok)
    monkeypatch.setattr(et, "calcular", et_ok)
