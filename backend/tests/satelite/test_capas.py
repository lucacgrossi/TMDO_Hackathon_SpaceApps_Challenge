from app.api.contrato import Capas, Indicador
from app.satelite import capas, cobertura, elevacion, ndvi
from app.satelite.lote import LOTE_EJEMPLO

CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}


def _mapa(id_: str, grilla: dict, **resumen) -> dict:
    # Con el contrato de #63, `Capas` valida cada `CapaRaster` completa: los campos que el test no mira
    # van con valores mínimos válidos.
    return {"id": id_, "titulo": id_, "unidad": "", "fuente": "test", "resolucion_nativa": "30 m",
            "resolucion_grilla": "1″ (~30 m)", "bounds": grilla["bounds"], "ancho": grilla["ancho"],
            "alto": grilla["alto"], "png": "", "escala": {"cortes": [0], "colores": ["#000000"], "etiquetas": ["x"]},
            "confianza": "media",
            "resumen": {"media": None, "min": None, "max": None, "pixeles": 0, **resumen}}


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
    assert nm[6] == {"coleccion": "hls2-l30", "item": "ITEM-2025-07", "fecha": "2025-07-15", "mapa": None}

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


def test_ndvi_mensual_con_mapas():
    """El raster de cada mes va en ndvi_mensual[mes].mapa; un mes MODIS aparece si tiene raster."""
    mapas = [_mapa("ndvi", GRILLA, media=m["ndvi_medio"]) for m in MESES]
    mapas[4] = None                             # mayo: HLS sin raster → teselas del item
    mapas[7] = _mapa("ndvi", {**GRILLA, "alto": 31})  # agosto: fuera de la grilla → se descarta
    ndvi_r = {**_ndvi(MESES), "mapas": mapas, "grilla": GRILLA}
    r = capas.armar(ndvi_r, _pendiente())
    Capas(**r)
    nm = r["ndvi_mensual"]
    assert nm[2]["coleccion"] == "modis-13Q1-061" and nm[2]["mapa"]["resumen"]["media"] == 0.69
    assert nm[4]["mapa"] is None and nm[4]["item"] == "ITEM-2026-05"
    assert nm[7]["mapa"] is None and nm[6]["mapa"]["resumen"]["media"] == 0.25
    assert r["no_disponibles"] == []


def test_sin_ningun_raster_de_ndvi():
    r = capas.armar({**_ndvi(MESES), "mapas": [None] * 12, "grilla": GRILLA}, _pendiente())
    assert r["ndvi_mensual"][2] is None          # MODIS sin raster: el front usa GIBS
    assert r["no_disponibles"] == ["ndvi_mapa"]


def test_grilla_sale_del_ndvi_si_faltan_las_otras():
    mapas = [_mapa("ndvi", GRILLA) for _ in MESES]
    r = capas.armar({**_ndvi(MESES), "mapas": mapas, "grilla": GRILLA}, None)
    assert r["grilla"] == GRILLA and r["ndvi_mensual"][0]["mapa"]


def _capas_px(pendiente: float, meses: float, poligono=None, grilla_de=None):
    """Capas reales (raster.capa) de pendiente y meses bajos constantes sobre la grilla de un lote."""
    import numpy as np

    from app.satelite import escalas, grilla, raster
    from app.satelite.lote import LOTE_EJEMPLO
    poligono = poligono or LOTE_EJEMPLO
    g = grilla_de or grilla.crear(poligono)
    m = grilla.mascara(g, poligono)
    comun = {"grilla": g, "mascara": m, "fuente": "x", "resolucion_nativa": "30 m"}
    pend = raster.capa(id="pendiente", titulo="p", unidad="%", array=np.full((g.alto, g.ancho), pendiente),
                       escala=escalas.PENDIENTE, factor=0.01, confianza="media", **comun)
    bajos = raster.capa(id="meses_bajos", titulo="m", unidad="meses", array=np.full((g.alto, g.ancho), meses),
                        escala=escalas.MESES_BAJOS, factor=1.0, confianza="alta", **comun)
    return pend, bajos, g.a_dict(), int(m.sum())


LOTE_L = {"type": "Polygon", "coordinates": [[
    [-64.250, -33.248], [-64.244, -33.248], [-64.244, -33.254], [-64.235, -33.254],
    [-64.235, -33.260], [-64.250, -33.260], [-64.250, -33.248]]]}


def test_erosion_por_pixel_en_l():
    """Pendiente por píxel 2 % y 4 meses pelados en todo un lote en L: el mapa vale 8 en cada píxel, pero
    el valor del lote usa la pendiente general del plano (0,6 %): 0,6 × 4 = 2,4."""
    pend, bajos, g, pixeles = _capas_px(2.0, 4.0, LOTE_L)
    elev = {**_pendiente(), "mapa": pend, "grilla": g}
    r = capas.armar({**_ndvi(MESES), "meses_bajos_mapa": bajos, "grilla": g}, elev)
    Capas(**r)
    ero, mapa = r["erosion"], r["erosion_mapa"]
    assert mapa["resumen"]["media"] == ero["media_por_pixel"] == 8.0
    assert ero["valor"] == mapa["resumen"]["valor_lote"] == 2.4 and ero["meses_bajos_medio_pixel"] == 4.0
    assert mapa["resumen"]["pixeles"] == pixeles and mapa["bounds"] == g["bounds"]
    assert ero["metodo"] == "por_pixel" and ero["valor_con_pendiente_general"] == 1.8
    assert "pendiente general 0,6 %" in ero["nota"] and "ruidosa" in ero["nota"]
    assert ero["confianza"] == "media" and "no es pérdida de suelo" in ero["nota"]
    assert ero["meses_bajos"] == [6, 8, 9] and r["erosion_motivo"] is None and r["no_disponibles"] == []
    assert mapa["id"] == "erosion" and mapa["escala"]["cortes"] == [0.0, 2.0, 5.0, 10.0, 20.0]
    Indicador(**{k: v for k, v in ero.items() if k in Indicador.model_fields})


def test_erosion_sin_meses_bajos_por_pixel_usa_el_lote():
    pend, _, g, _ = _capas_px(2.0, 3.0)
    ndvi_r = {**_ndvi(MESES), "meses_bajos_mapa": None, "meses_bajos_motivo": "x", "grilla": g}
    r = capas.armar(ndvi_r, {**_pendiente(), "mapa": pend, "grilla": g})
    assert r["erosion"]["valor"] == 1.8 and r["erosion"]["metodo"] == "lote" and r["erosion_mapa"] is None
    assert r["no_disponibles"] == ["erosion_mapa"] and r["erosion_motivo"]


def test_erosion_capas_en_grillas_distintas_usa_el_lote():
    from app.satelite import grilla
    from app.satelite.lote import LOTE_EJEMPLO
    pend, _, g, _ = _capas_px(2.0, 3.0)
    otra = grilla.crear(LOTE_EJEMPLO).ampliada(1)
    _, bajos, _, _ = _capas_px(2.0, 3.0, grilla_de=otra)
    r = capas.armar({**_ndvi(MESES), "meses_bajos_mapa": bajos, "grilla": g}, {**_pendiente(), "mapa": pend, "grilla": g})
    assert r["erosion"]["metodo"] == "lote" and r["erosion_mapa"] is None and "grilla" in r["erosion_motivo"]


def test_erosion_sin_valores_de_pendiente_usa_el_lote():
    pend, bajos, g, _ = _capas_px(2.0, 3.0)
    r = capas.armar({**_ndvi(MESES), "meses_bajos_mapa": bajos, "grilla": g},
                    {**_pendiente(), "mapa": {**pend, "valores": None}, "grilla": g})
    assert r["erosion"]["metodo"] == "lote" and r["erosion_mapa"] is None


def test_erosion_del_lote_usa_la_media_de_meses_por_pixel():
    """Mitad del lote con 2 meses bajos y mitad con 6: el lote suma 0,6 % × 4 meses de promedio = 2,4."""
    import numpy as np

    from app.satelite import escalas, grilla, raster
    from app.satelite.lote import LOTE_EJEMPLO
    pend, _, g, _ = _capas_px(1.5, 0.0)
    gg = grilla.desde_dict(g)
    m = grilla.mascara(gg, LOTE_EJEMPLO)
    meses = np.where(np.arange(gg.ancho)[None, :] < 20, 2.0, 6.0) * np.ones((gg.alto, 1))
    m[:, 40:] = False                     # 20 columnas con 2 meses y 20 con 6, todas dentro del lote
    assert m[:, :20].sum() == m[:, 20:40].sum() > 0
    bajos = raster.capa(id="meses_bajos", titulo="m", unidad="meses", fuente="x", resolucion_nativa="30 m",
                        grilla=gg, array=meses, mascara=m, escala=escalas.MESES_BAJOS, factor=1.0,
                        confianza="alta")
    r = capas.armar({**_ndvi(MESES), "meses_bajos_mapa": bajos, "grilla": g},
                    {**_pendiente(), "mapa": pend, "grilla": g})
    assert r["erosion"]["meses_bajos_medio_pixel"] == 4.0 and r["erosion"]["valor"] == 2.4
    assert r["erosion_mapa"]["resumen"]["media"] == 6.0   # 1,5 % × 4 meses de promedio


# --- Reporte QA del 15/11 ---------------------------------------------------------------------------

def test_nota_de_erosion_sin_referencias_internas():
    """H-012: la nota de la erosión por píxel decía "a validar por la persona 3"."""
    pend, bajos, g, _ = _capas_px(2.0, 4.0, LOTE_L)
    elev = {**_pendiente(), "mapa": pend, "grilla": g}
    r = capas.armar({**_ndvi(MESES), "meses_bajos_mapa": bajos, "grilla": g}, elev)
    for texto in (r["erosion"]["nota"], r["erosion_mapa"]["nota"]):
        assert "persona" not in texto and "a validar" not in texto
    assert "Escala de clases provisoria" in r["erosion"]["nota"]


def test_nota_de_erosion_del_lote_con_un_mes_en_singular():
    """H-017: "× 1 meses" → "× 1 mes"."""
    ndvi_1 = _ndvi(MESES, valor=1)
    ero = capas.erosion(ndvi_1["visto_por_satelite"], ndvi_1["meses_cobertura_baja"], _pendiente()["pendiente_general"])
    assert "× 1 mes con NDVI" in ero["nota"] and "1 meses" not in ero["nota"]
