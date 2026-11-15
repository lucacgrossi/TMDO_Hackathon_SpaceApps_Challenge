"""Textos de las columnas: singular y plural, restricciones y descartadas (H-017, H-025 y H-028 del QA del 15/11)."""
import re

from app.motor import plantillas, reglas
from app.motor.cultivos import cuenta
from tests.motor.conftest import entradas

PROHIBIDO = re.compile(r"recomend|deber[ií]as|la mejor", re.IGNORECASE)


def _correr(ind, **cambios):
    e = entradas(**cambios)
    return plantillas.armar(reglas.analizar(e, ind), e, ind)


def _col(r, i):
    return next(s for s in r["estrategias"] if s["id"] == i)


def _textos(r):
    textos = []
    for s in r["estrategias"]:
        textos += [s["resumen"], *s["por_que"], *s["evidencia"], *s["beneficios"], *s["revisar"], *s["falta"]]
        textos += [a["dato"] for a in s.get("aportes", [])]
    return textos


def test_singular_con_un_mes(ind):
    assert cuenta(1, "mes pelado", "meses pelados") == "1 mes pelado"
    assert cuenta(3, "mes pelado", "meses pelados") == "3 meses pelados"
    r = _correr(ind, invierno="trigo")  # soja + trigo: solo mayo queda pelado
    actual = _col(r, "actual")
    assert actual["meses_pelados"] == 1
    assert "1 mes con el lote pelado" in actual["resumen"]
    assert any(x.startswith("1 mes con el lote pelado (mayo)") for x in actual["por_que"])
    assert any(a["dato"].startswith("1 mes pelado (mayo)") for a in actual["aportes"])
    assert not [t for t in _textos(r) if re.search(r"\b1 meses\b", t)]


def test_descartada_sin_mayuscula_a_mitad_de_frase(ind):
    a = _col(_correr(ind, no_sembrar=["vicia", "centeno"]), "A")
    assert a["motivo"] == "No sembrar vicia ni centeno"
    assert a["resumen"] == "Descartada: no sembrar vicia ni centeno."


def test_por_que_nombra_las_restricciones(ind):
    r = _correr(ind, restricciones=["sin_riego", "sin_hacienda"], maquinaria_limitada=True, no_sembrar=["sorgo"])
    for s in r["estrategias"]:
        linea = next(x for x in s["por_que"] if x.startswith("Restricciones que cargaste: "))
        for texto in ("sin riego", "sin hacienda", "maquinaria limitada", "no sembrar sorgo"):
            assert texto in linea
    assert not [t for t in _textos(r) if PROHIBIDO.search(t)]
    # Sin restricciones cargadas no hay línea (no se afirma nada que el productor no dijo).
    assert not any(x.startswith("Restricciones") for s in _correr(ind)["estrategias"] for x in s["por_que"])


def test_no_sembrar_un_cultivo_de_la_rotacion_actual_se_dice(ind):
    r = _correr(ind, invierno="trigo", no_sembrar=["trigo"])
    actual, b, c = _col(r, "actual"), _col(r, "B"), _col(r, "C")
    assert any(x.startswith("Tu rotación actual tiene trigo, que marcaste en no sembrar") for x in actual["por_que"])
    assert b["especies"] == "Cebada + soja de 2ª"
    assert not any("marcaste en no sembrar" in x for x in b["por_que"])
    assert any(x.startswith("Mantiene trigo de tu rotación actual") for x in c["por_que"])  # C conserva el invierno
    assert not [t for t in _textos(r) if PROHIBIDO.search(t)]
