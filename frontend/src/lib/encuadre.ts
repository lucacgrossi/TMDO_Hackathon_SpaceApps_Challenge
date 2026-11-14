"use client";

import { create } from "zustand";

/**
 * Encuadre del mapa: cuánto margen dejar para que el lote no quede tapado
 * por el panel, y un "pedido" para reencuadrar desde fuera del mapa.
 *
 * Sale de `pads()` y `focus()` del prototipo (prototipo-app.js ~línea 372).
 *
 * Por qué un pedido y no llamar al mapa directo: el panel (por ejemplo el
 * botón "Lote de ejemplo" de ResumenLote) está fuera de <MapContainer>, así
 * que no puede usar `useMap()`. En vez de pasar el objeto de Leaflet por
 * todos lados, el panel deja un pedido acá y el componente Encuadre (que sí
 * está dentro del mapa) lo atiende. Es el mismo patrón que `useEntradas`.
 */

/** Ancho a partir del cual el CSS del prototipo apila mapa y panel (celu). */
export const ANCHO_CELU = 900;

/** Zoom máximo al encuadrar el lote (focus del prototipo usa 17). */
export const ZOOM_LOTE = 17;

export interface Margenes {
  paddingTopLeft: [number, number];
  paddingBottomRight: [number, number];
}

/**
 * Márgenes en píxeles para fitBounds/flyToBounds (pads del prototipo).
 * - Celu: el mapa ocupa todo el ancho; arriba se dejan 90 px para la barra de capas.
 * - Compu: el panel mide 340 px + 16 de margen + aire (392) a la derecha,
 *   y 90 px arriba para la barra de capas.
 * La hoja de resultados (persona 5) suma alto abajo cuando está abierta; ese
 * dato todavía no está en el estado, así que por ahora se toma cerrada.
 * TODO(auditoría): sumar `Math.min(innerHeight * .62, 620) + 32` si la hoja está abierta.
 */
export function margenes(): Margenes {
  if (window.innerWidth <= ANCHO_CELU) {
    return { paddingTopLeft: [24, 90], paddingBottomRight: [24, 24] };
  }
  const altoHoja = 0;
  return { paddingTopLeft: [60, 90], paddingBottomRight: [392 + 60, altoHoja + 40] };
}

interface PedidoEncuadre {
  /** Sube en cada pedido, así dos pedidos iguales seguidos igual se atienden. */
  id: number;
  /** Aire alrededor del lote, como `bounds.pad(x)` de Leaflet (0,3 = 30 %). */
  aire: number;
}

interface EstadoEncuadre {
  pedido: PedidoEncuadre | null;
  /** Pide encuadrar el lote actual (poligono) con un poco de aire alrededor. */
  pedirEncuadre: (aire?: number) => void;
}

export const useEncuadre = create<EstadoEncuadre>()((set, get) => ({
  pedido: null,
  pedirEncuadre: (aire = 0) => set({ pedido: { id: (get().pedido?.id ?? 0) + 1, aire } }),
}));
