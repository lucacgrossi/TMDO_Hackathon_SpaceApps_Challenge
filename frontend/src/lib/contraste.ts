import type { ContrasteMedicion } from "./contrato";

/**
 * Qué produce cada fila de "Tus mediciones, al lado de NASA" (RF15). Repite
 * las reglas del back (`backend/app/clima/correccion.py`) solo para decirlas
 * en palabras; la confianza que queda la decide el back
 * (`confianza_resultante`).
 * - Lluvia anual: si difiere más de 15 % de NASA, baja la confianza del agua.
 * - Heladas y calor: si en un mes difieren en 1 de cada 3 campañas en común o
 *   más, baja la confianza de las heladas (el calor solo se anota para revisar).
 */

/** Diferencia de lluvia con NASA a partir de la cual baja la confianza del agua. */
export const UMBRAL_LLUVIA_PCT = 15;

const NOMBRES: Record<string, string> = {
  lluvia_anual: "Lluvia anual",
  materia_organica: "Materia orgánica",
  helada: "Heladas",
  calor: "Calor (35 °C o más)",
};

/** Nombre de la fila; si el back suma un indicador nuevo, se muestra su clave. */
export function nombreIndicador(indicador: string): string {
  return NOMBRES[indicador] ?? indicador;
}

const A_REVISAR = 'Queda anotado en "A revisar con el agrónomo" de la actual.';

/** La frase que explica qué cambia por esta fila, según el indicador y si difieren. */
export function efectoContraste(c: Pick<ContrasteMedicion, "indicador" | "confianza_resultante">): string {
  const difiere = c.confianza_resultante === "baja";
  switch (c.indicador) {
    case "helada":
      return difiere
        ? `Difieren en 1 de cada 3 campañas en común o más: confianza baja en las heladas. ${A_REVISAR}`
        : "Difieren en menos de 1 de cada 3 campañas en común: la confianza de las heladas no cambia.";
    case "calor":
      return difiere
        ? `Difieren en 1 de cada 3 campañas en común o más. ${A_REVISAR}`
        : "Difieren en menos de 1 de cada 3 campañas en común.";
    default:
      return difiere
        ? `Difieren más de ${UMBRAL_LLUVIA_PCT} %: confianza baja en los datos de agua. ${A_REVISAR}`
        : `Difieren ${UMBRAL_LLUVIA_PCT} % o menos: la confianza del agua no cambia.`;
  }
}
