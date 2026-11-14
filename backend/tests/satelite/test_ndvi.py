import json
from datetime import date
from pathlib import Path

import httpx

from app.satelite import ndvi, pc
from app.satelite.lote import LOTE_EJEMPLO

FIX = Path(__file__).parent / "fixtures"
CLAVES = {"valor", "unidad", "fuente", "anios", "resolucion", "confianza"}
CLAVES_MES = {"fecha", "ndvi_medio", "nubes_escena", "coleccion", "item", "fuente", "pixeles"}


def _leer(nombre: str):
    return json.loads((FIX / nombre).read_text(encoding="utf-8"))


def _servidor(hls_vacio: tuple[str, ...] = (), fiabilidad: dict | None = None):
    """Planetary Computer falso con respuestas reales de julio de 2024 (fixtures).

    hls_vacio: meses "AAAA-MM" en los que la búsqueda HLS no devuelve escenas.
    fiabilidad: respuesta que reemplaza a las estadísticas de `pixel_reliability`.
    """
    def responder(request: httpx.Request) -> httpx.Response:
        ruta = request.url.path
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


def test_lote_demo_hls(monkeypatch):
    """Caso normal: todos los meses con escena HLS (respuesta real del 27/07/2024: 0,264, 1092 px)."""
    monkeypatch.setattr(pc, "_cliente", _servidor())
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto, ind = r["visto_por_satelite"], r["meses_cobertura_baja"]

    assert visto["campana"] == "2024/25" and visto["umbral"] == 0.3
    assert len(visto["meses"]) == 12 and all(visto["meses"])
    julio = visto["meses"][0]
    assert CLAVES_MES <= julio.keys()
    assert julio["mes"] == "2024-07" and julio["fecha"] == "2024-07-27"
    assert julio["ndvi_medio"] == 0.264 and julio["pixeles"] == 1092
    assert julio["coleccion"] == "hls2-s30" and julio["nubes_escena"] == 0.0
    assert [m["mes"] for m in visto["meses"]][6] == "2025-01"  # índice 0 = julio, 6 = enero
    assert visto["meses_ndvi_bajo"] == 12 and visto["faltantes"] == []

    assert CLAVES <= ind.keys()
    assert ind["valor"] == 12 and ind["unidad"] == "meses" and ind["anios"] == "2024/25"
    assert ind["resolucion"] == "30 m" and ind["confianza"] == "media"


def test_mes_cae_a_modis(monkeypatch):
    """Julio sin escena HLS limpia → MODIS de respaldo (0,31) y se dice en la fuente."""
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",)))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    julio = r["visto_por_satelite"]["meses"][0]

    assert julio["coleccion"] == ndvi.MODIS_COLECCION
    assert julio["ndvi_medio"] == 0.311 and julio["pixeles"] == 48
    assert julio["nubes_escena"] is None and julio["fecha"].startswith("2024-07")
    assert "respaldo" in julio["fuente"] and "250 m" in julio["fuente"]
    assert r["visto_por_satelite"]["meses"][1]["coleccion"] == "hls2-s30"
    # Con MODIS, 0,311 no pasa el umbral: julio deja de contar como mes pelado.
    assert r["visto_por_satelite"]["meses_ndvi_bajo"] == 11
    ind = r["meses_cobertura_baja"]
    assert ind["confianza"] == "baja" and "250 m" in ind["resolucion"] and "MODIS" in ind["fuente"]


def test_modis_con_nubes_se_descarta(monkeypatch):
    """Si el compuesto MODIS tiene píxeles nublados (fiabilidad 3), el mes queda en None + motivo."""
    nublado = _leer("ndvi_modis_fiabilidad.json")
    banda = next(iter(nublado["properties"]["statistics"].values()))
    banda.update(max=3.0, percentile_98=3.0)
    monkeypatch.setattr(pc, "_cliente", _servidor(hls_vacio=("2024-07",), fiabilidad=nublado))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto = r["visto_por_satelite"]

    assert visto["meses"][0] is None
    assert visto["faltantes"][0]["mes"] == "2024-07" and "Julio 2024" in visto["faltantes"][0]["motivo"]
    assert r["meses_cobertura_baja"]["valor"] == 11 and r["meses_cobertura_baja"]["confianza"] == "baja"


def test_falla_total_no_rompe(monkeypatch):
    def sin_red(request):
        raise httpx.ConnectError("sin red")
    monkeypatch.setattr(pc, "_cliente", httpx.Client(transport=httpx.MockTransport(sin_red)))
    r = ndvi.calcular(LOTE_EJEMPLO, campana=2024)
    visto, ind = r["visto_por_satelite"], r["meses_cobertura_baja"]

    assert visto["meses"] == [None] * 12 and visto["meses_ndvi_bajo"] is None
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
