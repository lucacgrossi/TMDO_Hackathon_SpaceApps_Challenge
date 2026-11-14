#!/usr/bin/env python3
"""Sin .env commiteados: solo se permite `.env.example`.

Falla si hay versionado un archivo `.env`, `.env.local`, `.env.production`, `prod.env`, etc.
Las claves van en variables de entorno, nunca en el repo.

Correr desde la raíz del repo:  py .github/scripts/sin_env.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import PurePosixPath

PERMITIDO = ".env.example"


def es_env(nombre: str) -> bool:
    return nombre != PERMITIDO and (nombre == ".env" or nombre.startswith(".env.") or nombre.endswith(".env"))


def main() -> int:
    versionados = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    malos = [r for r in versionados if es_env(PurePosixPath(r).name)]
    for ruta in malos:
        print(f"::error file={ruta}::Archivo de entorno versionado. Solo se permite {PERMITIDO} (sin valores reales).")
    if malos:
        print(f"\n{len(malos)} archivo(s) .env versionados. Sacarlos con `git rm --cached` y rotar las claves que tuvieran.")
        return 1
    print(f"OK: ningún .env versionado (solo se permite {PERMITIDO})")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
