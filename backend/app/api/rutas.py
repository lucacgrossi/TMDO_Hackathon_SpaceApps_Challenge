"""Rutas HTTP de la API (dueño: Back 1)."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import servicio
from app.api.contrato import Entrada, Error, Salida
from app.api.mock import salida_mock

log = logging.getLogger("fieldshift.rutas")
router = APIRouter()

# Respuesta precalculada del lote de ejemplo (Back 2, `scripts/precalcular_demo.py`). Si todavía
# no existe, se usa el mock fijo.
DEMO = Path(__file__).parents[1] / "demo" / "rio_cuarto.json"
AVISO_DEMO = "NASA POWER no respondió: se muestra la respuesta precalculada del lote de ejemplo"


def salida_demo(entrada: Entrada) -> Salida:
    """Respuesta de respaldo del lote de ejemplo, marcada con `es_mock` y en "Información que falta"."""
    salida = None
    if DEMO.exists():
        try:
            salida = Salida.model_validate(json.loads(DEMO.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001 — JSON viejo o roto: cae al mock
            log.exception("No se pudo leer %s", DEMO)
    if salida is None:
        salida = salida_mock(entrada)
    salida.es_mock = True
    salida.informacion_falta = [AVISO_DEMO, *salida.informacion_falta]
    return salida


@router.get("/salud")
def salud() -> dict:
    return {"estado": "ok"}


@router.post(
    "/analizar",
    response_model=Salida,
    responses={422: {"model": Error}, 503: {"model": Error}},
)
def analizar(entrada: Entrada) -> Salida | JSONResponse:
    """
    Compara la rotación actual con las alternativas A, B y C (`servicio.analizar`).

    422: el polígono no es válido o no es un lote agrícola. 503: NASA POWER no respondió
    (con el lote de ejemplo se devuelve la respuesta precalculada, con `es_mock: true`).
    """
    try:
        return servicio.analizar(entrada)
    except servicio.ErrorServicio as e:
        if e.power_caido and entrada.lote.tipo == "ejemplo":
            return salida_demo(entrada)
        return JSONResponse(status_code=e.estado, content={"mensaje": e.mensaje})
