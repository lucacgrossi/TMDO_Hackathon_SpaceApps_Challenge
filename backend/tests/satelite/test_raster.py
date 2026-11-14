import base64
import io

import numpy as np
import pytest
from PIL import Image

from app.satelite import escalas, grilla, raster
from app.satelite.lote import LOTE_EJEMPLO
from app.satelite.ndvi import UMBRAL_NDVI_BAJO


def _png(texto: str) -> np.ndarray:
    return np.array(Image.open(io.BytesIO(base64.b64decode(texto))).convert("RGBA"))


def _rgb(color: str) -> list[int]:
    return [int(color[i:i + 2], 16) for i in (1, 3, 5)]


def test_escalas_un_color_y_una_etiqueta_por_corte():
    for e in (escalas.NDVI, escalas.PENDIENTE, escalas.CULTIVO):
        assert len(e["cortes"]) == len(e["colores"]) == len(e["etiquetas"])
        assert e["cortes"] == sorted(e["cortes"])
    assert escalas.NDVI["cortes"] == [0, 0.15, 0.3, 0.45, 0.6, 0.75]
    assert escalas.UMBRAL_NDVI == UMBRAL_NDVI_BAJO and UMBRAL_NDVI_BAJO in escalas.NDVI["cortes"]
    assert escalas.PENDIENTE["cortes"] == [0, 1, 2.5, 4, 6]


def test_clases_por_piso():
    cortes = escalas.NDVI["cortes"]
    v = np.array([[-0.2, 0.0, 0.14, 0.15], [0.299, 0.3, 0.8, np.nan]])
    assert raster.clases(v, cortes).tolist() == [[0, 0, 0, 1], [1, 2, 5, 0]]


def test_png_transparente_fuera_de_la_mascara_y_color_de_la_clase():
    v = np.array([[0.5, 2.0, 7.0], [3.0, np.nan, 0.2]])
    m = np.array([[True, True, True], [False, True, True]])
    img = _png(raster.pintar(v, m, escalas.PENDIENTE))
    assert img.shape == (2, 3, 4)                          # fila 0 = norte: misma forma que el array
    assert img[1, 0, 3] == 0 and img[1, 1, 3] == 0         # fuera de la máscara y sin dato
    assert (img[[0, 0, 0, 1], [0, 1, 2, 2], 3] == 255).all()
    colores = escalas.PENDIENTE["colores"]
    assert img[0, 0, :3].tolist() == _rgb(colores[0])      # 0,5 % → < 1 %
    assert img[0, 1, :3].tolist() == _rgb(colores[1])      # 2,0 % → 1–2,5 %
    assert img[0, 2, :3].tolist() == _rgb(colores[4])      # 7,0 % → ≥ 6 %


def test_cuantizacion_ida_y_vuelta():
    rng = np.random.default_rng(0)
    v = rng.uniform(-1, 1, (30, 42))
    m = rng.random((30, 42)) > 0.2
    v[0, 0] = np.nan
    texto, factor, nodata = raster.cuantizar(v, m, 0.001)
    assert factor == 0.001 and nodata == -32768
    crudo = base64.b64decode(texto)
    assert len(crudo) == 30 * 42 * 2
    # int16 little-endian por filas: el primer entero es la fila 0 (norte), columna 0 (oeste)
    enteros = np.frombuffer(crudo, dtype="<i2").reshape(30, 42)
    j, i = np.argwhere(m & np.isfinite(v))[0]
    assert enteros[j, i] == round(v[j, i] / factor)
    vuelta = raster.descuantizar(texto, factor, nodata, 30, 42)
    validos = m & np.isfinite(v)
    assert np.isnan(vuelta[~validos]).all()
    assert np.abs(vuelta[validos] - v[validos]).max() < factor / 2


def test_cuantizacion_sube_el_factor_si_no_entra():
    v = np.array([[500.0, 1.0]])
    texto, factor, _ = raster.cuantizar(v, np.ones((1, 2), dtype=bool), 0.001)
    assert factor == pytest.approx(0.1)
    assert np.allclose(raster.descuantizar(texto, factor, -32768, 1, 2), [[500.0, 1.0]])


def test_resumen_solo_dentro_de_la_mascara():
    v = np.array([[1.0, 2.0], [100.0, np.nan]])
    m = np.array([[True, True], [False, True]])
    assert raster.resumen(v, m) == {"media": 1.5, "min": 1.0, "max": 2.0, "pixeles": 2}
    assert raster.resumen(v, np.zeros((2, 2), dtype=bool)) is None


def test_capa_con_la_forma_del_contrato():
    g = grilla.crear(LOTE_EJEMPLO)
    m = grilla.mascara(g, LOTE_EJEMPLO)
    v = np.full((g.alto, g.ancho), 0.4)
    c = raster.capa(id="ndvi", titulo="NDVI", unidad="", fuente="x", resolucion_nativa="30 m", grilla=g,
                    array=v, mascara=m, escala=escalas.NDVI, factor=0.001, confianza="alta", fecha="2025-07-27")
    claves = {"id", "titulo", "unidad", "fuente", "fecha", "campana", "resolucion_nativa", "resolucion_grilla",
              "bounds", "ancho", "alto", "png", "valores", "factor", "nodata", "escala", "resumen",
              "confianza", "nota"}
    assert set(c) == claves
    assert c["bounds"] == g.bounds and (c["ancho"], c["alto"]) == (g.ancho, g.alto)
    assert c["resumen"] == {"media": 0.4, "min": 0.4, "max": 0.4, "pixeles": int(m.sum())}
    assert c["escala"] == escalas.NDVI and c["escala"] is not escalas.NDVI
    with pytest.raises(ValueError):
        raster.capa(id="x", titulo="x", unidad="", fuente="x", resolucion_nativa="", grilla=g,
                    array=v[:-1], mascara=m[:-1], escala=escalas.NDVI, factor=1, confianza="alta")
