#!/usr/bin/env python3
"""¿Cambió algo que le importe a este workflow?

Compara BASE_SHA con HEAD_SHA (por defecto HEAD) y dice si algún archivo cambiado coincide con
alguna de las expresiones regulares recibidas. Escribe `corre=true|false` en $GITHUB_OUTPUT.
Si no hay base (primer push de una branch, force-push, historial incompleto), dice `true`: ante la duda, corre.

Lo usan backend.yml y frontend.yml para saltear el job pesado cuando el PR no toca su lado, sin dejar
el check "pendiente" (un job salteado cuenta como aprobado en las reglas de branch; un workflow que ni
se dispara por `paths:` no).

Uso (desde la raíz del repo):
  BASE_SHA=origin/dev py .github/scripts/cambios.py '^backend/' '^\\.github/workflows/backend\\.yml$'
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

CERO = "0" * 40


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def decidir(base: str, head: str, patrones: list[re.Pattern[str]]) -> tuple[bool, str]:
    if not base or base == CERO:
        return True, "sin commit base"
    if git("cat-file", "-e", f"{base}^{{commit}}").returncode != 0:
        return True, f"la base {base[:10]} no está en el clon"
    diff = git("diff", "--name-only", base, head)
    if diff.returncode != 0:
        return True, "no se pudo calcular el diff"
    archivos = [a for a in diff.stdout.splitlines() if a]
    relevantes = [a for a in archivos if any(p.search(a) for p in patrones)]
    if relevantes:
        return True, f"{len(relevantes)} de {len(archivos)} archivos cambiados importan (ej.: {relevantes[0]})"
    return False, f"ninguno de los {len(archivos)} archivos cambiados importa"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    patrones = [re.compile(p) for p in sys.argv[1:]]
    corre, motivo = decidir(os.environ.get("BASE_SHA", ""), os.environ.get("HEAD_SHA", "HEAD"), patrones)
    print(f"corre={str(corre).lower()}: {motivo}")
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            f.write(f"corre={str(corre).lower()}\n")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
