import io
import json
from datetime import date
from pathlib import Path

import httpx
import numpy as np

from app.satelite import grilla, ndvi, pc, raster
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}
CLAVES_MES = {"fecha", "ndvi_medio", "nubes_escena", "coleccion", "item", "fuente", "pixeles"}


def _leer(nombre: str):
    return json.loads((FIX / nombre).read_text(encoding="utf-8"))


def _npy(arr: np.ndarray) -> bytes:
    b = io.BytesIO()
    np.save(b, arr)
    return b.getvalue()


def _hls_grilla() -> bytes:
    """HLS S30 del 27/07/2024 sobre la grilla del lote demo (real). La fixture guarda NDVI × 10000 en
    int16 para pesar 5 KB; Planetary Computer lo manda en float64 (banda + máscara)."""
    a = np.load(FIX / "grilla_hls_s30_2024209.npy")
    return _npy(np.stack([a[0] / 10000, a[1].astype(float)]))


def _servidor(hls_vacio: tuple[str, ...] = (), fiabilidad: dict | None = None, en_grilla: bool = True,
              fiabilidad_grilla: np.ndarray | None = None, pedidos: list | None = None):
    """Planetary Computer falso con respuestas reales de julio de 2024 (fixtures).

    hls_vacio: meses "AAAA-MM" en los que la búsqueda HLS no devuelve escenas.
    fiabilidad: respuesta que reemplaza a las estadísticas de `pixel_reliability`.
    en_grilla: si es False, los rasters sobre la grilla (`item/bbox`) dan 404.
    fiabilidad_grilla: raster que reemplaza a `pixel_reliability` sobre la grilla.
    pedidos: si se pasa una lista, se guardan ahí los pedidos.
    """
    def responder(request: httpx.Request) -> httpx.Response:
        if pedidos is not None:
            pedidos.append(request)
        ruta = request.url.path
        if "/item/bbox/" in ruta:
            if not en_grilla:
                return httpx.Response(404)
            p = request.url.params
            if p.get("collection", "").startswith("hls2-"):
                return httpx.Response(200, content=_hls_grilla())
            if p.get("assets") == ndvi.MODIS_FIABILIDAD:
                if fiabilidad_grilla is not None:
                    return httpx.Response(200, content=_npy(fiabilidad_grilla))
                return httpx.Response(200, content=(FIX / "grilla_modis_fiabilidad_2024209.npy").read_bytes())
            if p.get("assets") == ndvi.MODIS_ASSET:
                return httpx.Response(200, content=(FIX / "grilla_modis_ndvi_2024209.npy").read_bytes())
        if ruta.endswith("/stac/v1/search"):
            cuerpo = json.loads(request.content)
            coleccion, mes = cuerpo["collections"][0], cuerpo["datetime"][:7]
            if coleccion.startswith("hls2-"):
                if mes in hls_vacio:
                    return httpx.Response(200, json={"features": []})
                return httpx.Response(200, json={"features": _leer(f"ndvi_{coleccion.replace('hls2-', 'hls_')}_busqueda.json")})
            if coleccion == ndvi.MODIS_COLECCION:
                return httpx.Response(200, json={"features": _leer("ndvi_modis_busqueda.json")})
        if ruta.endswith("/item/statistics"):
            p = request.url.params
            if p.get("collection", "").startswith("hls2-"):
                return httpx.Response(200, json=_leer("ndvi_hls_stats.json"))
            if p.get("assets") == ndvi.MODIS_FIABILIDAD:
                return httpx.Response(200, json=fiabilidad or _leer("ndvi_modis_fiabilidad.json"))
            if p.get("assets") == ndvi.MODIS_ASSET:
                return httpx.Response(200, json=_leer("ndvi_modis_stats.json"))
        return httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(responder))


def test_lote_demo_en_grilla(monkeypatch):
    """Caso normal: la media de cada mes es la del raster de la escena sobre la grilla (27/07/2024: 0,264)."""
    monkeypatch.setattr(pc, "_cliente", _servidor())
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto, mapas = r["visto_por_satelite"], r["mapas"]
    g = grilla.crear(LOTE_EJEMPLO)
    pixeles = int(grilla.mascara(g, LOTE_EJEMPLO).sum())
    julio = visto["meses"][6]
    assert julio["ndvi_medio"] == 0.264 and julio["pixeles"] == pixeles == 1230
    assert r["grilla"] == g.a_dict() and len(mapas) == 12 and all(mapas)
    for mes, capa in zip(visto["meses"], mapas):
        # alineación: todas las capas en la grilla común
        assert capa["bounds"] == g.bounds and (capa["alto"], capa["ancho"]) == (g.alto, g.ancho)
        # coherencia: el número de la tabla es la media de la capa
        assert capa["resumen"]["media"] == capa["resumen"]["valor_lote"] == mes["ndvi_medio"]
        assert capa["resumen"]["pixeles"] == mes["pixeles"]
        assert capa["fecha"] == mes["fecha"] and capa["campana"] == "2024/25"
    capa = mapas[6]
    assert capa["id"] == "ndvi" and capa["titulo"] == "NDVI · Julio 2024" and capa["confianza"] == "alta"
    assert capa["escala"]["cortes"][2] == ndvi.UMBRAL_NDVI_BAJO and capa["resolucion_nativa"] == "30 m"
    v = raster.descuantizar(capa["valores"], capa["factor"], capa["nodata"], capa["alto"], capa["ancho"])
    assert abs(float(np.nanmean(v)) - julio["ndvi_medio"]) < 0.001
    assert visto["meses_ndvi_bajo"] == 12 and r["meses_cobertura_baja"]["valor"] == 12


def test_lote_demo_hls(monkeypatch):
    """Sin raster sobre la grilla: la media sale de item/statistics (real del 27/07/2024: 0,264, 1092 px)."""
    monkeypatch.setattr(pc, "_cliente", _servidor(en_grilla=False))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto, ind = r["visto_por_satelite"], r["meses_cobertura_baja"]

    assert visto["campana"] == "2024/25" and visto["umbral"] == 0.3
    assert len(visto["meses"]) == 12 and all(visto["meses"])
    julio = visto["meses"][6]
    assert CLAVES_MES <= julio.keys()
    assert julio["mes"] == "2024-07" and julio["fecha"] == "2024-07-27"
    assert julio["ndvi_medio"] == 0.264 and julio["pixeles"] == 1092
    assert julio["coleccion"] == "hls2-s30" and julio["nubes_escena"] == 0.0
    # Índice 0 = enero (como el front); la campaña 2024/25 va de jul-2024 a jun-2025.
    assert [m["mes"] for m in visto["meses"]] == [
        "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
        "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12"]
    assert visto["meses_ndvi_bajo"] == 12 and visto["faltantes"] == []

    assert CLAVES <= ind.keys()
    assert ind["valor"] == 12 and ind["unidad"] == "meses" and ind["anios"] == "2024/25"
    assert ind["resolucion"] == "30 m" and ind["confianza"] == "media"
    assert r["mapas"] == [None] * 12   # sin raster no hay capa: el front usa las teselas del item


def test_mes_cae_a_modis_en_grilla(monkeypatch):
    """Julio sin HLS → MODIS de respaldo sobre la grilla (vecino más cercano): 0,309 y capa de 250 m."""
    pedidos = []
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), pedidos=pedidos))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    julio, capa = r["visto_por_satelite"]["meses"][6], r["mapas"][6]
    assert julio["coleccion"] == ndvi.MODIS_COLECCION and julio["ndvi_medio"] == 0.309 and julio["pixeles"] == 1230
    assert capa["resumen"]["media"] == 0.309 and capa["resolucion_nativa"] == "250 m (MODIS, respaldo)"
    assert capa["confianza"] == "baja" and "250 m" in capa["nota"]
    modis = [p for p in pedidos if "/item/bbox/" in p.url.path and p.url.params["collection"] == ndvi.MODIS_COLECCION]
    assert {p.url.params["resampling"] for p in modis} == {"nearest"}
    hls = [p for p in pedidos if "/item/bbox/" in p.url.path and p.url.params["collection"].startswith("hls2-")]
    assert hls and {p.url.params["resampling"] for p in hls} == {"bilinear"}
    assert not [p for p in pedidos if p.url.path.endswith("/item/statistics")]


def test_modis_con_nubes_en_grilla_se_descarta(monkeypatch):
    """Más del 2 % del lote con fiabilidad 3 (nubes) o relleno (−1 → 255 en uint8): el compuesto se descarta."""
    fia = np.load(FIX / "grilla_modis_fiabilidad_2024209.npy")
    fia[0, 10:14, 10:20] = 3       # 40 píxeles de 1230 nublados (3,3 %)
    fia[0, 0, 0] = 255
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), fiabilidad_grilla=fia))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    assert r["visto_por_satelite"]["meses"][6] is None and r["mapas"][6] is None


def test_modis_pocos_pixeles_malos_se_descartan_del_promedio(monkeypatch):
    fia = np.load(FIX / "grilla_modis_fiabilidad_2024209.npy")
    fia[0, 10, 10:15] = 3          # 5 píxeles nublados: se aceptan, pero no entran en la media
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), fiabilidad_grilla=fia))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    assert r["visto_por_satelite"]["meses"][6]["pixeles"] == 1225 and r["mapas"][6]["resumen"]["pixeles"] == 1225


def test_lote_grande_sin_valores(monkeypatch):
    monkeypatch.setattr(ndvi, "MAX_PIXELES_VALORES", 100)
    monkeypatch.setattr(pc, "_cliente", _servidor())
    capa = ndvi.calcular(LOTE_EJEMPLO, campana=2024)["mapas"][6]
    assert capa["valores"] is None and capa["png"] and "Sin valores por píxel" in capa["nota"]


def test_mes_cae_a_modis(monkeypatch):
    """Julio sin escena HLS limpia → MODIS de respaldo (0,31) y se dice en la fuente."""
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), en_grilla=False))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    julio = r["visto_por_satelite"]["meses"][6]

    assert julio["coleccion"] == ndvi.MODIS_COLECCION
    assert julio["ndvi_medio"] == 0.311 and julio["pixeles"] == 48
    assert julio["nubes_escena"] is None and julio["fecha"].startswith("2024-07")
    assert "respaldo" in julio["fuente"] and "250 m" in julio["fuente"]
    assert r["visto_por_satelite"]["meses"][7]["coleccion"] == "hls2-s30"
    # Con MODIS, 0,311 no pasa el umbral: julio deja de contar como mes pelado.
    assert r["visto_por_satelite"]["meses_ndvi_bajo"] == 11
    ind = r["meses_cobertura_baja"]
    assert ind["confianza"] == "baja" and "250 m" in ind["resolucion"] and "MODIS" in ind["fuente"]


def test_modis_con_nubes_se_descarta(monkeypatch):
    """Si el compuesto MODIS tiene píxeles nublados (fiabilidad 3), el mes queda en None + motivo."""
    nublado = _leer("ndvi_modis_fiabilidad.json")
    banda = next(iter(nublado["properties"]["statistics"].values()))
    banda.update(max=3.0, percentile_98=3.0)
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), fiabilidad=nublado, en_grilla=False))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto = r["visto_por_satelite"]

    assert visto["meses"][6] is None
    assert visto["faltantes"][0]["mes"] == "2024-07" and "Julio 2024" in visto["faltantes"][0]["motivo"]
    assert r["meses_cobertura_baja"]["valor"] == 11 and r["meses_cobertura_baja"]["confianza"] == "baja"


def test_falla_total_no_rompe(monkeypatch):
    def sin_red(request):
        raise httpx.ConnectError("sin red")
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(sin_red)))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto, ind = r["visto_por_satelite"], r["meses_cobertura_baja"]

    assert visto["meses"] == [None] * 12 and visto["meses_ndvi_bajo"] is None and r["mapas"] == [None] * 12
    assert len(visto["faltantes"]) == 12
    assert ind["valor"] is None and ind["confianza"] == "sin_dato" and ind["motivo"]
    assert CLAVES <= ind.keys()


def test_lote_invalido_no_rompe():
    r = ndvi.calcular({"type": "Point", "coordinates": [-64.2, -33.2]})
    ind = r["meses_cobertura_baja"]
    assert ind["valor"] is None and ind["confianza"] == "sin_dato" and "inválido" in ind["motivo"]


def test_ultima_campana_completa():
    assert ndvi.campana_inicio(date(2026, 11, 14)) == 2025   # 2025/26 terminó el 30/06/2026
    assert ndvi.campana_inicio(date(2026, 7, 1)) == 2025
    assert ndvi.campana_inicio(date(2026, 3, 10)) == 2024    # 2025/26 todavía en curso


def test_meses_bajos_por_pixel(monkeypatch):
    """Cuántos meses estuvo cada píxel bajo 0,3: con la escena de julio en los 12 meses, 12 o 0."""
    monkeypatch.setattr(pc, "_cliente", _servidor())
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    capa, g = r["meses_bajos_mapa"], grilla.crear(LOTE_EJEMPLO)
    assert r["meses_bajos_motivo"] is None and capa["id"] == "meses_bajos" and capa["bounds"] == g.bounds
    v = raster.descuantizar(capa["valores"], capa["factor"], capa["nodata"], capa["alto"], capa["ancho"])
    julio = np.load(FIX / "grilla_hls_s30_2024209.npy")[0] / 10000
    m = grilla.mascara(g, LOTE_EJEMPLO)
    assert (v[m] == np.where(julio[m] < ndvi.UMBRAL_NDVI_BAJO, 12, 0)).all()
    assert np.isnan(v[~m]).all() and capa["resumen"]["pixeles"] == int(m.sum())


def test_meses_bajos_siempre_con_valores(monkeypatch):
    """La erosión por píxel los necesita: no se recortan aunque el lote sea grande."""
    monkeypatch.setattr(ndvi, "MAX_PIXELES_VALORES", 100)
    monkeypatch.setattr(pc, "_cliente", _servidor())
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    assert r["mapas"][6]["valores"] is None and r["meses_bajos_mapa"]["valores"]


def test_meses_bajos_con_modis_lo_dice(monkeypatch):
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",)))
    capa = ndvi.calcular(LOTE_EJEMPLO, campana=2024)["meses_bajos_mapa"]
    assert "MODIS" in capa["nota"] and capa["confianza"] == "media"


def test_meses_bajos_sin_raster_en_algun_mes(monkeypatch):
    """Sin raster en algún mes con dato, el conteo por píxel no se compara con el del lote: no hay capa."""
    monkeypatch.setattr(pc, "_cliente", _servidor(en_grilla=False))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    assert r["meses_bajos_mapa"] is None and "sin raster" in r["meses_bajos_motivo"]


def test_nota_con_un_mes_faltante_en_singular():
    """H-017: decía "faltan 1 meses"."""
    meses = [{"mes": f"2025-{m:02d}", "ndvi_medio": 0.6, "coleccion": "hls2-s30"} for m in range(1, 12)] + [None]
    nota = ndvi._armar("2025/26", meses, [{"mes": "2025-12", "motivo": "Diciembre 2025: sin escena"}])[
        "meses_cobertura_baja"]["nota"]
    assert "falta 1 mes (ver" in nota and "1 meses" not in nota
    assert ndvi._meses(1) == "1 mes" and ndvi._meses(0) == "0 meses" and ndvi._meses(11) == "11 meses"
