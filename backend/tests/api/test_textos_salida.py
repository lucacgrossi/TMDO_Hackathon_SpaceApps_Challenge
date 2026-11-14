"""Los textos del mock y de la demo precalculada: plurales bien escritos y signo menos tipográfico (−)."""
import json
import re
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[2] / "app"
ARCHIVOS = [APP / "api" / "mock_rio_cuarto.json", APP / "demo" / "rio_cuarto.json"]
GUION_ANTES_DE_NUMERO = re.compile(r"(?<![\w.])-(?=\d)")


def _textos(x, clave=""):
    if isinstance(x, str) and clave not in ("png", "valores"):
        yield x
    elif isinstance(x, list):
        for v in x:
            yield from _textos(v)
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _textos(v, k)


@pytest.mark.parametrize("archivo", ARCHIVOS, ids=lambda p: p.name)
def test_textos_sin_plurales_mal_escritos_ni_guion_como_menos(archivo):
    textos = list(_textos(json.loads(archivo.read_text(encoding="utf-8"))))
    assert not [t for t in textos if "normals" in t or "humedos" in t]
    assert not [t for t in textos if GUION_ANTES_DE_NUMERO.search(t)]
