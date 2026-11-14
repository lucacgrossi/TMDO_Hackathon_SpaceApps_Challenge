"""Precalcula la respuesta de /analizar del lote de ejemplo → `app/demo/rio_cuarto.json`.

Es el seguro contra el WiFi de la demo: si NASA POWER no responde y el lote es el de ejemplo,
`api/rutas.py` devuelve este JSON (con `es_mock: true` y el aviso en "Información que falta").

Sale del mismo código del backend (`servicio.analizar`), no se escribe a mano: hay que correrlo
de nuevo después de cada cambio de contrato, de motor o de datos. Desde `backend/`:

    py scripts/precalcular_demo.py                 # entrada: tests/ejemplos/entrada_demo.json
    py scripts/precalcular_demo.py --entrada otra.json --salida /tmp/x.json
    py scripts/precalcular_demo.py --forzar        # escribe aunque falte una fuente

Si alguna fuente de NASA falla (indicador `sin_dato`), no escribe el archivo, salvo con `--forzar`:
un respaldo con huecos es peor que el anterior.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:  # para correrlo como `py scripts/precalcular_demo.py`
    sys.path.insert(0, str(BACKEND))

from app import servicio  # noqa: E402
from app.api.contrato import Entrada, Salida  # noqa: E402

ENTRADA_DEMO = BACKEND / "tests" / "ejemplos" / "entrada_demo.json"
SALIDA_DEMO = BACKEND / "app" / "demo" / "rio_cuarto.json"
TAMANO_MAX_KB = 500  # el JSON va al deploy y al front: tiene que quedar chico


def problemas(salida: Salida) -> tuple[list[str], list[str]]:
    """(errores que impiden escribir, avisos que se muestran pero no impiden)."""
    errores, avisos = [], []
    if salida.es_mock:
        errores.append("la salida es el mock (es_mock: true), no el cálculo real")
    lote = {"lote.pendiente_pct": salida.lote.pendiente_pct,
            "lote.cobertura_agricola_pct": salida.lote.cobertura_agricola_pct}
    for nombre, ind in {**lote, **{f"indicadores.{k}": v for k, v in salida.indicadores.items()}}.items():
        if ind is not None and ind.confianza == "sin_dato":
            errores.append(f"{nombre} sin dato: {ind.motivo}")
    vps = salida.visto_por_satelite
    if vps.meses_con_dato == 0:
        errores.append(f"NDVI sin ningún mes con dato: {vps.motivo}")
    elif vps.meses_con_dato < 12:
        avisos.append(f"NDVI con {vps.meses_con_dato} de 12 meses")
    if not any(salida.capas.ndvi_mensual):
        errores.append("capas.ndvi_mensual vacía: el mapa NDVI no andaría sin internet")
    if salida.capas.erosion is None:
        avisos.append("capas.erosion sin dato")
    if any(servicio.MOTOR_PENDIENTE in f for f in salida.informacion_falta):
        avisos.append("el motor de reglas no está en el código: columnas sin puntajes (regenerar cuando llegue)")
    return errores, avisos


def resumen(salida: Salida) -> str:
    vps, ind = salida.visto_por_satelite, salida.indicadores
    valor = lambda k: ind[k].valor if k in ind else None  # noqa: E731
    puntos = {e.id: e.puntos.model_dump(exclude={"agua"}) if e.puntos else None for e in salida.estrategias}
    return "\n".join([
        f"  Período de clima: {salida.periodo_clima}",
        f"  Pendiente: {salida.lote.pendiente_pct.valor} % · cultivo: {salida.lote.cobertura_agricola_pct.valor} %",
        f"  Lluvia: {valor('lluvia_anual')} mm · balance: {valor('balance_anual')} mm · "
        f"ET real: {valor('et_real_anual')} mm",
        f"  NDVI {vps.campana}: {vps.meses_con_dato}/12 meses, {vps.meses_ndvi_bajo} < {vps.umbral} · "
        f"capas NDVI: {sum(1 for c in salida.capas.ndvi_mensual if c)}/12 · "
        f"erosión: {(salida.capas.erosion or {}).get('valor')}",
        f"  Estrategias: {puntos}",
        f"  Información que falta: {len(salida.informacion_falta)}",
    ])


def precalcular(entrada_path: Path = ENTRADA_DEMO, salida_path: Path = SALIDA_DEMO,
                forzar: bool = False) -> int:
    """Corre el análisis y escribe el JSON. Devuelve el código de salida (0 = escrito)."""
    entrada = Entrada.model_validate(json.loads(entrada_path.read_text(encoding="utf-8")))
    t0 = time.perf_counter()
    try:
        salida = servicio.analizar(entrada)
    except servicio.ErrorServicio as e:
        print(f"ERROR: /analizar respondió {e.estado}: {e.mensaje}. No se escribe {salida_path.name}.")
        return 1
    segundos = time.perf_counter() - t0

    errores, avisos = problemas(salida)
    print(f"Análisis del lote de ejemplo en {segundos:.1f} s")
    print(resumen(salida))
    for a in avisos:
        print(f"AVISO: {a}")
    for e in errores:
        print(f"ERROR: {e}")
    if errores and not forzar:
        print(f"No se escribe {salida_path.name} (usar --forzar para escribirlo igual).")
        return 1

    # Ida y vuelta por el contrato: lo que se escribe es exactamente lo que lee `api/rutas.py`.
    datos = salida.model_dump(mode="json")
    Salida.model_validate(datos)
    texto = json.dumps(datos, ensure_ascii=False, indent=1) + "\n"
    kb = len(texto.encode("utf-8")) / 1024
    if kb > TAMANO_MAX_KB:
        print(f"ERROR: el JSON pesa {kb:.0f} KB (máximo {TAMANO_MAX_KB} KB).")
        return 1
    salida_path.parent.mkdir(parents=True, exist_ok=True)
    salida_path.write_text(texto, encoding="utf-8", newline="\n")
    print(f"Escrito {salida_path} ({kb:.0f} KB)")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--entrada", type=Path, default=ENTRADA_DEMO, help="Entrada de /analizar (JSON)")
    p.add_argument("--salida", type=Path, default=SALIDA_DEMO, help="Dónde escribir la respuesta")
    p.add_argument("--forzar", action="store_true", help="Escribir aunque falte alguna fuente")
    a = p.parse_args(argv)
    return precalcular(a.entrada, a.salida, a.forzar)


if __name__ == "__main__":
    sys.exit(main())
