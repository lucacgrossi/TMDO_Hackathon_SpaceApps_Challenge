"""Escalas de color de las capas del mapa: una sola definición, que viaja con cada capa.

Plan de armonización (`docs/plan-armonizacion-capas.md`, §3.3). El front dibuja la leyenda con
la `escala` de la capa y no repite cortes ni umbrales.

Regla de las escalas (la usa `raster.pintar`): `cortes[i]` es el **piso** de la clase i, así que
hay un color y una etiqueta por corte. Un valor va a la última clase cuyo corte no supera
(`valor >= cortes[i]`); lo que queda por debajo del primer corte va a la clase 0.
"""
from __future__ import annotations

# Lote "pelado" o casi: NDVI medio < 0,3 (regla del prototipo, la valida la persona 3). Es la única
# definición: `ndvi.UMBRAL_NDVI_BAJO` la reexporta (así `ndvi` puede usar las escalas sin import circular).
UMBRAL_NDVI = 0.3

# NDVI: cortes y colores del MVP 4.2 ("Mapa interactivo") y del prototipo (NDVI_CL, NDVI_COLS).
NDVI = {
    "cortes": [0.0, 0.15, UMBRAL_NDVI, 0.45, 0.6, 0.75],
    "colores": ["#E6D8AE", "#CDBA86", "#94AF63", "#689C49", "#3F8139", "#1B5E2E"],
    "etiquetas": ["< 0,15", "0,15–0,3", "0,3–0,45", "0,45–0,6", "0,6–0,75", "≥ 0,75"],
}

# Pendiente (%): los mismos cortes y colores que `slopeColor` del prototipo (verde → amarillo → rojo),
# por clases en lugar de interpolados, para que cada color se pueda leer en la leyenda.
PENDIENTE = {
    "cortes": [0.0, 1.0, 2.5, 4.0, 6.0],
    "colores": ["#2E7D32", "#7CB342", "#FDD835", "#F57C00", "#C62828"],
    "etiquetas": ["< 1 %", "1–2,5 %", "2,5–4 %", "4–6 %", "≥ 6 %"],
}

# Cultivo (ESA WorldCover, clase 40): el valor del píxel es 100 si es cultivo y 0 si no, así la
# media de la capa dentro del lote es directamente el % de cultivo.
CULTIVO = {
    "cortes": [0.0, 100.0],
    "colores": ["#9E9E9E", "#F2C94C"],
    "etiquetas": ["Otra cobertura", "Cultivo (clase 40)"],
}


def copia(escala: dict) -> dict:
    """Copia de una escala para poner en una capa (que nadie modifique la definición compartida)."""
    return {k: list(v) for k, v in escala.items()}

# Meses con cobertura baja por píxel (NDVI < umbral), de 0 a 12 en la campaña.
MESES_BAJOS = {
    "cortes": [0.0, 1.0, 3.0, 5.0, 7.0],
    "colores": ["#1B5E2E", "#94AF63", "#E6D8AE", "#CDA35F", "#8D5524"],
    "etiquetas": ["0 meses", "1–2 meses", "3–4 meses", "5–6 meses", "≥ 7 meses"],
}

# Erosión (índice relativo, % × meses): pendiente del píxel × meses con cobertura baja del píxel.
# Misma rampa que la pendiente (plan §3.3). Cortes PROPUESTOS por Back 2: 1 % de pendiente con 2, 5,
# 10 y 20 meses pelados; la escala de clases la define la persona 3 (plan §10).
EROSION = {
    "cortes": [0.0, 2.0, 5.0, 10.0, 20.0],
    "colores": list(PENDIENTE["colores"]),
    "etiquetas": ["< 2", "2–5", "5–10", "10–20", "≥ 20"],
}
