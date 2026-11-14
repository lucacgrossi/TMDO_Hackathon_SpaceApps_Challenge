"""Cliente HTTP de `satelite/`: certificados del sistema + los de certifi.

httpx usa por defecto solo los certificados de certifi. En máquinas con antivirus o proxy que
inspeccionan HTTPS (por ejemplo, AVG en Windows) el certificado raíz que firma las respuestas está
en el almacén del sistema y no en certifi, así que todo pedido falla con CERTIFICATE_VERIFY_FAILED.
Sumando los dos almacenes funciona ahí y también en Cloud Run (mismo criterio que `clima/power.py`).
"""
from __future__ import annotations

import ssl

import certifi
import httpx

USER_AGENT = "field-shift-backend"


def contexto_ssl() -> ssl.SSLContext:
    """Contexto que verifica con los certificados del sistema y, además, con los de certifi."""
    ctx = ssl.create_default_context()  # carga el almacén del sistema (en Windows, el de Windows)
    ctx.load_verify_locations(certifi.where())
    return ctx


def cliente(timeout: float) -> httpx.Client:
    """Cliente compartido por un módulo: reusa conexiones y es seguro entre hilos."""
    return httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}, verify=contexto_ssl())
