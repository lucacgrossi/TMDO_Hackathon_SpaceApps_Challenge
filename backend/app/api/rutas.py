"""Rutas HTTP de la API (dueño: Back 1)."""

from fastapi import APIRouter

from app.api.contrato import Entrada, Error, Salida
from app.api.mock import salida_mock

router = APIRouter()


@router.get("/salud")
def salud() -> dict:
    return {"estado": "ok"}


@router.post(
    "/analizar",
    response_model=Salida,
    responses={422: {"model": Error}, 503: {"model": Error}},
)
def analizar(entrada: Entrada) -> Salida:
    """
    Compara la rotación actual con las alternativas A, B y C.

    Por ahora devuelve el mock fijo de Río Cuarto (`es_mock: true`) con la
    forma exacta del contrato. En el PR 4 pasa a `servicio.analizar()`.
    """
    return salida_mock(entrada)
