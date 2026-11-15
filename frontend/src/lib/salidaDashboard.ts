"use client";

import type { Salida } from "./contrato";
import { type Resultado, useResultado } from "./resultado";

/**
 * La respuesta de /analizar que muestra el dashboard: la última que llegó
 * lista, sea de la API, de la demo precalculada (`es_mock`) o del mock local
 * (`NEXT_PUBLIC_USAR_MOCK`). null mientras carga o si hubo error.
 *
 * Es el punto de montaje de las secciones Mapa y Clima histórico: el
 * `Dashboard` (persona 5) la lee una vez y se la pasa por props a
 * `<SeccionMapa salida={…} />` y `<ClimaHistorico salida={…} />`.
 *
 * A diferencia de `useSalidaDelLote` (capas del mapa de dibujo del prototipo),
 * no descarta el mock: en el dashboard el mock se muestra igual y el
 * encabezado dice que son datos de ejemplo.
 */
export function useSalidaDashboard(): Salida | null {
  return salidaDe(useResultado());
}

/** La regla, pura: solo un resultado listo tiene datos para mostrar. */
export function salidaDe(r: Resultado): Salida | null {
  return r.estado === "listo" ? r.datos : null;
}
