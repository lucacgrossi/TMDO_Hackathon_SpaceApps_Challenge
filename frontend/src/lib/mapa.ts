"use client";

import { create } from "zustand";

/**
 * Estado de lo que se VE en el mapa (no son entradas del productor, por eso
 * no van en entradas.ts): si el lote está a la vista, si el mapa está volando,
 * si se muestra la marca del lugar elegido y cuándo arrancar el dibujo.
 *
 * Sale de `hideLote()`, `showLote()`, `showTarget()` y del final de `goMap()`
 * del prototipo (prototipo-app.js ~líneas 375-383 y 150).
 *
 * Por qué hace falta: en el prototipo final el lote NO se ve en el paso 1 ni
 * durante el vuelo al paso 2 (el zoom animado engorda el borde blanco y se ve
 * feo). Aparece con un fundido recién cuando el mapa llega (`moveend`).
 * Quien mueve la cámara (Encuadre) y quien dibuja el lote (CapaLote) son
 * componentes distintos: este store es el punto de encuentro entre los dos.
 */
interface EstadoMapa {
  /** false en el paso 1 y mientras el mapa vuela; true cuando el lote se muestra (con fundido). */
  loteVisible: boolean;
  /** true mientras dura un vuelo de cámara (flyTo / flyToBounds). */
  volando: boolean;
  /** Marca `.tmark` del lugar elegido con el buscador (showTarget del prototipo). */
  marcaVisible: boolean;
  /**
   * Sube en 1 cada vez que hay que arrancar el dibujo del lote (startDraw del
   * prototipo). Es un contador y no un booleano para que dos pedidos seguidos
   * igual se atiendan; lo escucha el modo dibujo (F5).
   */
  pedidoDibujo: number;
  cambiarMapa: (parcial: Partial<Omit<EstadoMapa, "cambiarMapa" | "pedirDibujo">>) => void;
  pedirDibujo: () => void;
}

export const useMapa = create<EstadoMapa>()((set, get) => ({
  loteVisible: false,
  volando: false,
  marcaVisible: false,
  pedidoDibujo: 0,
  cambiarMapa: (parcial) => set(parcial),
  pedirDibujo: () => set({ pedidoDibujo: get().pedidoDibujo + 1 }),
}));
