#!/usr/bin/env python3
"""Nombre de la branch del PR: <nombre>/<tipo>/<area>-<descripcion>.

<tipo> es uno de: feat, fix, docs, chore, data, refactor, test. Solo AVISA (::warning), nunca falla,
porque ya hay branches con otros formatos.

Uso:  py .github/scripts/nombre_branch.py luca/feat/satelite-ndvi-mensual
En la CI el nombre llega por la variable HEAD_REF (no se interpola en el YAML).
"""

from __future__ import annotations

import os
import re
import sys

TIPOS = ("feat", "fix", "docs", "chore", "data", "refactor", "test")
FORMATO = re.compile(rf"^[a-z0-9][a-z0-9_.-]*/(?:{'|'.join(TIPOS)})/[a-z0-9]+(?:-[a-z0-9]+)+$")


def main() -> int:
    rama = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HEAD_REF", "")
    if not rama:
        print("Sin nombre de branch (no es un PR): nada que revisar.")
        return 0
    if FORMATO.match(rama):
        print(f"OK: '{rama}' sigue el formato <nombre>/<tipo>/<area>-<descripcion>")
    else:
        print(
            f"::warning::La branch '{rama}' no sigue <nombre>/<tipo>/<area>-<descripcion> "
            f"(tipo: {', '.join(TIPOS)}; ej.: luca/feat/satelite-ndvi-mensual). Es solo un aviso."
        )
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
