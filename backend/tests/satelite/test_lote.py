from app.satelite import lote
from app.satelite.lote import LOTE_EJEMPLO


def _poligono(pts):
    return {"type": "Polygon", "coordinates": [pts]}


def test_lote_ejemplo_valido():
    r = lote.validar(LOTE_EJEMPLO)
    assert r["ok"] and r["motivo"] is None
    assert 94 < r["area_ha"] < 96          # el prototipo muestra ~95 ha
    lat, lon = r["centro"]
    assert abs(lat - -33.2477) < 0.001 and abs(lon - -64.2325) < 0.001
    assert r["bbox"] == [-64.2381, -33.2517, -64.2268, -33.2436]


def test_anillo_abierto_se_cierra():
    abierto = _poligono(LOTE_EJEMPLO["coordinates"][0][:-1])
    r = lote.validar(abierto)
    assert r["ok"]
    anillo = r["poligono"]["coordinates"][0]
    assert anillo[0] == anillo[-1] and len(anillo) == 5


def test_lote_en_l_es_valido_y_mas_chico():
    l = _poligono([[-64.2381, -33.2436], [-64.2320, -33.2436], [-64.2320, -33.2480],
                   [-64.2268, -33.2480], [-64.2268, -33.2517], [-64.2381, -33.2517]])
    r = lote.validar(l)
    assert r["ok"] and r["area_ha"] < lote.validar(LOTE_EJEMPLO)["area_ha"]


def test_lineas_cruzadas():
    mono = _poligono([[-64.2381, -33.2436], [-64.2268, -33.2517], [-64.2268, -33.2436], [-64.2381, -33.2517]])
    r = lote.validar(mono)
    assert not r["ok"] and "cruzan" in r["motivo"]


def test_muy_chico_y_muy_grande():
    chico = _poligono([[-64.2300, -33.2400], [-64.2295, -33.2400], [-64.2295, -33.2405], [-64.2300, -33.2405]])
    assert "mínimo" in lote.validar(chico)["motivo"]
    grande = _poligono([[-64.5, -33.0], [-64.0, -33.0], [-64.0, -33.5], [-64.5, -33.5]])
    r = lote.validar(grande)
    assert not r["ok"] and "máximo" in r["motivo"] and "20.000" in r["motivo"]


def test_geojson_roto_no_lanza():
    for malo in [None, {}, {"type": "Point", "coordinates": [0, 0]}, {"type": "Polygon"},
                 _poligono([[0, 0], [1, 1]]), _poligono([["a", 0], [1, 1], [1, 0]]),
                 _poligono([[200, 0], [1, 1], [1, 0]])]:
        r = lote.validar(malo)
        assert r["ok"] is False and r["motivo"]
