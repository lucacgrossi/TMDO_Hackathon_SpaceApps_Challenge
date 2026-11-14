"use client";

import { useMemo } from "react";
import { mockAnalizar } from "@/mocks/analizar";
import type { Salida } from "./contrato";
import { useEntradas } from "./store";

/**
 * El resultado de /analizar que muestra la hoja.
 *
 * Hoy devuelve el mock (sin backend). En la auditoría con los del back pasa a
 * pedir la API; por eso ya tiene los estados "cargando" y "error", así los
 * componentes no cambian cuando se conecte.
 */
export type Resultado =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; datos: Salida };

export function useResultado(): Resultado {
  // Solo las entradas que cambian la salida del mock. Los objetivos NO están:
  // mover las barras recalcula la cercanía en el front sin pedir datos (RF13).
  const noSembrar = useEntradas((s) => s.noSembrar);
  const lluviaAnualMm = useEntradas((s) => s.mediciones.lluviaAnualMm);
  const materiaOrganicaPct = useEntradas((s) => s.mediciones.materiaOrganicaPct);

  return useMemo<Resultado>(
    () => ({ estado: "listo", datos: mockAnalizar({ noSembrar, lluviaAnualMm, materiaOrganicaPct }) }),
    [noSembrar, lluviaAnualMm, materiaOrganicaPct],
  );
}
