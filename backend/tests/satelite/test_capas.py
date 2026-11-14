from app.api.contrato import Capas, Indicador
from app.satelite import capas, cobertura, elevacion, ndvi
from app.satelite.lote import LOTE_EJEMPLO

CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _mapa(id_: str, grilla: dict, **resumen) -> dict:
    return {"id": id_, "bounds": grilla["bounds"], "ancho": grilla["ancho"], "alto": grilla["alto"],
            "resumen": resumen}


GRILLA = {"bounds": [[-33.2518, -64.2382], [-33.2435, -64.2265]], "ancho": 42, "alto": 30, "paso": 1 / 3600}


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
    """Resultado de elevacion.calcular: con valor, también trae la capa sobre la grilla."""
    con_capa = valor is not None
    return {"pendiente_general": {"valor": valor, "unidad": "%", "fuente": "NASADEM", "anios": "2000",
                                  "resolucion": "30 m", "confianza": confianza},
            "mapa": _mapa("pendiente", GRILLA) if con_capa else None, "grilla": GRILLA if con_capa else None}


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
    assert r["erosion"] is None and r["no_disponibles"] == ["erosion", "pendiente_mapa"]
    assert r["ndvi_mensual"][0]["item"] == "ITEM-2026-01"


def test_entradas_rotas_no_rompen():
    for entrada in (None, {}, {"visto_por_satelite": {"meses": "x"}}):
        r = capas.armar(entrada, None)
        Capas(**r)
        assert r["erosion"] is None


def test_calcular_usa_ndvi_elevacion_y_cobertura(monkeypatch):
    monkeypatch.setattr(ndvi, "calcular", lambda p: _ndvi(MESES))
    monkeypatch.setattr(elevacion, "calcular", lambda p: _pendiente())
    monkeypatch.setattr(cobertura, "calcular", lambda p: {"mapa": None})
    r = capas.calcular(LOTE_EJEMPLO)
    assert r["erosion"]["valor"] == 1.8 and len(r["ndvi_mensual"]) == 12


def test_rasters_de_pendiente_y_cultivo():
    elev = {**_pendiente(), "mapa": _mapa("pendiente", GRILLA, media=1.3), "grilla": GRILLA}
    cob = {"mapa": _mapa("cultivo", GRILLA, media=93.9), "grilla": GRILLA}
    r = capas.armar(_ndvi(MESES), elev, cob)
    Capas(**r)
    assert r["pendiente_mapa"]["id"] == "pendiente" and r["cultivo_mapa"]["id"] == "cultivo"
    assert r["grilla"] == GRILLA and r["no_disponibles"] == []


def test_capa_fuera_de_la_grilla_se_descarta():
    otra = {**GRILLA, "ancho": 41}
    elev = {**_pendiente(), "mapa": _mapa("pendiente", GRILLA), "grilla": GRILLA}
    cob = {"mapa": _mapa("cultivo", otra), "grilla": otra}
    r = capas.armar(_ndvi(MESES), elev, cob)
    assert r["pendiente_mapa"] and r["cultivo_mapa"] is None and r["no_disponibles"] == ["cultivo_mapa"]


def test_sin_cobertura_no_figura_como_faltante():
    """Mientras el servicio no pase cobertura, la capa de cultivo no se pidió: no va a no_disponibles."""
    r = capas.armar(_ndvi(MESES), _pendiente())
    assert r["cultivo_mapa"] is None and r["pendiente_mapa"]["id"] == "pendiente" and r["grilla"] == GRILLA
    assert r["no_disponibles"] == []
