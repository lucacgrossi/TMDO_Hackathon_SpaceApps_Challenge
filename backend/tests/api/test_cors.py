"""CORS de la API: orígenes fijos (CORS_ORIGINS) y, opcional, por expresión regular (CORS_ORIGIN_REGEX)."""
import importlib

import pytest
from fastapi.testclient import TestClient

import app.main

pytestmark = pytest.mark.enable_socket


@pytest.fixture
def cliente(monkeypatch):
    def armar(**env):
        for k in ("CORS_ORIGINS", "CORS_ORIGIN_REGEX"):
            monkeypatch.delenv(k, raising=False)
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        return TestClient(importlib.reload(app.main).app)

    yield armar
    monkeypatch.undo()
    importlib.reload(app.main)  # deja la app como la importan los demás tests


def _origen_permitido(c: TestClient, origen: str) -> str | None:
    r = c.options("/analizar", headers={"Origin": origen, "Access-Control-Request-Method": "POST",
                                        "Access-Control-Request-Headers": "content-type"})
    return r.headers.get("access-control-allow-origin")


def test_por_defecto_solo_el_front_local(cliente):
    c = cliente()
    assert _origen_permitido(c, "http://localhost:3000") == "http://localhost:3000"
    assert _origen_permitido(c, "https://field-shift.vercel.app") is None


def test_regex_acepta_las_urls_de_vercel(cliente):
    c = cliente(CORS_ORIGINS="https://fieldshift.com.ar", CORS_ORIGIN_REGEX=r"https://.*\.vercel\.app")
    assert _origen_permitido(c, "https://fieldshift.com.ar") == "https://fieldshift.com.ar"
    assert _origen_permitido(c, "https://field-shift-git-dev-equipo.vercel.app") is not None
    assert _origen_permitido(c, "https://otro.com") is None
    assert _origen_permitido(c, "http://localhost:3000") is None
