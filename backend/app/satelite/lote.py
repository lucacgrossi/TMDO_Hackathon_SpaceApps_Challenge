"""Polígono del lote: validación, área, centroide, bbox y lote de ejemplo.

El lote es un GeoJSON Polygon en [lon, lat] (`entrada.lote.poligono`), dibujado por el
usuario (de 1 a 20.000 ha, de cualquier forma, sin líneas cruzadas) o el lote de ejemplo.
Las fórmulas están portadas del prototipo (`docs/field-shift-prototipo (4).html`:
`areaHa`, `center`, `segX`/`selfX`), para que el back y el front den lo mismo.
"""
from __future__ import annotations

import math
import sys

# Lote demo: campo cerca de Río Cuarto, ~95 ha, soja con barbecho invernal (CLAUDE.md).
LOTE_EJEMPLO: dict = {
    "type": "Polygon",
    "coordinates": [[
        [-64.2381, -33.2436],
        [-64.2268, -33.2436],
        [-64.2268, -33.2517],
        [-64.2381, -33.2517],
        [-64.2381, -33.2436],
    ]],
}

MIN_HA = 1          # RF1 del alcance (docs/mvp-alcance.md)
MAX_HA = 20_000
RADIO_TIERRA_M = 6378137  # el mismo que usa el prototipo en areaHa


def _vertices(poligono: dict) -> list[tuple[float, float]]:
    """Vértices (lon, lat) del anillo exterior, sin repetir el cierre ni puntos duplicados seguidos.

    Lanza ValueError si el GeoJSON no es un Polygon válido.
    """
    if not isinstance(poligono, dict) or poligono.get("type") != "Polygon":
        raise ValueError("El lote tiene que ser un polígono GeoJSON (type: Polygon).")
    anillos = poligono.get("coordinates")
    if not isinstance(anillos, list) or not anillos or not isinstance(anillos[0], list):
        raise ValueError("El polígono del lote no tiene coordenadas.")
    pts: list[tuple[float, float]] = []
    for p in anillos[0]:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            raise ValueError("Hay un vértice del lote mal formado.")
        try:
            lon, lat = float(p[0]), float(p[1])
        except (TypeError, ValueError) as e:
            raise ValueError("Hay un vértice del lote que no es un número.") from e
        if not (math.isfinite(lon) and math.isfinite(lat)) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Hay un vértice del lote fuera de rango (va en [lon, lat]).")
        if not pts or (lon, lat) != pts[-1]:
            pts.append((lon, lat))
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 3:
        raise ValueError("El lote necesita al menos 3 esquinas distintas.")
    return pts


def area_ha(poligono: dict) -> float:
    """Área en hectáreas sobre la esfera (misma fórmula que `areaHa` del prototipo)."""
    pts = _vertices(poligono)
    a = 0.0
    for i, (lon1, lat1) in enumerate(pts):
        lon2, lat2 = pts[(i + 1) % len(pts)]
        a += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(a * RADIO_TIERRA_M ** 2 / 2) / 1e4


def centroide(poligono: dict) -> list[float]:
    """Centroide del polígono como [lat, lon] (así lo pide `entrada.lote.centro`)."""
    pts = _vertices(poligono)
    a = cx = cy = 0.0
    for i, (x0, y0) in enumerate(pts):
        x1, y1 = pts[(i + 1) % len(pts)]
        k = x0 * y1 - x1 * y0
        a += k
        cx += (x0 + x1) * k
        cy += (y0 + y1) * k
    if abs(a) < 1e-12:  # polígono degenerado: promedio de los vértices
        return [sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)]
    return [cy / (3 * a), cx / (3 * a)]


def bbox(poligono: dict) -> list[float]:
    """[oeste, sur, este, norte] en grados."""
    pts = _vertices(poligono)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]


def _orientacion(a, b, c) -> float:
    return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])


def _se_cortan(p1, p2, p3, p4) -> bool:
    o1, o2 = _orientacion(p1, p2, p3), _orientacion(p1, p2, p4)
    o3, o4 = _orientacion(p3, p4, p1), _orientacion(p3, p4, p2)
    return o1 * o2 < 0 and o3 * o4 < 0


def se_cruza(poligono: dict) -> bool:
    """True si dos lados no vecinos del polígono se cruzan (un "moño")."""
    pts = _vertices(poligono)
    n = len(pts)
    lados = [(pts[i], pts[(i + 1) % n]) for i in range(n)]
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:  # el primero y el último comparten vértice
                continue
            if _se_cortan(*lados[i], *lados[j]):
                return True
    return False


def validar(poligono: dict) -> dict:
    """Valida el lote. Nunca lanza.

    Devuelve {ok, motivo, poligono (anillo cerrado), area_ha, centro [lat, lon], bbox}.
    Si ok es False, `motivo` explica qué corregir (mismos textos que el prototipo).
    """
    r: dict = {"ok": False, "motivo": None, "poligono": None, "area_ha": None, "centro": None, "bbox": None}
    try:
        pts = _vertices(poligono)
        cerrado = {"type": "Polygon", "coordinates": [[list(p) for p in pts] + [list(pts[0])]]}
        r.update(poligono=cerrado, area_ha=round(area_ha(cerrado), 2),
                 centro=[round(c, 6) for c in centroide(cerrado)], bbox=bbox(cerrado))
        if se_cruza(cerrado):
            r["motivo"] = "Las líneas se cruzan: arrastrá o deshacé un punto."
        elif r["area_ha"] < MIN_HA:
            r["motivo"] = f"Muy chico: el mínimo es {MIN_HA} ha."
        elif r["area_ha"] > MAX_HA:
            r["motivo"] = f"Muy grande: el máximo es {MAX_HA:,} ha. Acercá el mapa y marcá el lote.".replace(",", ".")
        else:
            r["ok"] = True
    except ValueError as e:
        r["motivo"] = str(e)
    except Exception as e:  # noqa: BLE001 — nunca propagar
        r["motivo"] = f"No se pudo leer el polígono del lote ({type(e).__name__})."
    return r


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else LOTE_EJEMPLO
    print(json.dumps(validar(poligono), ensure_ascii=False, indent=2))
