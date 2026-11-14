"""Catálogo de cultivos del motor de reglas.

Valores ORIENTATIVOS para la zona centro de Córdoba (lote demo: Río Cuarto). Son parámetros de
reglas fijas, no recomendaciones agronómicas: los valida la persona 3 con un agrónomo.

Campos:
- nombre: para mostrar.
- grupo: "verano", "invierno", "cobertura" o "barbecho".
- tolera_helada: aguanta heladas en los meses que está en el lote.
- sensible_calor: la floración sufre con máximas de 35 °C o más.
- kc: coeficiente de cultivo medio del ciclo (FAO-56). Uso de agua del mes = kc × ET0. La vicia va por
  encima del centeno: en años secos consumió más agua que el centeno y afectó al maíz siguiente
  (INTA Manfredi, ensayos de cultivos de cobertura).
- meses: meses en el lote (índice 0 = enero).
- floracion: meses de floración (para el riesgo de calor).
- aporte_n: puntos de suelo por fijar nitrógeno.
- rastrojo: puntos de suelo por el rastrojo que deja (≥ 30 en total protege de la erosión).
- comercial: se cosecha y se vende.

Las claves son las del contrato (`app/api/contrato.py`: CultivoVerano, CultivoInvierno, CultivoMes).
"""
from __future__ import annotations

BARBECHO = "barbecho"

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")

C: dict[str, dict] = {
    "soja": {"nombre": "Soja", "grupo": "verano", "tolera_helada": False, "sensible_calor": True,
             "kc": 0.90, "meses": [10, 11, 0, 1, 2, 3], "floracion": [0, 1],
             "aporte_n": 5, "rastrojo": 5, "comercial": True},
    "soja2": {"nombre": "Soja de 2ª", "grupo": "verano", "tolera_helada": False, "sensible_calor": True,
              "kc": 0.80, "meses": [11, 0, 1, 2, 3], "floracion": [1, 2],
              "aporte_n": 5, "rastrojo": 5, "comercial": True},
    "maiz": {"nombre": "Maíz", "grupo": "verano", "tolera_helada": False, "sensible_calor": True,
             "kc": 1.00, "meses": [9, 10, 11, 0, 1, 2, 3], "floracion": [11, 0],
             "aporte_n": 0, "rastrojo": 25, "comercial": True},
    "girasol": {"nombre": "Girasol", "grupo": "verano", "tolera_helada": False, "sensible_calor": True,
                "kc": 0.70, "meses": [8, 9, 10, 11, 0, 1], "floracion": [11],
                "aporte_n": 0, "rastrojo": 5, "comercial": True},
    "sorgo": {"nombre": "Sorgo", "grupo": "verano", "tolera_helada": False, "sensible_calor": False,
              "kc": 0.65, "meses": [10, 11, 0, 1, 2, 3], "floracion": [1],
              "aporte_n": 0, "rastrojo": 30, "comercial": True},
    "mani": {"nombre": "Maní", "grupo": "verano", "tolera_helada": False, "sensible_calor": True,
             "kc": 0.80, "meses": [10, 11, 0, 1, 2, 3], "floracion": [0],
             "aporte_n": 5, "rastrojo": 0, "comercial": True},
    "trigo": {"nombre": "Trigo", "grupo": "invierno", "tolera_helada": True, "sensible_calor": False,
              "kc": 0.60, "meses": [5, 6, 7, 8, 9, 10], "floracion": [9],
              "aporte_n": 0, "rastrojo": 20, "comercial": True},
    "cebada": {"nombre": "Cebada", "grupo": "invierno", "tolera_helada": True, "sensible_calor": False,
               "kc": 0.50, "meses": [5, 6, 7, 8, 9, 10], "floracion": [9],
               "aporte_n": 0, "rastrojo": 15, "comercial": True},
    "vicia": {"nombre": "Vicia", "grupo": "cobertura", "tolera_helada": True, "sensible_calor": False,
              "kc": 0.65, "meses": [4, 5, 6, 7, 8], "floracion": [],
              "aporte_n": 30, "rastrojo": 15, "comercial": False},
    "centeno": {"nombre": "Centeno", "grupo": "cobertura", "tolera_helada": True, "sensible_calor": False,
                "kc": 0.60, "meses": [4, 5, 6, 7, 8], "floracion": [],
                "aporte_n": 0, "rastrojo": 30, "comercial": False},
    BARBECHO: {"nombre": "Barbecho", "grupo": "barbecho", "tolera_helada": True, "sensible_calor": False,
               "kc": 0.15, "meses": [], "floracion": [],
               "aporte_n": 0, "rastrojo": 0, "comercial": False},
}


def nombre(clave: str | None) -> str:
    return C[clave]["nombre"] if clave in C else str(clave)


def meses_texto(indices: list[int]) -> str:
    return ", ".join(MESES[m] for m in indices) or "ninguno"


def dec(x: float, d: int = 1) -> str:
    """Número con coma decimal, como se escribe en la app (0,75)."""
    return f"{x:.{d}f}".replace(".", ",")


def pct(x: float) -> str:
    """Fracción como porcentaje con espacio (0,6 → "60 %")."""
    return f"{round(x * 100)} %"


PLURAL_TIPO = {"seco": "secos", "normal": "normales", "humedo": "húmedos"}
