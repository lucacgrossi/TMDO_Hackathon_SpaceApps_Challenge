"""Rutas HTTP de la API (dueño: Back 1)."""

import importlib
import json
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse

from app import servicio
from app.api.contrato import AvisoFila, Entrada, Error, ResultadoPlanilla, Salida
from app.api.mock import salida_mock
from app.mediciones.planilla import MAX_BYTES as MAX_BYTES_PLANILLA  # un solo tope: ruta y parser

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


# --- Planilla de mediciones del productor (docs/plan-planilla-lluvia.md, 5.2) ---

PARSER_PENDIENTE = "La lectura de planillas no está disponible en este momento: probá de nuevo en unos minutos"


def _cargar_parser():
    """`leer_planilla` del dominio `mediciones/` (Back 2), o None si todavía no está en el código."""
    try:
        return importlib.import_module("app.mediciones.planilla").leer_planilla
    except (ImportError, AttributeError):
        return None


def _rechazo(motivo: str) -> ResultadoPlanilla:
    return ResultadoPlanilla(ok=False, errores=[AvisoFila(fila=None, motivo=motivo)])


def _respuesta(resultado: ResultadoPlanilla) -> JSONResponse:
    return JSONResponse(status_code=200 if resultado.ok else 422, content=resultado.model_dump(mode="json"))


@router.post(
    "/mediciones/planilla",
    response_model=ResultadoPlanilla,
    responses={413: {"model": Error}, 422: {"model": ResultadoPlanilla}},
)
async def subir_planilla(archivo: UploadFile) -> JSONResponse:
    """
    Lee la planilla CSV del productor (lluvia y, si vienen, temperaturas) y devuelve la serie
    mensual para mandar en `entrada.mediciones_propias.serie_mensual`.

    200 si se pudo leer · 422 con los errores por fila si no · 413 si pasa de 1 MB.
    No guarda el archivo ni llama a NASA.
    """
    contenido = await archivo.read(MAX_BYTES_PLANILLA + 1)
    if len(contenido) > MAX_BYTES_PLANILLA:
        return JSONResponse(status_code=413, content={"mensaje": "La planilla supera 1 MB"})
    if not contenido.strip():
        return _respuesta(_rechazo("El archivo está vacío"))

    leer_planilla = _cargar_parser()
    if leer_planilla is None:
        return _respuesta(_rechazo(PARSER_PENDIENTE))
    try:
        resultado = leer_planilla(contenido, archivo.filename)
        if not isinstance(resultado, ResultadoPlanilla):
            resultado = ResultadoPlanilla.model_validate(resultado)
    except Exception:  # noqa: BLE001 — el parser no lanza, pero si lo hace no rompe la API
        log.exception("Falló la lectura de la planilla %s", archivo.filename)
        resultado = _rechazo("No se pudo leer la planilla. Revisá que sea un CSV exportado de Excel o Google Sheets")
    return _respuesta(resultado)
