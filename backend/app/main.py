"""
API de Field Shift (dueño: Back 1).

Correr desde `backend/`:
    py -m uvicorn app.main:app --reload --port 8000
Documentación interactiva: http://localhost:8000/docs

Variables de entorno:
    CORS_ORIGINS  orígenes permitidos separados por coma
                  (por defecto http://localhost:3000 para el front local)
"""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.rutas import router

log = logging.getLogger("fieldshift")

app = FastAPI(
    title="Field Shift API",
    description="Compara la rotación actual con 3 alternativas usando 30 campañas de datos de NASA.",
    version="0.1.0",
)

_origenes = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _error_inesperado(request: Request, exc: Exception) -> JSONResponse:
    """Nunca un 500 sin mensaje: se loguea y se responde con texto fijo."""
    log.exception("Error inesperado en %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"mensaje": "Algo falló al armar la comparación. Probá de nuevo en unos segundos."},
    )


app.include_router(router)
