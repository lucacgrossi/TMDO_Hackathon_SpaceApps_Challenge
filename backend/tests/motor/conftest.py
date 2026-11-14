"""Indicadores del lote demo (Río Cuarto) para el motor, redondeados de NASA POWER 1996/97–2025/26.

Salen de `clima.indicadores.calcular` con el fixture `tests/clima/fixtures/power_rio_cuarto.json`;
se fijan acá para que los tests del motor no dependan del dominio clima.
"""
import copy

import pytest

IND = {
    "terciles": {
        "seco": {"pp": [107, 92, 81, 64, 15, 7, 6, 11, 24, 60, 103, 86],
                 "et0": [208, 162, 142, 93, 63, 46, 51, 75, 105, 151, 185, 212], "n": 10},
        "normal": {"pp": [123, 86, 108, 86, 20, 5, 7, 16, 42, 88, 120, 113],
                   "et0": [206, 157, 135, 86, 59, 46, 48, 74, 103, 147, 176, 206], "n": 10},
        "humedo": {"pp": [162, 138, 121, 76, 43, 27, 17, 16, 27, 88, 120, 153],
                   "et0": [192, 153, 129, 84, 56, 43, 50, 70, 108, 149, 172, 198], "n": 10},
    },
    "anios_con_helada": [0, 0, 0, 0, 8, 25, 26, 20, 11, 0, 0, 0],
    "anios_con_calor": [29, 24, 16, 1, 0, 0, 0, 2, 5, 14, 25, 26],
    "n_anios": 30,
    "pendiente_pct": 0.6,
    "visto_satelite": {"meses_pelados": 3, "meses_con_dato": 12, "campania": "2025/26"},
}


def entradas(**cambios) -> dict:
    base = {"verano": "soja", "invierno": "barbecho", "pasada": "soja",
            "pesos": {"agua": 3, "suelo": 3, "ingreso": 3, "erosion": 3},
            "no_sembrar": [], "maquinaria_limitada": False, "anegable": "no", "textura": "franco",
            "mediciones": {}}
    base.update(cambios)
    return base


@pytest.fixture
def ind():
    return copy.deepcopy(IND)
