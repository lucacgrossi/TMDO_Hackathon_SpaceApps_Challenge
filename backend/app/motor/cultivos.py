"""
Tabla de cultivos del motor (portada de `C` y `WIN` del prototipo).

Valores ORIENTATIVOS para la zona centro (lote demo: Río Cuarto).
No son recomendaciones agronómicas: se validan con un agrónomo local.

Campos:
- nombre: para mostrar
- grupo: "verano", "invierno", "cobertura" o "barbecho"
- tolera_helada: True si aguanta heladas
- kc: coeficiente de cultivo promedio del ciclo (FAO-56). Uso de agua del
  mes = kc × ET0 del mes. En el prototipo era `cons` y se multiplicaba por
  80 mm fijos; ahora se multiplica por la ET0 real de NASA POWER.
- n_fija: aporte de nitrógeno (puntos de suelo)
- rastrojo: aporte de rastrojo (puntos de suelo; >= 30 en total protege de erosión)
- comercial: True si se vende
"""

BARBECHO = "barbecho"

MESES = ["ene", "feb", "mar", "abr", "may", "jun",
         "jul", "ago", "sep", "oct", "nov", "dic"]

C = {
    "soja":     {"nombre": "Soja",     "grupo": "verano",    "tolera_helada": False, "kc": 0.90, "n_fija": 5,  "rastrojo": 5,  "comercial": True},
    "soja2":    {"nombre": "Soja 2ª",  "grupo": "verano",    "tolera_helada": False, "kc": 0.80, "n_fija": 5,  "rastrojo": 5,  "comercial": True},
    "maiz":     {"nombre": "Maíz",     "grupo": "verano",    "tolera_helada": False, "kc": 1.00, "n_fija": 0,  "rastrojo": 25, "comercial": True},
    "girasol":  {"nombre": "Girasol",  "grupo": "verano",    "tolera_helada": False, "kc": 0.70, "n_fija": 0,  "rastrojo": 5,  "comercial": True},
    "sorgo":    {"nombre": "Sorgo",    "grupo": "verano",    "tolera_helada": False, "kc": 0.65, "n_fija": 0,  "rastrojo": 30, "comercial": True},
    "mani":     {"nombre": "Maní",     "grupo": "verano",    "tolera_helada": False, "kc": 0.80, "n_fija": 5,  "rastrojo": 0,  "comercial": True},
    "trigo":    {"nombre": "Trigo",    "grupo": "invierno",  "tolera_helada": True,  "kc": 0.60, "n_fija": 0,  "rastrojo": 20, "comercial": True},
    "cebada":   {"nombre": "Cebada",   "grupo": "invierno",  "tolera_helada": True,  "kc": 0.50, "n_fija": 0,  "rastrojo": 15, "comercial": True},
    "vicia":    {"nombre": "Vicia",    "grupo": "cobertura", "tolera_helada": True,  "kc": 0.55, "n_fija": 30, "rastrojo": 15, "comercial": False},
    "centeno":  {"nombre": "Centeno",  "grupo": "cobertura", "tolera_helada": True,  "kc": 0.60, "n_fija": 0,  "rastrojo": 30, "comercial": False},
    BARBECHO:   {"nombre": "Barbecho", "grupo": "barbecho",  "tolera_helada": True,  "kc": 0.15, "n_fija": 0,  "rastrojo": 0,  "comercial": False},
}

# Meses en el lote (0 = enero). Es `WIN` del prototipo.
WIN = {
    "soja":    [10, 11, 0, 1, 2, 3],
    "soja2":   [11, 0, 1, 2, 3],
    "maiz":    [9, 10, 11, 0, 1, 2, 3],
    "girasol": [8, 9, 10, 11, 0, 1],
    "sorgo":   [10, 11, 0, 1, 2, 3],
    "mani":    [10, 11, 0, 1, 2, 3],
    "trigo":   [5, 6, 7, 8, 9, 10],
    "cebada":  [5, 6, 7, 8, 9, 10],
    "vicia":   [4, 5, 6, 7, 8],
    "centeno": [4, 5, 6, 7, 8],
}


def nombre(clave):
    return C[clave]["nombre"]
