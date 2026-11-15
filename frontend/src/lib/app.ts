"use client";

import { create } from "zustand";

/**
 * Estado del FLUJO de la app (DESIGN.md, "Flujo y pantallas"): en qué etapa
 * está el productor y qué sección del dashboard mira. Reemplaza a `paso`,
 * `body.onb` (ClaseBody) y `hojaAbierta`.
 *
 *   marcar ──loteListo──▶ configurar ──analizar──▶ cargando ──listo──▶ dashboard
 *     ▲                     │  ▲                     │                   │
 *     └───volverAMarcar─────┘  └──────fallo (error)──┘                   │
 *                              └────────────volverAEditar────────────────┘
 *
 * Las transiciones son una función pura (`transicion`) para poder probarlas
 * sin React; el store solo la aplica. Un evento que no corresponde a la etapa
 * actual no cambia nada (por ejemplo, "analizar" desde el dashboard).
 */

export type Etapa = "marcar" | "configurar" | "cargando" | "dashboard";
export type Seccion = "mapa" | "clima" | "rotaciones";

export const SECCIONES: readonly Seccion[] = ["mapa", "clima", "rotaciones"];

/** Error de /analizar que se muestra en `configurar` (S3b). */
export interface ErrorAnalisis {
  /** Texto del back tal cual (o el de `lib/api.ts` si no hubo respuesta). */
  mensaje: string;
  /** Código HTTP (422, 503…) o null si no hubo respuesta (sin conexión, tiempo agotado). */
  estado: number | null;
  /** true si tiene sentido "Probar de nuevo". */
  reintentable: boolean;
  /** El back rechazó el pedido por el esquema (422 con `{detail}`): es un error de la app, no del lote. */
  deLaApp?: boolean;
}

export interface EstadoApp {
  etapa: Etapa;
  seccion: Seccion;
  error: ErrorAnalisis | null;
  /** Ya hubo un análisis exitoso: desde `configurar` se puede volver al dashboard. */
  hayResultado: boolean;
}

export type Evento =
  | { tipo: "loteListo" }
  | { tipo: "volverAMarcar" }
  | { tipo: "analizar" }
  | { tipo: "analisisListo" }
  | { tipo: "analisisFallo"; error: ErrorAnalisis }
  | { tipo: "volverAEditar" }
  | { tipo: "irA"; seccion: Seccion }
  | { tipo: "cerrarError" };

export const ESTADO_INICIAL: EstadoApp = { etapa: "marcar", seccion: "mapa", error: null, hayResultado: false };

/** Próximo estado del flujo. Devuelve el mismo objeto si el evento no aplica. */
export function transicion(e: EstadoApp, ev: Evento): EstadoApp {
  switch (ev.tipo) {
    case "loteListo":
      return e.etapa === "marcar" ? { ...e, etapa: "configurar", error: null } : e;
    case "volverAMarcar":
      return e.etapa === "configurar" ? { ...e, etapa: "marcar", error: null } : e;
    case "analizar":
      return e.etapa === "configurar" ? { ...e, etapa: "cargando", error: null } : e;
    case "analisisListo":
      // Cada análisis nuevo abre el dashboard en el Mapa (DESIGN.md, flujo).
      return e.etapa === "cargando" ? { ...e, etapa: "dashboard", seccion: "mapa", hayResultado: true } : e;
    case "analisisFallo":
      // El pedido fallido reemplazó al resultado anterior en `useResultadoStore`:
      // ya no hay análisis al que volver (sin esto, "Volver al análisis anterior"
      // abría un dashboard vacío).
      return e.etapa === "cargando" ? { ...e, etapa: "configurar", error: ev.error, hayResultado: false } : e;
    case "volverAEditar":
      return e.etapa === "dashboard" ? { ...e, etapa: "configurar", error: null } : e;
    case "irA":
      if (e.etapa === "dashboard") return e.seccion === ev.seccion ? e : { ...e, seccion: ev.seccion };
      // Desde el panel, con un análisis previo, se puede volver a mirarlo.
      if (e.etapa === "configurar" && e.hayResultado) return { ...e, etapa: "dashboard", seccion: ev.seccion, error: null };
      return e;
    case "cerrarError":
      return e.error ? { ...e, error: null } : e;
  }
}

interface Acciones {
  /** S1: el polígono quedó cerrado. */
  loteListo: () => void;
  /** S2: "Volver a marcar el lote". */
  volverAMarcar: () => void;
  /** S2: "Analizar lote". */
  analizar: () => void;
  /** /analizar respondió bien. */
  analisisListo: () => void;
  /** /analizar falló (422, 503, sin conexión…): vuelve al panel con el error. */
  analisisFallo: (error: ErrorAnalisis) => void;
  /** Dashboard: "Editar lote y entradas" (no borra el resultado). */
  volverAEditar: () => void;
  /** Barra lateral del dashboard. */
  irA: (seccion: Seccion) => void;
  cerrarError: () => void;
}

export const useApp = create<EstadoApp & Acciones>()((set) => {
  const aplicar = (ev: Evento) => set((e) => transicion(e, ev));
  return {
    ...ESTADO_INICIAL,
    loteListo: () => aplicar({ tipo: "loteListo" }),
    volverAMarcar: () => aplicar({ tipo: "volverAMarcar" }),
    analizar: () => aplicar({ tipo: "analizar" }),
    analisisListo: () => aplicar({ tipo: "analisisListo" }),
    analisisFallo: (error) => aplicar({ tipo: "analisisFallo", error }),
    volverAEditar: () => aplicar({ tipo: "volverAEditar" }),
    irA: (seccion) => aplicar({ tipo: "irA", seccion }),
    cerrarError: () => aplicar({ tipo: "cerrarError" }),
  };
});
