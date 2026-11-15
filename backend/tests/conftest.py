"""Fixtures de todos los tests del back."""

import pytest

from app.satelite import pc


@pytest.fixture(autouse=True)
def sin_cache_de_planetary_computer(monkeypatch):
    """La caché de respuestas de Planetary Computer (`pc._cache`) dura todo el proceso: con ella, un
    test que simula una caída después de un análisis bueno recibiría la respuesta guardada. Se apaga
    en todos los tests; `tests/satelite/test_pc.py` la prende para probarla."""
    pc.limpiar_cache()
    monkeypatch.setattr(pc, "CACHE_ACTIVA", False)
    yield
    pc.limpiar_cache()
