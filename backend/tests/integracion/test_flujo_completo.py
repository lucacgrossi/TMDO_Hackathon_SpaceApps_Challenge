"""Integración de punta a punta del back (ver `conftest.py`).

Cada test sigue un pedido real por todos los servicios y verifica que lo que uno produce es lo
que el siguiente usa: POWER → indicadores → probabilidades / motor; satélite → visto por satélite
→ capas → erosión; planilla → parser → contraste + mezcla del motor.
"""

from __future__ import annotations

import copy
import json

import pytest

from app.api.contrato import Salida
from app.clima import power
from tests.integracion.conftest import FIX_POWER, RED

pytestmark = pytest.mark.enable_socket  # TestClient usa un socketpair local, no internet

ESCALAS_PRIORIDAD = {"agua": 5, "suelo": 1, "ingreso": 3, "erosion": 2}


def _analizar(cliente, entrada: dict) -> dict:
    r = cliente.post("/analizar", json=entrada)
    assert r.status_code == 200, r.text
    salida = r.json()
    Salida.model_validate(salida)  # la respuesta cumple el contrato
    return salida


def _serie_power():
    return power.armar_serie(json.loads(FIX_POWER.read_text(encoding="utf-8")))


def _csv_planilla(factor: float, campanas: int = 6, t_min: float | None = None,
                  t_max: float | None = None) -> bytes:
    """Planilla mensual tipo Excel en español (`;` y coma decimal) a partir de POWER × factor."""
    serie = _serie_power()
    columnas = ["mes", "lluvia_mm"] + (["t_min_c", "t_max_c"] if t_min is not None else [])
    filas = [";".join(columnas)]
    for c in serie.campanas[-campanas:]:
        for m in [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]:  # julio → junio
            anio = c.anio_inicio if m >= 6 else c.anio_inicio + 1
            fila = [f"{anio}-{m + 1:02d}", f"{c.lluvia_mm[m] * factor:.1f}".replace(".", ",")]
            if t_min is not None:
                frio = m in (4, 5, 6, 7)  # mayo a agosto
                fila += [f"{t_min if frio else 12.0:.1f}".replace(".", ","), f"{t_max:.1f}".replace(".", ",")]
            filas.append(";".join(fila))
    return ("\n".join(filas) + "\n").encode("utf-8")


def _subir(cliente, contenido: bytes):
    return cliente.post("/mediciones/planilla", files={"archivo": ("registro.csv", contenido, "text/csv")})


def _probabilidades(salida: dict) -> dict:
    """(evento, mes, cultivo) → (años, de, %) de todas las columnas."""
    return {(p["evento"], p["mes"], p["cultivo"]): (p["anios"], p["de"], p["pct"])
            for e in salida["estrategias"] for p in e["probabilidades"]}


# --- 1. Cadena completa sin mediciones ---------------------------------------------------------

def test_analizar_recorre_todos_los_servicios(cliente, entrada_demo):
    s = _analizar(cliente, entrada_demo)

    assert s["es_mock"] is False
    # Cada servicio externo se consultó, y ninguno respondió "no encontrado".
    assert RED["nasa_power"] == 1
    assert RED["pc_grilla:nasadem"] == 1          # pendiente sobre la grilla común
    assert RED["pc_grilla:esa-worldcover"] == 1   # cultivo sobre la grilla común
    assert RED["pc_recorte:modis-16A3GF-061"] >= 1
    assert RED["pc_busqueda:hls2-s30"] == 12
    assert RED["pc_404"] == 0
    assert RED["aws_terrain"] == 0                # con NASADEM respondiendo, no hace falta el respaldo
    assert s["informacion_falta"] == []


def test_clima_y_satelite_usan_la_misma_campana(cliente, entrada_demo):
    """POWER define la campaña de toda la salida: serie, NDVI y capas terminan en la misma."""
    s = _analizar(cliente, entrada_demo)
    ultima = s["serie_anual"]["campanas"][-1]["campana"]

    assert s["periodo_clima"].endswith(ultima)
    assert s["visto_por_satelite"]["campana"] == ultima
    anio_inicio = int(ultima[:4])
    for i, mes in enumerate(s["visto_por_satelite"]["meses"]):
        if mes is None:
            continue
        anio = anio_inicio if i >= 6 else anio_inicio + 1  # índice 0 = enero; campaña julio–junio
        assert mes["fecha"].startswith(f"{anio}-{i + 1:02d}"), (i, mes["fecha"])


def test_capas_del_mapa_salen_de_lo_que_vio_el_satelite(cliente, entrada_demo):
    """La escena de cada mes del mapa es la misma de "visto por satélite" (no se busca de nuevo)."""
    s = _analizar(cliente, entrada_demo)
    for mes, capa in zip(s["visto_por_satelite"]["meses"], s["capas"]["ndvi_mensual"], strict=True):
        if capa is None:
            continue
        assert mes is not None
        assert (capa["coleccion"], capa["item"], capa["fecha"]) == (mes["coleccion"], mes["item"], mes["fecha"])
    assert s["indicadores"]["riesgo_erosion"]["valor"] is not None


def test_capas_armonizadas_coinciden_con_la_tabla(cliente, entrada_demo):
    """El back calcula y el front dibuja: todas las capas en la misma grilla, y el número de la
    tabla es el `valor_lote` de su capa (docs/plan-armonizacion-capas.md)."""
    s = _analizar(cliente, entrada_demo)
    capas = s["capas"]
    grilla = capas["grilla"]
    assert grilla is not None

    rasters = [capas["pendiente_mapa"], capas["cultivo_mapa"]]
    rasters += [m["mapa"] for m in capas["ndvi_mensual"] if m and m.get("mapa")]
    assert capas["pendiente_mapa"] and capas["cultivo_mapa"] and len(rasters) > 2
    for r in rasters:
        assert (r["bounds"], r["ancho"], r["alto"]) == (grilla["bounds"], grilla["ancho"], grilla["alto"]), r["id"]
        assert r["png"] and r["escala"]["cortes"]

    assert capas["pendiente_mapa"]["resumen"]["valor_lote"] == pytest.approx(s["lote"]["pendiente_pct"]["valor"])
    assert capas["cultivo_mapa"]["resumen"]["valor_lote"] == pytest.approx(
        s["lote"]["cobertura_agricola_pct"]["valor"], abs=0.1)
    for mes, capa in zip(s["visto_por_satelite"]["meses"], capas["ndvi_mensual"], strict=True):
        if mes and capa and capa.get("mapa"):
            assert capa["mapa"]["resumen"]["valor_lote"] == pytest.approx(mes["ndvi_medio"], abs=0.001)


def test_valores_del_lote_con_datos_reales(cliente, entrada_demo):
    """Los módulos reales de satélite y clima, con las respuestas guardadas del lote de ejemplo."""
    s = _analizar(cliente, entrada_demo)
    ind = s["indicadores"]
    assert s["lote"]["pendiente_pct"]["valor"] == pytest.approx(0.6, abs=0.1)
    assert "NASADEM" in s["lote"]["pendiente_pct"]["fuente"]
    assert s["lote"]["cobertura_agricola_pct"]["valor"] == pytest.approx(94, abs=1)
    assert ind["et_real_anual"]["valor"] == 607
    assert ind["lluvia_anual"]["valor"] == 819
    for nombre, indicador in ind.items():
        assert {"valor", "unidad", "fuente", "resolucion", "confianza"} <= indicador.keys(), nombre


def test_motor_arma_las_cuatro_columnas_con_probabilidades(cliente, entrada_demo):
    s = _analizar(cliente, entrada_demo)
    ids = [e["id"] for e in s["estrategias"]]
    assert ids == ["actual", "A", "B", "C"]
    for e in s["estrategias"]:
        if not e["disponible"]:
            continue
        assert e["puntos"] is not None and e["cercania"] is not None
        assert e["evidencia"] and e["por_que"]
        for p in e["probabilidades"]:
            assert p["de"] == 30 and 0 <= p["anios"] <= 30  # frecuencia en las 30 campañas de POWER
    assert any(e["probabilidades"] for e in s["estrategias"])


def test_cercania_usa_las_prioridades_al_cuadrado(cliente, entrada_demo):
    """RF13: con los `puntos` de la salida, Σ p²·v / Σ p² da la cercanía que manda el back."""
    entrada = {**entrada_demo, "prioridades": ESCALAS_PRIORIDAD}
    s = _analizar(cliente, entrada)
    pesos = {k: v**2 for k, v in ESCALAS_PRIORIDAD.items()}
    for e in s["estrategias"]:
        if not e["disponible"]:
            continue
        pts = e["puntos"]
        v = {"agua": pts["agua"]["normal"], "suelo": pts["suelo"], "erosion": pts["erosion"], "ingreso": pts["ingreso"]}
        esperado = round(sum(pesos[k] * v[k] for k in pesos) / sum(pesos.values()))
        assert e["cercania"] == pytest.approx(esperado, abs=1), e["id"]


# --- 2. Planilla del productor → parser → contraste + motor ------------------------------------

def test_planilla_de_lluvia_llega_al_contraste_y_al_motor(cliente, entrada_demo):
    base = _analizar(cliente, entrada_demo)

    r = _subir(cliente, _csv_planilla(factor=0.8))
    assert r.status_code == 200, r.text
    planilla = r.json()
    assert planilla["ok"] is True
    assert len(planilla["serie"]["campanas_completas"]["lluvia_mm"]) == 6
    assert planilla["serie"]["formato"]["decimal"] == ","

    entrada = copy.deepcopy(entrada_demo)
    entrada["mediciones_propias"] = {"serie_mensual": planilla["serie"]["meses"]}
    s = _analizar(cliente, entrada)

    # Contraste: en las mismas 6 campañas, 20 % menos que NASA → confianza baja en agua.
    fila = next(c for c in s["contraste_mediciones"] if c["indicador"] == "lluvia_anual")
    assert len(fila["campanas_comparadas"]) == 6
    assert fila["diferencia_pct"] == pytest.approx(-20, abs=1)
    assert fila["confianza_resultante"] == "baja"
    assert s["indicadores"]["lluvia_anual"]["confianza"] == "baja"

    # Motor: la lluvia del productor entra en los puntajes de agua y la evidencia lo dice.
    actual_base = base["estrategias"][0]
    actual = s["estrategias"][0]
    assert actual["puntos"]["agua"] != actual_base["puntos"]["agua"]
    assert any("%" in t and ("pluvi" in t.lower() or "registro" in t.lower()) for t in actual["evidencia"])

    # Las probabilidades salen solo de las 30 campañas de NASA: para el mismo evento, mes y cultivo
    # son idénticas con y sin planilla. (La planilla sí puede cambiar la especie que elige el motor:
    # con menos lluvia de invierno, B pasa de trigo a cebada, como dice la regla del MVP.)
    con, sin = _probabilidades(s), _probabilidades(base)
    comunes = con.keys() & sin.keys()
    assert comunes
    assert all(con[k] == sin[k] for k in comunes)


def test_planilla_con_temperaturas_contrasta_heladas(cliente, entrada_demo):
    r = _subir(cliente, _csv_planilla(factor=1.0, t_min=-4.0, t_max=30.0))
    assert r.status_code == 200, r.text
    serie = r.json()["serie"]
    assert set(serie["variables"]) == {"lluvia_mm", "t_min_c", "t_max_c"}

    entrada = copy.deepcopy(entrada_demo)
    entrada["mediciones_propias"] = {"serie_mensual": serie["meses"]}
    s = _analizar(cliente, entrada)
    heladas = [c for c in s["contraste_mediciones"] if c["indicador"] == "helada"]
    assert heladas, s["contraste_mediciones"]
    assert all(c.get("mes") is not None for c in heladas)


# --- 3. Errores y caídas: la API responde con algo útil ------------------------------------------

@pytest.mark.parametrize("prioridad", [0, 6])
def test_prioridades_fuera_de_1_a_5_dan_422(cliente, entrada_demo, prioridad):
    entrada = {**entrada_demo, "prioridades": {**entrada_demo["prioridades"], "agua": prioridad}}
    assert cliente.post("/analizar", json=entrada).status_code == 422


def test_planilla_invalida_da_422_con_errores(cliente):
    r = _subir(cliente, "mes;lluvia_mm\n2023-01;10\n2023-01;12\n".encode())
    assert r.status_code == 422
    assert r.json()["ok"] is False and r.json()["errores"]


def test_planilla_de_mas_de_1_mb_da_413(cliente):
    assert _subir(cliente, b"x" * (1024 * 1024 + 1)).status_code == 413


def test_planetary_computer_caido_no_rompe_el_analisis(cliente, entrada_demo, red_nasa):
    red_nasa["pc"]["caido"] = True
    s = _analizar(cliente, entrada_demo)
    assert [e["id"] for e in s["estrategias"]] == ["actual", "A", "B", "C"]
    assert s["informacion_falta"], "lo satelital que falló tiene que ir a 'Información que falta'"
    assert s["lote"]["pendiente_pct"]["valor"] is not None  # AWS Terrain de respaldo
    assert RED["aws_terrain"] >= 1


def test_power_caido_con_lote_de_ejemplo_devuelve_la_demo(cliente, entrada_demo, red_nasa):
    red_nasa["power_caido"] = True
    s = _analizar(cliente, entrada_demo)
    assert s["es_mock"] is True


def test_power_caido_con_lote_dibujado_da_503(cliente, entrada_demo, red_nasa):
    red_nasa["power_caido"] = True
    entrada = copy.deepcopy(entrada_demo)
    entrada["lote"]["tipo"] = "dibujado"
    r = cliente.post("/analizar", json=entrada)
    assert r.status_code == 503
    assert "POWER" in r.json()["mensaje"]
