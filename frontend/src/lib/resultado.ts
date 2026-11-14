"use client";

import { useMemo } from "react";
import { mockAnalizar } from "@/mocks/analizar";
import { useComparacion } from "./comparacion";
import type { Salida } from "./contrato";

/**
 * El resultado de /analizar que muestra la hoja.
 *
 * Se arma con la FOTO de las entradas del último "Comparar" (`comparacion.ts`),
 * no con las entradas en vivo: lo que cambie el productor después queda en el
 * aviso de "comparación anterior" hasta que vuelva a comparar.
 *
 * Hoy devuelve el mock (sin backend). En la auditoría con los del back pasa a
 * pedir la API cada vez que cambia la foto; por eso ya tiene los estados
 * "cargando" y "error", así los componentes no cambian cuando se conecte.
 */
export type Resultado =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; datos: Salida };

export function useResultado(): Resultado {
  const foto = useComparacion((s) => s.foto);

  return useMemo<Resultado>(() => {
    // Sin foto todavía no se comparó: es lo que se ve mientras llega la respuesta
    if (!foto) return { estado: "cargando" };
    const { noSembrar, mediciones } = foto;
    return { estado: "listo", datos: mockAnalizar({ noSembrar, ...mediciones }) };
  }, [foto]);
}
