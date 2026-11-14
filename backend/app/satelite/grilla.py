"""Grilla común del lote: la misma para todas las capas del mapa y todos los resúmenes.

Plan de armonización (`docs/plan-armonizacion-capas.md`, §3.1):
- EPSG:4326, paso de 1 segundo de arco (1/3600°), que es la grilla nativa de NASADEM
  (~30 m de norte a sur y ~26 m de este a oeste en Córdoba): la pendiente no se remuestrea.
- Extensión: el bbox del polígono, ajustado a los bordes de los píxeles de NASADEM. NASADEM
  centra cada píxel en el segundo entero (`proj:transform` de la tesela s34w065, verificado el
  14/11: el borde oeste es −65° − ½″), así que los bordes caen en (j + ½)″.
- Máscara: un píxel está adentro si su centro cae dentro del polígono. Es la misma para todas
  las capas y todos los resúmenes.
- Tope de 250.000 píxeles por capa: si un lote lo supera, el paso pasa a 2″ (~60 m) y la nota
  lo dice (y así, de a un segundo, hasta que entre).
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass

import numpy as np

from app.satelite import lote

SEGUNDOS_POR_GRADO = 3600
ORIGEN_SEGUNDOS = 0.5          # los bordes de los píxeles de NASADEM están en (j + ½)″
MAX_PIXELES = 250_000          # por capa (plan §3.1): un lote de 20.000 ha da ~540 × 430
M_POR_SEGUNDO = 30             # aproximado, para el texto de la resolución
TOLERANCIA = 1e-6             # en píxeles


@dataclass(frozen=True)
class Grilla:
    """Grilla regular en lat/lon. Fila 0 = norte, columna 0 = oeste."""

    oeste: float
    sur: float
    este: float
    norte: float
    ancho: int
    alto: int
    segundos: int = 1          # paso en segundos de arco
    nota: str | None = None

    @property
    def paso(self) -> float:
        """Paso en grados (igual en lat y en lon)."""
        return self.segundos / SEGUNDOS_POR_GRADO

    @property
    def bounds(self) -> list[list[float]]:
        """[[sur, oeste], [norte, este]], como los `bounds` de Leaflet."""
        return [[self.sur, self.oeste], [self.norte, self.este]]

    @property
    def bbox(self) -> list[float]:
        """[oeste, sur, este, norte], como lo pide Planetary Computer."""
        return [self.oeste, self.sur, self.este, self.norte]

    @property
    def pixeles(self) -> int:
        return self.ancho * self.alto

    @property
    def resolucion(self) -> str:
        return f"{self.segundos}″ (~{self.segundos * M_POR_SEGUNDO} m)"

    def lons(self) -> np.ndarray:
        """Centros de las columnas, de oeste a este."""
        return self.oeste + (np.arange(self.ancho) + 0.5) * self.paso

    def lats(self) -> np.ndarray:
        """Centros de las filas, de norte a sur."""
        return self.norte - (np.arange(self.alto) + 0.5) * self.paso

    def ampliada(self, n: int) -> Grilla:
        """La misma grilla con n píxeles más de cada lado (para que los bordes del lote tengan vecinos)."""
        d = n * self.paso
        return Grilla(self.oeste - d, self.sur - d, self.este + d, self.norte + d,
                      self.ancho + 2 * n, self.alto + 2 * n, self.segundos, self.nota)

    def a_dict(self) -> dict:
        """La forma `grilla` de `Capas`: {bounds, ancho, alto, paso (grados)}."""
        return {"bounds": self.bounds, "ancho": self.ancho, "alto": self.alto, "paso": self.paso}


def recortar(array: np.ndarray, n: int) -> np.ndarray:
    """Saca n píxeles de cada borde (lo inverso de `Grilla.ampliada`)."""
    return array[n:array.shape[0] - n, n:array.shape[1] - n] if n else array


def _ajustar(caja: list[float], segundos: int) -> Grilla:
    oeste, sur, este, norte = caja

    def indice(grados: float, redondeo, tolerancia: float) -> int:
        # índice del borde de píxel: borde = (indice · segundos + ½)″. La tolerancia evita sumar una
        # columna de más cuando el vértice cae justo en un borde y el redondeo de punto flotante lo corre.
        return redondeo((grados * SEGUNDOS_POR_GRADO - ORIGEN_SEGUNDOS) / segundos + tolerancia)

    io, ie = indice(oeste, math.floor, TOLERANCIA), indice(este, math.ceil, -TOLERANCIA)
    js, jn = indice(sur, math.floor, TOLERANCIA), indice(norte, math.ceil, -TOLERANCIA)
    ie, jn = max(ie, io + 1), max(jn, js + 1)

    def borde(i: int) -> float:
        return (i * segundos + ORIGEN_SEGUNDOS) / SEGUNDOS_POR_GRADO

    return Grilla(borde(io), borde(js), borde(ie), borde(jn), ie - io, jn - js, segundos)


def crear(poligono: dict, max_pixeles: int | None = None) -> Grilla:
    """Grilla del lote a partir del polígono GeoJSON [lon, lat]. Lanza ValueError si el polígono está mal."""
    max_pixeles = max_pixeles or MAX_PIXELES
    caja = lote.bbox(poligono)
    segundos = 1
    g = _ajustar(caja, segundos)
    while g.pixeles > max_pixeles:
        segundos += 1
        g = _ajustar(caja, segundos)
    if segundos > 1:
        tope = f"{max_pixeles:,}".replace(",", ".")
        nota = (f"Lote grande: la grilla común pasa de 1″ (~30 m) a {g.resolucion} para no superar "
                f"{tope} píxeles por capa")
        g = Grilla(g.oeste, g.sur, g.este, g.norte, g.ancho, g.alto, segundos, nota)
    return g


def mascara(grilla: Grilla, poligono: dict) -> np.ndarray:
    """bool [alto, ancho]: True si el centro del píxel cae dentro del polígono (ray casting, sin shapely)."""
    return lote.mascara(poligono, grilla.lons(), grilla.lats())


if __name__ == "__main__":
    import json
    poligono = json.loads(sys.argv[1]) if len(sys.argv) > 1 else lote.LOTE_EJEMPLO
    g = crear(poligono)
    m = mascara(g, poligono)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({**g.a_dict(), "segundos": g.segundos, "resolucion": g.resolucion, "nota": g.nota,
                      "pixeles_en_el_lote": int(m.sum())}, ensure_ascii=False, indent=2))
