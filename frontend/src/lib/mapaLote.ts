"use client";

import { create } from "zustand";
import { CAPA_INICIAL, type IdCapaLote } from "./capasLote";

/**
 * Capa que se ve en el mapa de la sección Mapa del dashboard (S4). Es aparte
 * de `useMapa.capa`, que es del mapa de dibujo del prototipo (persona 4) y usa
 * otros códigos. El mes es el de siempre: `useVista().mes` (0 = enero).
 */
interface EstadoMapaLote {
  capa: IdCapaLote;
  cambiarCapa: (capa: IdCapaLote) => void;
}

export const useMapaLote = create<EstadoMapaLote>()((set) => ({
  capa: CAPA_INICIAL,
  cambiarCapa: (capa) => set({ capa }),
}));
