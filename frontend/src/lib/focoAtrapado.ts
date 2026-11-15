/**
 * Foco atrapado de los modales (DESIGN.md, "Accesibilidad"): con el modal
 * abierto, Tab y Mayús+Tab recorren solo sus controles y dan la vuelta en
 * los extremos. El componente busca los enfocables con `SELECTOR_ENFOCABLES`
 * y mueve el foco al índice que devuelve `destinoTab`.
 */

/** Controles que pueden recibir el foco con Tab dentro del modal. */
export const SELECTOR_ENFOCABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * Índice del control que recibe el foco al apretar Tab.
 *
 * - `actual`: índice del control con foco, o -1 si el foco está fuera de la
 *   lista (por ejemplo, en el contenedor del modal).
 * - `total`: cantidad de controles enfocables.
 * - `haciaAtras`: true con Mayús+Tab.
 *
 * Devuelve -1 si no hay controles: el foco se queda en el contenedor.
 */
export function destinoTab(actual: number, total: number, haciaAtras: boolean): number {
  if (total <= 0) return -1;
  if (actual < 0 || actual >= total) return haciaAtras ? total - 1 : 0;
  const paso = haciaAtras ? -1 : 1;
  return (actual + paso + total) % total;
}
