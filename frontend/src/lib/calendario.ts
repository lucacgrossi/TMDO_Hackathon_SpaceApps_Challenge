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

  const ver = cultivoDeVerano(verano, invierno);
  if (ver in WIN) WIN[ver].forEach((m) => (meses[m] = ver));

  return meses;
}

/**
 * El cultivo de verano que va al calendario: soja después de trigo o cebada
 * pasa a "soja 2ª" (diciembre). Los demás quedan igual.
 */
export function cultivoDeVerano(verano: string, invierno: string): keyof typeof WIN {
  if ((invierno === "trigo" || invierno === "cebada") && verano === "soja") return "soja2";
  return verano as keyof typeof WIN;
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

/**
 * Nombre de un tramo en el calendario del panel. El barbecho es "Barbecho
 * (pelado)", igual que en la tabla: el mismo término en el rótulo y en el
 * `aria-label` (QA H-027).
 */
export function nombreTramo(c: CultivoCalendario): string {
  return c === "barbecho" ? "Barbecho (pelado)" : C[c].n;
}

/** "Soja: noviembre a abril", para el título (tooltip) y el `aria-label` de cada tramo. */
export function describirSegmento(s: Segmento): string {
  const primero = MESES[ORDEN_CAMPANA[s.desde]].toLowerCase();
  const ultimo = MESES[ORDEN_CAMPANA[s.desde + s.meses - 1]].toLowerCase();
  const nombre = nombreTramo(s.cultivo);
  return s.meses === 1 ? `${nombre}: ${primero}` : `${nombre}: ${primero} a ${ultimo}`;
}

/** Cuando el verano pisa al invierno: qué meses y cómo queda el invierno en el calendario. */
export interface Solapamiento {
  verano: Exclude<CultivoCalendario, "barbecho">;
  invierno: Exclude<CultivoCalendario, "barbecho">;
  /** Meses que ocupan los dos (0 = enero), en el orden del ciclo del invierno (`WIN`). */
  meses: number[];
  /** Meses que le quedan al invierno en el calendario, en el orden de su ciclo. */
  inviernoQueda: number[];
}

/**
 * Si el cultivo de verano se siembra antes de que termine el de invierno, con
 * las ventanas típicas de `WIN`. `calendario()` pinta el verano encima, así que
 * el invierno queda recortado: esto permite avisarlo en vez de recortarlo en
 * silencio (QA H-003). Ej.: maíz (octubre a abril) y trigo (junio a
 * noviembre) se pisan en octubre y noviembre. null si no se pisan.
 */
export function solapamiento(verano: string, invierno: string): Solapamiento | null {
  if (invierno === "barbecho" || !(invierno in WIN)) return null;
  const ver = cultivoDeVerano(verano, invierno);
  if (!(ver in WIN)) return null;
  const inv = invierno as keyof typeof WIN;
  // `WIN` ya está en el orden del ciclo (siembra → cosecha), aunque cruce de año:
  // filtrar lo conserva (el trigo va de junio a noviembre, no "julio a junio").
  const meses = WIN[inv].filter((m) => WIN[ver].includes(m));
  if (!meses.length) return null;
  return { verano: ver, invierno: inv, meses, inviernoQueda: WIN[inv].filter((m) => !WIN[ver].includes(m)) };
}

const mes = (m: number) => MESES[m].toLowerCase();

/** "junio a noviembre": del primero al último, en el orden en que vienen (el del ciclo). */
function rango(meses: number[]): string {
  if (meses.length === 1) return mes(meses[0]);
  return `${mes(meses[0])} a ${mes(meses[meses.length - 1])}`;
}

/** "octubre y noviembre", "septiembre, octubre y noviembre". */
function lista(meses: number[]): string {
  const ns = meses.map(mes);
  return ns.length <= 1 ? ns.join("") : `${ns.slice(0, -1).join(", ")} y ${ns[ns.length - 1]}`;
}

/**
 * Aviso del panel cuando el verano pisa al invierno. Describe, no recomienda:
 * "Maíz (octubre a abril) y trigo (junio a noviembre) se superponen en
 * octubre y noviembre. El calendario muestra trigo de junio a septiembre.
 * Fechas a revisar con el agrónomo."
 */
export function textoSolapamiento(s: Solapamiento): string {
  const ver = C[s.verano].n;
  const inv = C[s.invierno].n.toLowerCase();
  const queda = s.inviernoQueda.length
    ? `El calendario muestra ${inv} de ${rango(s.inviernoQueda)}.`
    : `El calendario no muestra ${inv}.`;
  return (
    `${ver} (${rango(WIN[s.verano])}) y ${inv} (${rango(WIN[s.invierno])}) ` +
    `se superponen en ${lista(s.meses)}. ${queda} Fechas a revisar con el agrónomo.`
  );
}
