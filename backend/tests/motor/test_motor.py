"""
Tests del motor con indicadores INVENTADOS parecidos a Río Cuarto.
No dependen de NASA ni de nadie del equipo.

Correr desde la carpeta backend/:
    python -m pytest tests/motor   (si tenés pytest)
    python -m tests.motor.test_motor   (sin pytest)
"""

import copy
import json

from app.motor import plantillas
from app.motor.reglas import analizar, calendario, cercania

PP = [110, 100, 105, 60, 30, 12, 10, 12, 35, 80, 100, 115]      # CLIMA0 del prototipo
ET0 = [170, 135, 115, 80, 55, 40, 45, 65, 90, 120, 150, 170]    # inventada, tipo Hargreaves


def indicadores(pendiente=1.6):
    def ter(f_pp, f_et):
        return {"pp": [v * f_pp for v in PP], "et0": [v * f_et for v in ET0], "n": 10}
    return {
        "terciles": {"seco": ter(0.74, 1.05), "normal": ter(1, 1), "humedo": ter(1.26, 0.95)},
        "anios_con_helada": [0, 0, 0, 2, 12, 25, 27, 22, 9, 1, 0, 0],
        "anios_con_calor": [20, 9, 2, 0, 0, 0, 0, 0, 0, 1, 6, 18],
        "n_anios": 30,
        "pendiente_pct": pendiente,
    }


def entradas(**cambios):
    e = {"verano": "soja", "invierno": "barbecho", "pasada": "soja",
         "pesos": {"agua": 3, "suelo": 3, "erosion": 3, "ingreso": 3},
         "no_sembrar": [], "maquinaria_limitada": False,
         "anegable": "no", "textura": "franco", "materia_organica_pct": None}
    e.update(cambios)
    return e


def correr(e=None, ind=None):
    e, ind = e or entradas(), ind or indicadores()
    return plantillas.armar(analizar(e, ind), e, ind)


def por_id(r):
    return {s["id"]: s for s in r["estrategias"]}


def test_cuatro_columnas_fijas():
    r = correr()
    assert [s["id"] for s in r["estrategias"]] == ["actual", "A", "B", "C"]


def test_calendario_soja_de_segunda():
    c = calendario("soja", "trigo")
    assert c[0] == "soja2" and c[6] == "trigo" and "soja" not in c


def test_no_sembrar_descarta_con_motivo():
    s = por_id(correr(entradas(no_sembrar=["vicia", "centeno"])))["A"]
    assert not s["on"] and "vicia" in s["motivo"]


def test_cobertura_protege_suelo_pero_gasta_agua():
    s = por_id(correr())
    act, a = s["actual"], s["A"]
    assert a["erosion"] > act["erosion"] and a["suelo"] > act["suelo"]
    assert a["agua_mm"]["normal"]["uso"] > act["agua_mm"]["normal"]["uso"]
    assert a["agua_por_tipo"]["normal"] < act["agua_por_tipo"]["normal"]


def test_agua_ordenada_por_tipo_de_anio():
    for s in correr()["estrategias"]:
        ag = s["agua_por_tipo"]
        assert ag["seco"] <= ag["normal"] <= ag["humedo"]


def test_cercania_es_promedio_pesado():
    s = por_id(correr())["A"]
    p = {"agua": 5, "suelo": 1, "erosion": 0, "ingreso": 2}
    esperado = round((5 * s["agua_por_tipo"]["normal"] + s["suelo"] + 2 * s["ingreso"]) / 8)
    assert cercania(s, p) == esperado
    assert cercania(s, {"agua": 0, "suelo": 0, "erosion": 0, "ingreso": 0}) is None


def test_choque_entre_agua_y_erosion():
    r = correr(entradas(pesos={"agua": 5, "suelo": 2, "erosion": 4, "ingreso": 1}))
    assert r["choque"]["hay"] and "chocan" in r["choque"]["texto"]


def test_sin_choque_si_el_segundo_pesa_poco():
    r = correr(entradas(pesos={"agua": 5, "suelo": 3, "erosion": 3, "ingreso": 1}))
    assert not r["choque"]["hay"]


def test_cinco_puntos_en_cada_columna_activa():
    for s in correr()["estrategias"]:
        if s["on"]:
            for k in ("por_que", "evidencia", "beneficios", "falta", "revisar"):
                assert k in s, k


def test_beneficios_de_la_cobertura():
    a = por_id(correr())["A"]
    assert any("meses más de cobertura" in b for b in a["beneficios"])


def test_trazabilidad_de_cada_aporte():
    for s in correr()["estrategias"]:
        for a in s["aportes"]:
            assert a["regla"] and a["efecto"] and a["dato"]


def test_lenguaje_sin_recetas():
    r = correr(entradas(pesos={"agua": 5, "suelo": 2, "erosion": 4, "ingreso": 1},
                        maquinaria_limitada=True, anegable="si"))
    texto = json.dumps(r, ensure_ascii=False).lower()
    for p in plantillas.PALABRAS_PROHIBIDAS:
        assert p not in texto, p


def test_pendiente_faltante_va_a_falta():
    s = por_id(correr(ind=indicadores(pendiente=None)))["actual"]
    assert any(f.startswith("Pendiente") for f in s["falta"])


def test_helada_en_cultivo_sensible():
    # girasol en septiembre: 9 de 30 años con helada no llega a 1 de cada 3 -> sin alerta
    s = por_id(correr())["C"]
    assert s["helada_conflicto"] == []


def test_funcion_pura_no_modifica_entradas():
    e, ind = entradas(), indicadores()
    e0, ind0 = copy.deepcopy(e), copy.deepcopy(ind)
    r1, r2 = correr(e, ind), correr(e, ind)
    assert e == e0 and ind == ind0 and r1 == r2


if __name__ == "__main__":
    pruebas = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in pruebas:
        t()
        print("ok ", t.__name__)
    print(f"{len(pruebas)} tests pasaron")
    for s in correr()["estrategias"]:
        print(f"\n{s['k']} {s['nombre']} ({s.get('especies', '')}): cercanía {s.get('cercania')}")
        print("  ", s["resumen"])
        if s["on"]:
            print("   agua", s["agua_por_tipo"], "suelo", s["suelo"], "erosión", s["erosion"], "ingreso", s["ingreso"])
            print("   mm normal", s["agua_mm"]["normal"], "| revisar:", s["revisar"])
