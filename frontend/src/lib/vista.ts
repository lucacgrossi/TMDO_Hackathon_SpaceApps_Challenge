"use client";

import { create } from "zustand";

/**
 * Estado de la VISTA (no son entradas del productor, por eso no van en
 * entradas.ts): si la hoja de resultados está abierta.
 *
 * Por qué acá: el botón "Comparar alternativas" está en el panel (persona 4)
 * y la hoja es de la persona 5. Este store es el punto de encuentro: el panel
 * llama a `abrirHoja()` y la hoja lee `hojaAbierta` y llama a `cerrarHoja()`.
 */
interface Vista {
  hojaAbierta: boolean;
  abrirHoja: () => void;
  cerrarHoja: () => void;
}

export const useVista = create<Vista>()((set) => ({
  hojaAbierta: false,
  abrirHoja: () => set({ hojaAbierta: true }),
  cerrarHoja: () => set({ hojaAbierta: false }),
}));
