"use client";

import { useApp, type ErrorAnalisis, type Evento } from "./app";
import { useComparacion } from "./comparacion";
import type { Entradas } from "./entradas";
import { useResultadoStore, type Resultado } from "./resultado";
import { useEntradas } from "./store";

/**
 * La conexión "Analizar lote" → `cargando` → `POST /analizar` → `dashboard`,
 * o vuelta a `configurar` con el error (PLAN.md, persona 4, punto 5).
 *
 * El pedido NO se hace acá: lo hace `resultado.ts` (mock o API según
 * `NEXT_PUBLIC_USAR_MOCK`) cada vez que cambia la foto de las entradas
 * (`comparacion.ts`), y guarda la `Salida` en `useResultadoStore`, de donde la
 * lee el dashboard. Este módulo solo pasa el flujo a `cargando`, saca la foto
 * y, cuando el resultado cambia, lo traduce a un evento de `useApp`.
 */

/** Texto fijo cuando el back rechaza el pedido por el esquema (422 con `{detail}`). */
export const MENSAJE_PEDIDO_INVALIDO =
  "El pedido no tiene el formato que espera el servidor. Es un error de la app, no de los datos de tu lote.";

/**
 * Error de `/analizar` para mostrar en S3b, a partir del resultado con error.
 * - 422 con `{mensaje}`: el `mensaje` tal cual, no reintentable.
 * - 503, tiempo agotado o sin conexión: el `mensaje`, reintentable.
 * - 422 con `{detail}`: error de la app, con un texto fijo y no reintentable.
 */
export function errorDeResultado(r: Extract<Resultado, { estado: "error" }>): ErrorAnalisis {
  const estado = r.codigo ?? null;
  if (r.deLaApp) return { mensaje: MENSAJE_PEDIDO_INVALIDO, estado, reintentable: false, deLaApp: true };
  return { mensaje: r.mensaje, estado, reintentable: r.reintentable };
}

/** Qué evento del flujo dispara un resultado: listo → dashboard, error → panel con el error. */
export function eventoDeResultado(r: Resultado): Evento | null {
  if (r.estado === "listo") return { tipo: "analisisListo" };
  if (r.estado === "error") return { tipo: "analisisFallo", error: errorDeResultado(r) };
  return null;
}

/**
 * "Lote de 94,9 ha cerca de Alcira Gigena": dónde está el lote, con el lugar
 * que se buscó. Sin lugar buscado (o con el GPS), null: la frase se acorta.
 */
export function lugarDelLote(e: Pick<Entradas, "ubicacion">): string | null {
  const u = e.ubicacion;
  if (!u || u.precisionM != null || !u.etiqueta.trim()) return null;
  return `cerca de ${u.etiqueta.trim()}`;
}

/**
 * "Analizar lote" (pie del panel S2) y "Probar de nuevo" (S3b): pasa a
 * `cargando` y pide `/analizar` con las entradas de ahora. Solo desde
 * `configurar`; en otra etapa no hace nada.
 */
export function analizarLote(): void {
  const app = useApp.getState();
  if (app.etapa !== "configurar") return;
  app.analizar();
  // Foto nueva de las entradas → resultado.ts pide /analizar (y aborta uno anterior).
  useComparacion.getState().volverAComparar();
}

// Cada resultado nuevo mueve el flujo, pero solo mientras se espera uno: una
// respuesta que llega cuando la etapa ya no es `cargando` (por ejemplo, la
// hoja del prototipo pidiendo por su cuenta) se ignora.
useResultadoStore.subscribe((actual, anterior) => {
  if (actual.resultado === anterior.resultado) return;
  const app = useApp.getState();
  if (app.etapa !== "cargando") return;
  const ev = eventoDeResultado(actual.resultado);
  if (ev?.tipo === "analisisListo") app.analisisListo();
  else if (ev?.tipo === "analisisFallo") app.analisisFallo(ev.error);
});
