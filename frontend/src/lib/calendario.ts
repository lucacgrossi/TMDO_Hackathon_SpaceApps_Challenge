/**
 * Calendario de 12 meses de una rotación (RF2).
 *
 * Sale del prototipo final: `C` (cultivos), `WIN` (meses que ocupa cada
 * cultivo), `cal(summer, winter)` (arma los 12 meses) y `segs(cal)` (junta
 * meses seguidos del mismo cultivo para dibujar barras). Acá solo copiamos
 * esas reglas fijas, sin los puntajes del prototipo (cons, nfix, rast…):
 * esos los calcula el backend (persona 3).
 *
 * Son funciones puras (no leen ni escriben estado): la persona 5 las reusa
 * para dibujar el calendario de cada tarjeta (actual, A, B, C).
 */

/** Todo lo que puede ocupar un mes del calendario. */
export type CultivoCalendario =
  | "soja"
  | "soja2"
  | "maiz"
  | "girasol"
  | "sorgo"
  | "mani"
  | "trigo"
  | "cebada"
  | "vicia"
  | "centeno"
  | "barbecho";

/** Grupo del cultivo: decide el color (variables --verano, --invierno, --cobertura, --barbecho). */
export type GrupoCultivo = "verano" | "invierno" | "cobertura" | "barbecho";

/** Nombre a mostrar y grupo de cada cultivo (const C del prototipo, sin puntajes). */
export const C: Record<CultivoCalendario, { n: string; g: GrupoCultivo }> = {
  soja: { n: "Soja", g: "verano" },
  soja2: { n: "Soja 2ª", g: "verano" },
  maiz: { n: "Maíz", g: "verano" },
  girasol: { n: "Girasol", g: "verano" },
  sorgo: { n: "Sorgo", g: "verano" },
  mani: { n: "Maní", g: "verano" },
  trigo: { n: "Trigo", g: "invierno" },
  cebada: { n: "Cebada", g: "invierno" },
  // Vicia y centeno no se cosechan: son cultivos de cobertura (alternativa A).
  vicia: { n: "Vicia", g: "cobertura" },
  centeno: { n: "Centeno", g: "cobertura" },
  barbecho: { n: "Barbecho", g: "barbecho" },
};

/**
 * Meses que ocupa cada cultivo, de 0 (enero) a 11 (diciembre). Va de la
 * siembra a la cosecha o al secado (const WIN del prototipo).
 * Barbecho no figura: es lo que queda en los meses sin cultivo.
 */
export const WIN: Record<Exclude<CultivoCalendario, "barbecho">, number[]> = {
  soja: [10, 11, 0, 1, 2, 3],
  // Soja de segunda: se siembra en diciembre, después de cosechar el trigo o la cebada.
  soja2: [11, 0, 1, 2, 3],
  maiz: [9, 10, 11, 0, 1, 2, 3],
  girasol: [8, 9, 10, 11, 0, 1],
  sorgo: [10, 11, 0, 1, 2, 3],
  mani: [10, 11, 0, 1, 2, 3],
  trigo: [5, 6, 7, 8, 9, 10],
  cebada: [5, 6, 7, 8, 9, 10],
  vicia: [4, 5, 6, 7, 8],
  centeno: [4, 5, 6, 7, 8],
};

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Inicial de cada mes, para el eje (M1 del prototipo). */
export const INICIALES_MES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const;

/**
 * Orden en que se dibujan los meses: campaña de julio a junio (ORD del
 * prototipo). Así el ciclo de verano (noviembre a abril) queda en una sola
 * barra y no partido entre el final y el principio del año.
 */
export const ORDEN_CAMPANA = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5] as const;

/**
 * Arma los 12 meses (índice 0 = enero) de una rotación verano + invierno
 * (cal del prototipo).
 *
 * Pasos:
 * 1. Todo arranca en barbecho.
 * 2. Se pinta el cultivo de invierno, si hay.
 * 3. Se pinta el de verano encima: si se pisan meses, gana el verano.
 *
 * Regla: soja después de trigo o cebada pasa a "soja 2ª", que se siembra un
 * mes más tarde (diciembre), porque el lote está ocupado hasta noviembre.
 */
export function calendario(verano: string, invierno: string): CultivoCalendario[] {
  const meses: CultivoCalendario[] = Array(12).fill("barbecho");

  if (invierno !== "barbecho" && invierno in WIN) {
    const inv = invierno as keyof typeof WIN;
    WIN[inv].forEach((m) => (meses[m] = inv));
  }

  let ver = verano as keyof typeof WIN;
  if ((invierno === "trigo" || invierno === "cebada") && verano === "soja") ver = "soja2";
  if (ver in WIN) WIN[ver].forEach((m) => (meses[m] = ver));

  return meses;
}

/** Tramo de meses seguidos con el mismo cultivo. */
export interface Segmento {
  cultivo: CultivoCalendario;
  /** Posición del primer mes dentro de ORDEN_CAMPANA (0 = julio). */
  desde: number;
  /** Cantidad de meses del tramo. */
  meses: number;
}

/**
 * Junta meses seguidos del mismo cultivo, en orden de campaña (segs del
 * prototipo). Sirve para dibujar una barra por cultivo en vez de 12 celdas.
 */
export function segmentos(cal: CultivoCalendario[]): Segmento[] {
  const out: Segmento[] = [];
  ORDEN_CAMPANA.forEach((m, i) => {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.cultivo === cal[m]) ultimo.meses++;
    else out.push({ cultivo: cal[m], desde: i, meses: 1 });
  });
  return out;
}

/** "Soja: noviembre a abril", para el título (tooltip) de cada tramo. */
export function describirSegmento(s: Segmento): string {
  const primero = MESES[ORDEN_CAMPANA[s.desde]].toLowerCase();
  const ultimo = MESES[ORDEN_CAMPANA[s.desde + s.meses - 1]].toLowerCase();
  return s.meses === 1 ? `${C[s.cultivo].n}: ${primero}` : `${C[s.cultivo].n}: ${primero} a ${ultimo}`;
}
