"""Respuesta precalculada del lote de ejemplo (`app/demo/rio_cuarto.json`) y su script."""
import importlib.util
import json
from pathlib import Path

import pytest

from app import servicio
from app.api import rutas
from app.api.contrato import Entrada, Salida

BACKEND = Path(__file__).resolve().parents[2]
DEMO = BACKEND / "app" / "demo" / "rio_cuarto.json"
ENTRADA = BACKEND / "tests" / "ejemplos" / "entrada_demo.json"


def _script():
    spec = importlib.util.spec_from_file_location("precalcular_demo", BACKEND / "scripts" / "precalcular_demo.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _demo() -> Salida:
    return Salida.model_validate(json.loads(DEMO.read_text(encoding="utf-8")))


def _entrada() -> Entrada:
    return Entrada.model_validate(json.loads(ENTRADA.read_text(encoding="utf-8")))


def test_json_demo_cumple_el_contrato():
    s = _demo()
    assert s.es_mock is False  # `rutas.salida_demo` lo marca al servirlo
    assert len(s.estrategias) == 4 and [e.id for e in s.estrategias] == ["actual", "A", "B", "C"]
    assert 90 <= s.lote.area_ha <= 100
    assert 0.4 <= s.lote.pendiente_pct.valor <= 0.8  # ~0,6 % en el lote demo


def test_json_demo_trae_el_satelite_para_andar_sin_internet():
    s = _demo()
    vps = s.visto_por_satelite
    assert len(vps.meses) == 12 and vps.meses_con_dato >= 10
    assert len(s.capas.ndvi_mensual) == 12 and any(s.capas.ndvi_mensual)
    assert s.capas.erosion is not None and s.capas.erosion["valor"] is not None
    # El NDVI y el clima terminan en la misma campaña.
    assert s.periodo_clima.endswith(vps.campana)


def test_rutas_sirve_el_json_demo_y_no_el_mock():
    s = rutas.salida_demo(_entrada())
    assert s.es_mock is True and s.informacion_falta[0] == rutas.AVISO_DEMO
    assert s.visto_por_satelite == _demo().visto_por_satelite


def test_script_escribe_lo_que_devuelve_el_servicio(tmp_path, monkeypatch):
    monkeypatch.setattr(servicio, "analizar", lambda entrada: _demo())
    destino = tmp_path / "demo.json"
    assert _script().precalcular(ENTRADA, destino) == 0
    assert Salida.model_validate(json.loads(destino.read_text(encoding="utf-8"))) == _demo()


def test_script_no_escribe_si_falta_una_fuente(tmp_path, monkeypatch):
    s = _demo()
    s.lote.pendiente_pct = s.lote.pendiente_pct.model_copy(
        update={"valor": None, "confianza": "sin_dato", "motivo": "NASADEM no respondió"})
    monkeypatch.setattr(servicio, "analizar", lambda entrada: s)
    destino = tmp_path / "demo.json"
    script = _script()
    assert script.precalcular(ENTRADA, destino) == 1 and not destino.exists()
    assert script.precalcular(ENTRADA, destino, forzar=True) == 0 and destino.exists()


@pytest.mark.parametrize("es_mock", [True, False])
def test_script_no_escribe_el_mock_ni_con_power_caido(tmp_path, monkeypatch, es_mock):
    if es_mock:
        monkeypatch.setattr(servicio, "analizar", lambda entrada: _demo().model_copy(update={"es_mock": True}))
    else:
        def caido(entrada):
            raise servicio.ErrorServicio(503, "NASA POWER no responde", power_caido=True)
        monkeypatch.setattr(servicio, "analizar", caido)
    destino = tmp_path / "demo.json"
    assert _script().precalcular(ENTRADA, destino) == 1 and not destino.exists()
