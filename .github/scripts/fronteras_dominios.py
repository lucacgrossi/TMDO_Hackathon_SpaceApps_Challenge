#!/usr/bin/env python3
"""Fronteras entre dominios del back.

Ningún archivo de `backend/app/{clima,satelite,motor}/` puede importar de otro de esos dominios.
Solo puede importar de su propio dominio y de `app.api.contrato` (los tipos compartidos).
Solo `app/servicio.py` y `app/api/` conectan dominios (por eso no se revisan acá).

Correr desde la raíz del repo:  py .github/scripts/fronteras_dominios.py
"""

from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

RAIZ = "backend"
DOMINIOS = ("clima", "satelite", "motor")
PERMITIDO_COMUN = "app.api.contrato"


def archivos() -> list[str]:
    carpetas = [f"{RAIZ}/app/{d}/" for d in DOMINIOS]
    salida = subprocess.run(["git", "ls-files", *carpetas], capture_output=True, text=True, check=True).stdout
    return [r for r in salida.splitlines() if r.endswith(".py")]


def paquete_de(ruta: str) -> list[str]:
    """Paquete del archivo como lista: backend/app/satelite/ndvi.py -> ['app', 'satelite']."""
    return list(Path(ruta).relative_to(RAIZ).parent.parts)


def modulos_importados(arbol: ast.AST, paquete: list[str]) -> list[tuple[int, str]]:
    """Módulos absolutos que importa el archivo, con su línea. `from app import x` cuenta como `app.x`."""
    encontrados: list[tuple[int, str]] = []
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            encontrados += [(nodo.lineno, a.name) for a in nodo.names]
        elif isinstance(nodo, ast.ImportFrom):
            if nodo.level:  # import relativo: se resuelve contra el paquete del archivo
                base = paquete[: len(paquete) - (nodo.level - 1)]
                modulo = ".".join(base + ([nodo.module] if nodo.module else []))
            else:
                modulo = nodo.module or ""
            if modulo in ("app", "app.api") or not nodo.module:
                encontrados += [(nodo.lineno, f"{modulo}.{a.name}") for a in nodo.names]
            else:
                encontrados.append((nodo.lineno, modulo))
    return encontrados


def permitido(modulo: str, dominio: str) -> bool:
    if modulo == "app" or not modulo.startswith("app."):
        return True  # el paquete raíz solo, o librería estándar o de terceros
    propio = f"app.{dominio}"
    if modulo == propio or modulo.startswith(propio + "."):
        return True
    return modulo == PERMITIDO_COMUN or modulo.startswith(PERMITIDO_COMUN + ".")


def main() -> int:
    errores = 0
    lista = archivos()
    for ruta in lista:
        dominio = Path(ruta).relative_to(f"{RAIZ}/app").parts[0]
        try:
            arbol = ast.parse(Path(ruta).read_text(encoding="utf-8"), filename=ruta)
        except SyntaxError as e:
            errores += 1
            print(f"::error file={ruta},line={e.lineno or 1}::No se pudo analizar el archivo: {e.msg}")
            continue
        for linea, modulo in modulos_importados(arbol, paquete_de(ruta)):
            if not permitido(modulo, dominio):
                errores += 1
                print(
                    f"::error file={ruta},line={linea}::'{dominio}' importa '{modulo}'. "
                    f"Un dominio solo importa de app.{dominio} y de {PERMITIDO_COMUN}; "
                    "conectar dominios es tarea de app/servicio.py."
                )
    if errores:
        print(f"\n{errores} import(s) cruzan fronteras entre dominios.")
        return 1
    print(f"OK: {len(lista)} archivos de {', '.join(DOMINIOS)} respetan las fronteras")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main())
