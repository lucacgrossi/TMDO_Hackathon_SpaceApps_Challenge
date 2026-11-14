"use client";

import { create } from "zustand";

/**
 * Estado de la VISTA (no son entradas del productor, por eso no van en
 * entradas.ts): si la hoja de resultados está abierta.
 *
 * Por qué acá: el botón "Comparar alternativas" está en el panel (persona 4)
 * y la hoja es de la persona 5. Este store es el punto de encuentro: el panel
 * llama a `abrirHoja()` y la hoja lee `hojaAbierta` y llama a `cerrarHoja()`.
 *
 * `mes` es el mes que muestra el mapa (`S.month` del prototipo): lo cambian la
 * línea de tiempo y el botón ▶ (persona 4) y lo leen las capas, la leyenda y el
 * cursor de la línea de la campaña en la hoja (persona 5, `moveCursor`).
 * Va de 0 (enero) a 11 (diciembre), igual que `MES` en el prototipo.
 */
interface Vista {
  hojaAbierta: boolean;
  abrirHoja: () => void;
  cerrarHoja: () => void;
  mes: number;
  cambiarMes: (mes: number) => void;
}

/** El prototipo arranca en julio (`month: 6`): pleno invierno, cuando se ve el barbecho. */
export const MES_INICIAL = 6;

export const useVista = create<Vista>()((set) => ({
  hojaAbierta: false,
  abrirHoja: () => set({ hojaAbierta: true }),
  cerrarHoja: () => set({ hojaAbierta: false }),
  mes: MES_INICIAL,
  // ((m % 12) + 12) % 12 deja siempre un mes válido, también si llega -1 o 12
  cambiarMes: (mes) => set({ mes: ((mes % 12) + 12) % 12 }),
}));
