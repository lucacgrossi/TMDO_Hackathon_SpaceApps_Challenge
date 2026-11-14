#!/usr/bin/env python3
"""Lenguaje prohibido: la app compara, no recomienda.

Falla si en los textos de la app (`frontend/src/**` y `backend/app/**`, plantillas incluidas) aparece
"recomendamos" (cubre "te recomendamos"), "deberías" o "la mejor", sin distinguir mayúsculas ni tildes.
Se excluyen tests, docs y CLAUDE.md. Para una excepción puntual, poner `lenguaje-ok` en esa línea.

Correr desde la raíz del repo:  py .github/scripts/lenguaje_prohibido.py
"""

from __future__ import annotations

import re
import subprocess
import sys
import unicodedata
from pathlib import Path

CARPETAS = ("frontend/src/", "backend/app/")
EXTENSIONES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css", ".html", ".md", ".txt",
    ".py", ".jinja", ".j2", ".yaml", ".yml", ".toml", ".csv",
}  # fmt: skip
# Texto ya normalizado (minúsculas, sin tildes). `\b` evita que "la mejora" cuente como "la mejor".
PROHIBIDAS = {
    "recomendamos": re.compile(r"\brecomendamos\b"),
    "deberías": re.compile(r"\bdeberias\b"),
    "la mejor": re.compile(r"\bla mejor\b"),
}
MARCA_EXCEPCION = "lenguaje-ok"


def normalizar(texto: str) -> str:
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return sin_tildes.lower()


def es_test(ruta: str) -> bool:
    partes = ruta.split("/")
    nombre = partes[-1]
    return (
        "tests" in partes
        or "__tests__" in partes
        or ".test." in nombre
        or ".spec." in nombre
        or nombre.startswith("test_")
        or nombre == "conftest.py"
    )


def archivos() -> list[str]:
    salida = subprocess.run(["git", "ls-files", *CARPETAS], capture_output=True, text=True, check=True).stdout
    return [r for r in salida.splitlines() if Path(r).suffix.lower() in EXTENSIONES and not es_test(r)]


def main() -> int:
    errores = 0
    revisados = 0
    for ruta in archivos():
        try:
            lineas = Path(ruta).read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        revisados += 1
        for n, linea in enumerate(lineas, start=1):
            if MARCA_EXCEPCION in linea:
                continue
            normal = normalizar(linea)
            for nombre, patron in PROHIBIDAS.items():
                if patron.search(normal):
                    errores += 1
                    print(f"::error file={ruta},line={n}::Lenguaje prohibido '{nombre}': la app compara, no recomienda.")
    if errores:
        print(f"\n{errores} aparición(es) de lenguaje prohibido en {revisados} archivos revisados.")
        print("Reescribir describiendo datos (ej.: '5 meses más de cobertura, -60 mm de balance en años secos').")
        return 1
    print(f"OK: sin lenguaje prohibido en {revisados} archivos de {', '.join(CARPETAS)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
