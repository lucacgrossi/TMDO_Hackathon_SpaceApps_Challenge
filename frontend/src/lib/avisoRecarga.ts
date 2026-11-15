/**
 * Aviso al recargar o cerrar la pestaña con el dashboard abierto: el análisis
 * no se guarda (RNF6), así que recargar lo pierde. El navegador muestra su
 * propio cartel; el texto no se puede elegir.
 *
 * El link "Enviar por mail" (`mailto:`) dispara `beforeunload` en algunos
 * navegadores aunque no se salga de la página: `pausarAvisoRecarga()` lo
 * apaga un instante antes de abrir el link.
 */

/** Cuánto dura la pausa después de tocar un link que no sale de la página. */
export const PAUSA_MS = 1000;

let pausadoHasta = 0;

/** Apaga el aviso por `PAUSA_MS` (para links `mailto:`). */
export function pausarAvisoRecarga(ahora: number = Date.now()): void {
  pausadoHasta = ahora + PAUSA_MS;
}

/** true si corresponde pedir confirmación al salir. Puro salvo por la pausa. */
export function debeAvisar(ahora: number = Date.now()): boolean {
  return ahora >= pausadoHasta;
}

/** Handler de `beforeunload`: pide confirmación salvo durante la pausa. */
export function alSalir(e: BeforeUnloadEvent): void {
  if (!debeAvisar()) return;
  e.preventDefault();
  // Navegadores viejos piden además `returnValue`
  e.returnValue = "";
}
