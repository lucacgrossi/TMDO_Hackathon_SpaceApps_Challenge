#!/usr/bin/env python3
"""Archivos pesados y datos satelitales crudos.

Falla si un archivo agregado o modificado:
  - pesa más de 1 MB;
  - es un dato satelital crudo (.nc, .hdf, .h5, .tif, .tiff, .zarr) fuera de `backend/tests/**/fixtures/`;
  - está en `backend/tests/**/fixtures/` y pesa más de 200 KB.

Uso (desde la raíz del repo):
  py .github/scripts/archivos_pesados.py --base origin/dev    # solo lo que cambió respecto de la base
  py .github/scripts/archivos_pesados.py                      # todo lo versionado
En la CI, `--base` es el commit base del PR (o el `before` del push).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

MAX_GENERAL = 1_000_000  # 1 MB
MAX_FIXTURE = 200_000  # 200 KB
CRUDOS = {".nc", ".nc4", ".hdf", ".he5", ".h5", ".tif", ".tiff"}
FIXTURES = re.compile(r"^backend/tests/(?:.+/)?fixtures/")
CERO = "0" * 40


def git(*args: str) -> list[str]:
    salida = subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout
    return [linea for linea in salida.splitlines() if linea]


def candidatos(base: str | None) -> list[str]:
    if not base or base == CERO:
        return git("ls-files")
    return git("diff", "--name-only", "--diff-filter=AM", f"{base}...HEAD")


def es_crudo(ruta: str) -> bool:
    """Extensión cruda, o cualquier archivo dentro de una carpeta `*.zarr` (un zarr es un directorio)."""
    p = Path(ruta)
    return p.suffix.lower() in CRUDOS or any(parte.lower().endswith(".zarr") for parte in p.parts)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", help="commit/rama base; sin esto se revisa todo lo versionado")
    base = ap.parse_args().base

    errores = 0
    lista = candidatos(base)
    for ruta in lista:
        archivo = Path(ruta)
        if not archivo.is_file():
            continue
        peso = archivo.stat().st_size
        kb = peso / 1000
        en_fixtures = bool(FIXTURES.match(ruta))
        if es_crudo(ruta) and not en_fixtures:
            errores += 1
            print(f"::error file={ruta}::Dato satelital crudo fuera de backend/tests/**/fixtures. "
                  "Los datos pesados no se commitean: se bajan en vivo o se precalculan (JSON chico).")
        if en_fixtures and peso > MAX_FIXTURE:
            errores += 1
            print(f"::error file={ruta}::Fixture de {kb:.0f} KB (máximo {MAX_FIXTURE // 1000} KB). "
                  "Recortar el ejemplo al mínimo que necesita el test.")
        elif not en_fixtures and peso > MAX_GENERAL:
            errores += 1
            print(f"::error file={ruta}::Archivo de {kb:.0f} KB (máximo {MAX_GENERAL // 1000} KB).")
    alcance = f"cambiados desde {base}" if base and base != CERO else "versionados"
    if errores:
        print(f"\n{errores} problema(s) entre {len(lista)} archivos {alcance}.")
        return 1
    print(f"OK: {len(lista)} archivos {alcance} sin problemas de tamaño ni datos crudos")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
