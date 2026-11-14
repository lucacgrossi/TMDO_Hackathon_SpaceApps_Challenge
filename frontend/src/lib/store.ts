"use client";

import { create } from "zustand";
import { ENTRADAS_INICIALES, type Entradas } from "./entradas";

/**
 * Estado compartido del front (zustand).
 *
 * Por qué zustand y no un Context: el mapa (Leaflet) y el panel son árboles
 * distintos, y con zustand cada componente se suscribe solo a lo que usa, así
 * mover una barra no redibuja el mapa. Es una dependencia chica (~1 kB).
 *
 * Uso en un componente:
 *   const verano = useEntradas((s) => s.verano);
 *   const cambiar = useEntradas((s) => s.cambiar);
 *   cambiar({ verano: "maiz" });
 *
 * Regla: las entradas solo se cambian con `cambiar` (o una acción de acá),
 * nunca mutando el objeto. Así React se entera y la persona 5 lee lo mismo.
 */
interface Acciones {
  /** Cambia uno o varios campos de las entradas. */
  cambiar: (parcial: Partial<Entradas>) => void;
  /** Vuelve todo a los valores iniciales (por ejemplo, "Nueva comparación"). */
  reiniciar: () => void;
}

export const useEntradas = create<Entradas & Acciones>()((set) => ({
  ...ENTRADAS_INICIALES,
  cambiar: (parcial) => set(parcial),
  reiniciar: () => set(ENTRADAS_INICIALES),
}));
