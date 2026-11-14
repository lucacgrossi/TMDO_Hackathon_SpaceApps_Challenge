from app.api.contrato import Capas, Indicador
from app.satelite import capas, elevacion, ndvi
from app.satelite.lote import LOTE_EJEMPLO

CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _mes(coleccion: str, ndvi_medio: float, mes: str) -> dict:
    return {"mes": mes, "fecha": f"{mes}-15", "ndvi_medio": ndvi_medio, "nubes_escena": 0.0,
            "coleccion": coleccion, "item": f"ITEM-{mes}", "fuente": "…", "pixeles": 1092}


def _ndvi(meses: list, valor: int | None = 3, confianza: str = "media") -> dict:
    return {
        "visto_por_satelite": {"campana": "2025/26", "meses": meses, "umbral": 0.3},
        "meses_cobertura_baja": {"valor": valor, "unidad": "meses", "fuente": "NASA HLS 30 m",
                                 "anios": "2025/26", "resolucion": "30 m", "confianza": confianza},
    }


def _pendiente(valor: float | None = 0.6, confianza: str = "alta") -> dict:
    return {"pendiente_general": {"valor": valor, "unidad": "%", "fuente": "NASADEM", "anios": "2000",
                                  "resolucion": "30 m", "confianza": confianza}}


# Índice 0 = enero. Julio (6), septiembre (8) y octubre (9) pelados; marzo (2) cayó a MODIS.
MESES = [_mes("hls2-s30", 0.6, f"2026-{m:02d}") for m in range(1, 7)] + \
        [_mes("hls2-l30", 0.5, f"2025-{m:02d}") for m in range(7, 13)]
MESES[2] = _mes("modis-13Q1-061", 0.69, "2026-03")
for i in (6, 8, 9):
    MESES[i]["ndvi_medio"] = 0.25


def test_lote_demo():
    r = capas.armar(_ndvi(MESES), _pendiente())
    Capas(**r)  # cumple el contrato

    nm = r["ndvi_mensual"]
    assert len(nm) == 12 and nm[2] is None  # MODIS → el front usa GIBS ese mes
    assert nm[6] == {"coleccion": "hls2-l30", "item": "ITEM-2025-07", "fecha": "2025-07-15"}

    ero = r["erosion"]
    assert CLAVES <= ero.keys()
    Indicador(**{k: v for k, v in ero.items() if k in Indicador.model_fields})
    assert ero["valor"] == 1.8 and ero["meses_bajos"] == [6, 8, 9]
    assert ero["confianza"] == "media"  # la peor entre alta (pendiente) y media (NDVI)
    assert "no es pérdida de suelo" in ero["nota"]
    assert r["no_disponibles"] == []


def test_sin_ndvi_no_hay_erosion():
    r = capas.armar(_ndvi([None] * 12, valor=None, confianza="sin_dato"), _pendiente())
    Capas(**r)
    assert r["ndvi_mensual"] == [None] * 12 and r["erosion"] is None
    assert set(r["no_disponibles"]) == {"erosion", "ndvi_mensual"}


def test_sin_pendiente_no_hay_erosion():
    r = capas.armar(_ndvi(MESES), _pendiente(valor=None, confianza="sin_dato"))
    assert r["erosion"] is None and r["no_disponibles"] == ["erosion"]
    assert r["ndvi_mensual"][0]["item"] == "ITEM-2026-01"


def test_entradas_rotas_no_rompen():
    for entrada in (None, {}, {"visto_por_satelite": {"meses": "x"}}):
        r = capas.armar(entrada, None)
        Capas(**r)
        assert r["erosion"] is None


def test_calcular_usa_ndvi_y_elevacion(monkeypatch):
    monkeypatch.setattr(ndvi, "calcular", lambda p: _ndvi(MESES))
    monkeypatch.setattr(elevacion, "calcular", lambda p: _pendiente())
    r = capas.calcular(LOTE_EJEMPLO)
    assert r["erosion"]["valor"] == 1.8 and len(r["ndvi_mensual"]) == 12
