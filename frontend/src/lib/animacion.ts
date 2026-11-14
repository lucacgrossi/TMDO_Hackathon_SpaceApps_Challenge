/**
 * Cuentas de las animaciones de la hoja, sin React ni DOM (se prueban con vitest).
 * Es el `tween()` del prototipo: 380 ms con salida cúbica y valores enteros.
 */

/** Duración del paso de un número al valor nuevo al mover las barras (prototipo). */
export const DURACION_TWEEN_MS = 380;

/** Salida cúbica: arranca rápido y frena al llegar. */
export function salidaCubica(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * Valor que se muestra a los `ms` milisegundos de arrancar a ir de `desde` a
 * `hasta`, redondeado. `fin` es true cuando ya pasó la duración: el último
 * cuadro siempre muestra el valor exacto.
 */
export function pasoTween(
  desde: number,
  hasta: number,
  ms: number,
  duracion = DURACION_TWEEN_MS,
): { valor: number; fin: boolean } {
  const p = duracion > 0 ? Math.min(1, Math.max(0, ms / duracion)) : 1;
  if (p >= 1) return { valor: hasta, fin: true };
  return { valor: Math.round(desde + (hasta - desde) * salidaCubica(p)), fin: false };
}

/**
 * Entrada de la hoja (prototipo y DESIGN.md, "Movimiento"): al abrir, las
 * columnas o tarjetas entran en orden, la fila de la rotación se dibuja, las
 * barras de la serie aparecen una tras otra y los números cuentan desde 0.
 */
/** Cuánto dura la clase `intro` en la hoja: lo que tarda la última pieza en llegar. */
export const VENTANA_ENTRADA_MS = 1500;
/** Los números cuentan desde 0 un poco más lento que al mover una barra. */
export const DURACION_ENTRADA_MS = 700;
/** Diferencia entre una columna (o tarjeta) y la siguiente. */
export const PASO_COLUMNA_MS = 70;
/** Diferencia entre una barra de la serie y la siguiente. */
export const PASO_BARRA_MS = 18;

/** Si el sistema pide menos movimiento: sin animaciones (en el servidor, tampoco). */
export function sinMovimiento(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
