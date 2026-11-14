"""Tests de la API con el mock. Correr desde backend/: py -m pytest tests/api"""

import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

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
    assert cuerpo["es_mock"] is True


def test_cada_indicador_es_trazable():
    cuerpo = cliente.post("/analizar", json=ENTRADA).json()
    for ind in cuerpo["indicadores"].values():
        for clave in ("unidad", "fuente", "resolucion", "confianza"):
            assert ind[clave], clave


def test_puntos_alcanzan_para_recalcular_la_cercania():
    """RF13: el front recalcula la cercanía con `puntos` y las prioridades."""
    cuerpo = cliente.post("/analizar", json=ENTRADA).json()
    pesos = ENTRADA["prioridades"]
    for e in cuerpo["estrategias"]:
        if not e["disponible"]:
            continue
        p = e["puntos"]
        valores = {"agua": p["agua"]["normal"], "suelo": p["suelo"], "erosion": p["erosion"], "ingreso": p["ingreso"]}
        esperada = round(sum(pesos[o] * valores[o] for o in valores) / sum(pesos.values()))
        assert e["cercania"] == esperada


def test_sin_lenguaje_de_recomendacion():
    texto = json.dumps(cliente.post("/analizar", json=ENTRADA).json(), ensure_ascii=False).lower()
    assert not any(p in texto for p in PROHIBIDAS)


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
