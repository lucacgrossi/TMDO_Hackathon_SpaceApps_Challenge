"""Tests de la API con las fuentes simuladas de conftest.py. Correr desde backend/: py -m pytest tests/api"""

import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

# La CI corre pytest con --disable-socket (pytest-socket). TestClient no sale a internet, pero el
# event loop de asyncio abre un socketpair local para despertarse, y eso también lo bloquea.
# Por eso estos tests habilitan sockets: siguen sin tocar la red (no hay ningún pedido HTTP real).
pytestmark = pytest.mark.enable_socket

cliente = TestClient(app)
ENTRADA = json.loads((Path(__file__).parents[1] / "ejemplos" / "entrada_demo.json").read_text(encoding="utf-8"))
PROHIBIDAS = ("recomend", "deberías", "deberia", "la mejor", "te conviene")


def test_salud():
    assert cliente.get("/salud").json() == {"estado": "ok"}


def test_analizar_devuelve_4_columnas_con_el_contrato():
    r = cliente.post("/analizar", json=ENTRADA)
    assert r.status_code == 200
    cuerpo = r.json()
    assert [e["id"] for e in cuerpo["estrategias"]] == ["actual", "A", "B", "C"]
    assert len(cuerpo["clima_mensual"]["lluvia_mm"]) == 12
    assert cuerpo["aviso"].startswith("Herramienta de apoyo")
    assert cuerpo["es_mock"] is False


def test_cada_indicador_es_trazable():
    cuerpo = cliente.post("/analizar", json=ENTRADA).json()
    for ind in cuerpo["indicadores"].values():
        for clave in ("unidad", "fuente", "resolucion", "confianza"):
            assert ind[clave], clave


@pytest.mark.parametrize("prioridades", [
    {"agua": 3, "suelo": 3, "ingreso": 3, "erosion": 3},
    {"agua": 5, "suelo": 1, "ingreso": 3, "erosion": 2},  # distintas: distingue p² de p
])
def test_puntos_alcanzan_para_recalcular_la_cercania(prioridades):
    """RF13: el front recalcula la cercanía con `puntos` y las prioridades al cuadrado (de 1 a 5)."""
    entrada = copy.deepcopy(ENTRADA)
    entrada["prioridades"] = prioridades
    cuerpo = cliente.post("/analizar", json=entrada).json()
    pesos = prioridades
    for e in cuerpo["estrategias"]:
        if not e["disponible"] or e["puntos"] is None:  # descartada, o motor todavía no conectado
            continue
        p = e["puntos"]
        valores = {"agua": p["agua"]["normal"], "suelo": p["suelo"], "erosion": p["erosion"], "ingreso": p["ingreso"]}
        esperada = round(sum(pesos[o] ** 2 * valores[o] for o in valores) / sum(pesos[o] ** 2 for o in valores))
        assert e["cercania"] == esperada


def test_sin_lenguaje_de_recomendacion():
    texto = json.dumps(cliente.post("/analizar", json=ENTRADA).json(), ensure_ascii=False).lower()
    assert not any(p in texto for p in PROHIBIDAS)


@pytest.mark.parametrize("valor", [0, 6])
def test_prioridades_fuera_de_1_a_5_dan_422(valor):
    mala = copy.deepcopy(ENTRADA)
    mala["prioridades"]["agua"] = valor
    assert cliente.post("/analizar", json=mala).status_code == 422


def test_entrada_invalida_da_422():
    mala = copy.deepcopy(ENTRADA)
    mala["cultivo_verano"] = "alfalfa"
    assert cliente.post("/analizar", json=mala).status_code == 422


def test_poligono_fuera_de_rango_da_422():
    mala = copy.deepcopy(ENTRADA)
    mala["lote"]["poligono"]["coordinates"][0][0] = [-200, -33.2]
    assert cliente.post("/analizar", json=mala).status_code == 422


def test_lote_mas_grande_que_20000_ha_da_422():
    mala = copy.deepcopy(ENTRADA)
    mala["lote"]["area_ha"] = 25000
    assert cliente.post("/analizar", json=mala).status_code == 422
