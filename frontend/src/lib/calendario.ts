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
 * Pasos (misma regla que el motor del back, QA H-003):
 * 1. Todo arranca en barbecho.
 * 2. Se pinta el cultivo de verano (`mesesDeVerano`).
 * 3. Se pinta el de invierno, sin pisar al verano (`mesesDeInvierno`).
 *
 * Con trigo o cebada, el invierno conserva su ciclo (junio a noviembre) y el
 * verano va "de 2ª", de diciembre a abril, con mayo en barbecho; la soja pasa a
 * "soja 2ª" y los demás mantienen su clave. Las coberturas (vicia, centeno) se
 * secan el mes anterior a la siembra de verano, que queda en barbecho.
 */
export function calendario(verano: string, invierno: string): CultivoCalendario[] {
  const meses: CultivoCalendario[] = Array(12).fill("barbecho");
  const ver = cultivoDeVerano(verano, invierno);
  if (ver in WIN) mesesDeVerano(verano, invierno).forEach((m) => (meses[m] = ver));
  if (invierno !== "barbecho" && invierno in WIN) {
    const inv = invierno as keyof typeof WIN;
    mesesDeInvierno(verano, invierno).forEach((m) => (meses[m] = inv));
  }
  return meses;
}

/** Trigo o cebada: cultivo de invierno que se cosecha, con el verano de 2ª detrás. */
const esInviernoComercial = (invierno: string) => invierno === "trigo" || invierno === "cebada";

/** Ventana del verano "de 2ª" (diciembre a abril), detrás de trigo o cebada. */
export const VENTANA_2DA: readonly number[] = WIN.soja2;

/**
 * Meses del cultivo de verano (0 = enero), en el orden de su ciclo. Detrás de
 * trigo o cebada, cualquier verano va de 2ª: diciembre a abril.
 */
export function mesesDeVerano(verano: string, invierno: string): number[] {
  if (!(verano in WIN)) return [];
  if (esInviernoComercial(invierno)) return [...VENTANA_2DA];
  return [...WIN[verano as keyof typeof WIN]];
}

/**
 * Meses del cultivo de invierno, en el orden de su ciclo. Trigo y cebada
 * conservan junio a noviembre. Una cobertura termina antes del mes anterior a
 * la siembra de verano (ese mes es el secado y queda en barbecho).
 */
export function mesesDeInvierno(verano: string, invierno: string): number[] {
  if (invierno === "barbecho" || !(invierno in WIN)) return [];
  const propios = WIN[invierno as keyof typeof WIN];
  const ver = mesesDeVerano(verano, invierno);
  if (esInviernoComercial(invierno) || !ver.length) return [...propios];
  const secado = (ver[0] + 11) % 12;
  return propios.filter((m) => m !== secado && !ver.includes(m));
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

const mes = (m: number) => MESES[m].toLowerCase();

/** "junio a noviembre": del primero al último, en el orden en que vienen (el del ciclo). */
function rango(meses: readonly number[]): string {
  if (meses.length === 1) return mes(meses[0]);
  return `${mes(meses[0])} a ${mes(meses[meses.length - 1])}`;
}

/**
 * Nota del panel cuando el calendario corre un cultivo de su ventana típica,
 * para que no cambie en silencio (QA H-003). Describe, no recomienda.
 * - Trigo o cebada: "Con trigo en invierno, el maíz va de 2ª: diciembre a
 *   abril, con mayo en barbecho. El trigo va de junio a noviembre."
 * - Cobertura recortada por el secado: "La vicia se seca en agosto, el mes
 *   anterior a la siembra de girasol: va de mayo a julio."
 * null si los dos cultivos quedan en su ventana típica.
 */
/** "el maíz", "la soja": artículo para las notas del calendario. */
function conArticulo(c: CultivoCalendario): string {
  const n = C[c].n.toLowerCase();
  return `${c === "soja" || c === "cebada" || c === "vicia" ? "la" : "el"} ${n}`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function notaCalendario(verano: string, invierno: string): string | null {
  if (!(verano in WIN) || invierno === "barbecho" || !(invierno in WIN)) return null;
  const ver = verano as keyof typeof WIN;
  const inv = invierno as keyof typeof WIN;
  const nVer = C[ver].n.toLowerCase();
  const nInv = C[inv].n.toLowerCase();
  if (esInviernoComercial(invierno)) {
    return (
      `Con ${nInv} en invierno, ${conArticulo(ver)} va de 2ª: ${rango(mesesDeVerano(verano, invierno))}, con mayo en barbecho. ` +
      `${mayuscula(conArticulo(inv))} va de ${rango(mesesDeInvierno(verano, invierno))}.`
    );
  }
  const queda = mesesDeInvierno(verano, invierno);
  if (queda.length === WIN[inv].length) return null;
  const secado = (mesesDeVerano(verano, invierno)[0] + 11) % 12;
  const dondeQueda = queda.length ? `va de ${rango(queda)}` : "no entra en el calendario";
  return `${mayuscula(conArticulo(inv))} se seca en ${mes(secado)}, el mes anterior a la siembra de ${nVer}: ${dondeQueda}.`;
}
