"""CapaRaster y GrillaLote en el contrato (docs/plan-armonizacion-capas.md, sección 5). Sin red."""

import base64
import io

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from app.api.contrato import Capas, CapaRaster, EscalaCapa, GrillaLote
from app.api.mock import salida_mock


@pytest.fixture(scope="module")
def capas() -> Capas:
    return salida_mock().capas


def _valores(c: CapaRaster) -> np.ndarray:
    return np.frombuffer(base64.b64decode(c.valores), dtype="<i2").reshape(c.alto, c.ancho)


def test_el_mock_trae_grilla_y_capas_de_ejemplo(capas):
    assert capas.grilla is not None and capas.grilla.paso == pytest.approx(1 / 3600)
    assert {c.id for c in capas.capas_raster()} == {"pendiente", "cultivo"}
    assert capas.erosion_mapa is None


def test_todas_las_capas_coinciden_con_la_grilla(capas):
    g = capas.grilla
    for c in capas.capas_raster():
        assert (c.bounds, c.ancho, c.alto) == (g.bounds, g.ancho, g.alto), c.id


def test_valores_int16_little_endian_fila_0_norte(capas):
    c = capas.pendiente_mapa
    v = _valores(c)
    assert v.shape == (c.alto, c.ancho)
    dentro = v[v != c.nodata] * c.factor
    assert dentro.size == c.resumen.pixeles
    assert dentro.mean() == pytest.approx(c.resumen.media, abs=c.factor)
    # En el mock la pendiente crece hacia el sureste: la última fila (sur) es más empinada que la primera (norte).
    filas = [f[f != c.nodata] for f in v if (f != c.nodata).any()]  # los bordes de la grilla quedan fuera del lote
    assert filas[-1].mean() > filas[0].mean()
    assert (v[0] == c.nodata).all()  # fila 0 = norte: la grilla se ajusta hacia afuera a múltiplos de 1″


def test_png_tiene_el_tamano_de_la_grilla(capas):
    for c in capas.capas_raster():
        img = Image.open(io.BytesIO(base64.b64decode(c.png)))
        assert img.size == (c.ancho, c.alto) and img.mode == "RGBA", c.id


def test_escala_con_una_entrada_por_clase(capas):
    e = capas.pendiente_mapa.escala
    assert len(e.cortes) == len(e.colores) == len(e.etiquetas) == 5
    with pytest.raises(ValidationError, match="mismo largo"):
        EscalaCapa(cortes=[0, 1], colores=["#000000"], etiquetas=["a", "b"])


@pytest.mark.parametrize("bounds", [[[-33.0, -64.0]], [[-33.0, -64.0], [-34.0, -63.0]], [[-33, -64], [-32, -65]]])
def test_bounds_invalidos_fallan(bounds):
    with pytest.raises(ValidationError, match="bounds"):
        GrillaLote(bounds=bounds, ancho=10, alto=10, paso=1 / 3600)


def test_capas_sin_los_campos_nuevos_siguen_validando():
    """Aditivo: una respuesta de antes (sin grilla ni mapas) sigue siendo válida."""
    c = Capas(ndvi_mensual=[None] * 12)
    assert c.grilla is None and c.pendiente_mapa is None and c.capas_raster() == []
