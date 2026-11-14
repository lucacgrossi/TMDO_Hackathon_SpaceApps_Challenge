"use client";

import { create } from "zustand";

/**
 * Aviso corto abajo de la pantalla (el `toast()` del prototipo): dura 1,8 s.
 *
 * Por qué en la base: lo usan el mapa y el buscador (persona 4) y la hoja de
 * resultados (persona 5, "Resumen copiado"). Con un solo store no hay dos
 * avisos encimados. Uso: `useToast.getState().mostrar("Texto")`.
 */
interface Toast {
  texto: string;
  visible: boolean;
  mostrar: (texto: string) => void;
}

let temporizador: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<Toast>()((set) => ({
  texto: "",
  visible: false,
  mostrar: (texto) => {
    clearTimeout(temporizador);
    set({ texto, visible: true });
    // Igual que el prototipo: se apaga a los 1800 ms (el texto queda para el fundido)
    temporizador = setTimeout(() => set({ visible: false }), 1800);
  },
}));
