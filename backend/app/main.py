"""
API de AgroPixel (dueño: Back 1).

Correr desde `backend/`:
    py -m uvicorn app.main:app --reload --port 8000
Documentación interactiva: http://localhost:8000/docs

Variables de entorno:
    CORS_ORIGINS       orígenes permitidos separados por coma
                       (por defecto http://localhost:3000 para el front local)
    CORS_ORIGIN_REGEX  opcional: expresión regular de orígenes permitidos. El deploy ya no la
                       usa (desde el 15/11 todos los orígenes van en CORS_ORIGINS); queda para
                       pruebas con URL que cambian en cada deploy
"""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.rutas import router

log = logging.getLogger("fieldshift")

app = FastAPI(
    title="AgroPixel API",
    description="Compara la rotación actual con 3 alternativas usando 30 campañas de datos de NASA.",
    version="0.1.0",
)

MENSAJE_ERROR_INESPERADO = "Algo falló al armar la comparación. Probá de nuevo en unos segundos."


# Middleware y no `@app.exception_handler(Exception)`: ese handler corre afuera de CORS, así que el
# 500 salía sin `Access-Control-Allow-Origin`, el navegador lo bloqueaba y el front mostraba "el
# servidor no contestó" en vez de este mensaje. Se declara antes de `CORSMiddleware` para que CORS
# quede por fuera y también envuelva el 500.
@app.middleware("http")
async def _error_inesperado(request: Request, call_next):
    """Nunca un 500 sin mensaje: se loguea y se responde con texto fijo."""
    try:
        return await call_next(request)
    except Exception:
        log.exception("Error inesperado en %s", request.url.path)
        return JSONResponse(status_code=500, content={"mensaje": MENSAJE_ERROR_INESPERADO})


_origenes = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)
