import math

import numpy as np

from app.satelite import grilla
from app.satelite.lote import LOTE_EJEMPLO, area_ha

# Lote en L: un cuadrado de 6 × 6 píxeles sin el cuadrante noreste (3 × 3). Los vértices caen en
# bordes de píxel de la grilla de 1″, así que cada píxel queda entero adentro o entero afuera.
S = 1 / 3600
O0, N0 = (-231256 + 0.5) * S, (-119700 + 0.5) * S     # un borde de píxel de NASADEM


def _p(i: float, j: float) -> list[float]:
    """[lon, lat] a i píxeles al este y j píxeles al sur de (O0, N0)."""
    return [O0 + i * S, N0 - j * S]


LOTE_L = {"type": "Polygon", "coordinates": [[_p(0, 0), _p(3, 0), _p(3, 3), _p(6, 3), _p(6, 6), _p(0, 6), _p(0, 0)]]}


def test_lote_demo_alineado_a_nasadem():
    g = grilla.crear(LOTE_EJEMPLO)
    assert (g.ancho, g.alto, g.segundos) == (42, 30, 1) and g.nota is None
    # los bordes caen en (j + ½)″, como la tesela s34w065 de NASADEM (borde oeste −65° − ½″)
    for borde in g.bbox:
        assert abs(borde * 3600 - 0.5 - round(borde * 3600 - 0.5)) < 1e-6
    # la grilla cubre el polígono entero
    assert g.oeste <= -64.2381 and g.este >= -64.2268 and g.sur <= -33.2517 and g.norte >= -33.2436
    assert math.isclose(g.este - g.oeste, g.ancho * g.paso) and math.isclose(g.norte - g.sur, g.alto * g.paso)
    assert g.a_dict() == {"bounds": [[g.sur, g.oeste], [g.norte, g.este]], "ancho": 42, "alto": 30,
                          "paso": 1 / 3600}
    assert g.resolucion == "1″ (~30 m)"


def test_centros_fila_0_norte_columna_0_oeste():
    g = grilla.crear(LOTE_EJEMPLO)
    assert math.isclose(g.lats()[0], g.norte - g.paso / 2) and g.lats()[-1] < g.lats()[0]
    assert math.isclose(g.lons()[0], g.oeste + g.paso / 2) and g.lons()[-1] > g.lons()[0]


def test_mascara_en_l():
    g = grilla.crear(LOTE_L)
    assert (g.ancho, g.alto) == (6, 6)
    m = grilla.mascara(g, LOTE_L)
    esperado = np.ones((6, 6), dtype=bool)
    esperado[:3, 3:] = False                 # hueco al noreste (fila 0 = norte, columna 0 = oeste)
    assert (m == esperado).all()


def test_pixel_del_borde_se_decide_por_el_centro():
    # el lado este pasa a 0,4 píxeles del borde oeste de la columna 3: la columna 3 tiene el centro
    # afuera (queda fuera aunque el lote la toque) y, con 0,6, el centro adentro.
    for fraccion, columnas in ((0.4, 3), (0.6, 4)):
        poli = {"type": "Polygon", "coordinates": [[_p(0, 0), _p(3 + fraccion, 0), _p(3 + fraccion, 2),
                                                    _p(0, 2), _p(0, 0)]]}
        g = grilla.crear(poli)
        m = grilla.mascara(g, poli)
        assert g.ancho == 4 and m.sum(axis=1).tolist() == [columnas, columnas]


def test_lote_grande_pasa_a_2_segundos():
    # triángulo de ~11.600 ha: su bbox de 0,15° × 0,15° a 1″ son ~290.000 píxeles
    poli = {"type": "Polygon", "coordinates": [[[-64.4, -33.1], [-64.25, -33.1], [-64.4, -33.25], [-64.4, -33.1]]]}
    assert area_ha(poli) < 20_000
    g = grilla.crear(poli)
    assert g.segundos == 2 and g.pixeles <= grilla.MAX_PIXELES
    assert g.resolucion == "2″ (~60 m)" and "2″" in g.nota and "250.000" in g.nota
    assert math.isclose(g.paso, 2 / 3600)
    # los bordes siguen cayendo en bordes de NASADEM
    assert abs(g.oeste * 3600 - 0.5 - round(g.oeste * 3600 - 0.5)) < 1e-6


def test_ampliada_y_recortar():
    g = grilla.crear(LOTE_EJEMPLO)
    a = g.ampliada(5)
    assert (a.ancho, a.alto) == (52, 40) and math.isclose(a.oeste, g.oeste - 5 * g.paso)
    arr = np.arange(a.pixeles, dtype=float).reshape(a.alto, a.ancho)
    r = grilla.recortar(arr, 5)
    assert r.shape == (g.alto, g.ancho) and r[0, 0] == arr[5, 5]
    # los centros de la grilla recortada coinciden con los de la original
    assert np.allclose(a.lons()[5:-5], g.lons()) and np.allclose(a.lats()[5:-5], g.lats())
