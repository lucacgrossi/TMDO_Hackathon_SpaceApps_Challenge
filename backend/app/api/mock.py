"""
Respuesta fija de /analizar para que el front y Back 2 trabajen sin esperar a NASA.

`mock_rio_cuarto.json` tiene la forma exacta de `Salida` (lo valida al cargar).
Las 4 columnas salen del motor de reglas de la persona 3 con indicadores
ILUSTRATIVOS (no son datos de NASA): por eso `es_mock` es True y
"Información que falta" lo dice. Se reemplaza por `servicio.analizar()`.

Si cambia `contrato.py`, este JSON se regenera en el mismo commit.
"""

import json
from functools import cache
from pathlib import Path

from app.api.contrato import Entrada, Salida

_ARCHIVO = Path(__file__).with_name("mock_rio_cuarto.json")


@cache
def _base() -> Salida:
    return Salida.model_validate(json.loads(_ARCHIVO.read_text(encoding="utf-8")))


def salida_mock(entrada: Entrada | None = None) -> Salida:
    """Devuelve el mock. Si llega una entrada, copia el área del lote para que se vea coherente."""
    salida = _base().model_copy(deep=True)
    if entrada is not None:
        salida.lote.area_ha = entrada.lote.area_ha
    return salida


if __name__ == "__main__":
    s = salida_mock()
    print(f"Mock válido: {len(s.estrategias)} columnas, período {s.periodo_clima}")
    for e in s.estrategias:
        print(f"  {e.id:6} {e.nombre:28} cercanía {e.cercania} · {e.resumen}")
