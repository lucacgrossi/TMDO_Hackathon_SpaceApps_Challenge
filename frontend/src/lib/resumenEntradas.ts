import { C } from "./calendario";
import type { Entradas, LatLng, Objetivo } from "./entradas";
import { areaHa, formatoNumero } from "./geo";

/**
 * Textos del panel de entradas (S2): el resumen de cada sección plegable
 * cuando está cerrada y la ficha del lote. Solo describe lo que cargó el
 * productor: no calcula nada de NASA. Pares y frases cortas, sin puntos medios
 * entre datos (DESIGN.md, "Lenguaje de la interfaz").
 */

/** Orden y nombre de las prioridades, igual que las barras. */
export const PRIORIDADES: readonly { k: Objetivo; n: string }[] = [
  { k: "agua", n: "Agua" },
  { k: "suelo", n: "Suelo" },
  { k: "erosion", n: "Erosión" },
  { k: "ingreso", n: "Ingreso" },
];

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "94,9 ha" (un decimal debajo de 100 ha, como la barra de dibujo). */
export function superficie(poligono: LatLng[]): string {
  const ha = areaHa(poligono);
  return `${formatoNumero(ha, ha < 100 ? 1 : 0)} ha`;
}

/** "33,2477° S, 64,2325° O" */
export function coordenadas([lat, lng]: LatLng): string {
  const ns = lat < 0 ? "S" : "N";
  const eo = lng < 0 ? "O" : "E";
  return `${formatoNumero(Math.abs(lat), 4)}° ${ns}, ${formatoNumero(Math.abs(lng), 4)}° ${eo}`;
}

/** "Soja con barbecho invernal; antes, soja". */
export function resumenRotacion(e: Pick<Entradas, "verano" | "invierno" | "pasada">): string {
  const invierno = e.invierno === "barbecho" ? "barbecho invernal" : minuscula(C[e.invierno].n);
  return `${C[e.verano].n} con ${invierno}; antes, ${minuscula(C[e.pasada].n)}`;
}

/** "Agua 3, Suelo 3, Erosión 3, Ingreso 3". */
export function resumenPrioridades(objetivos: Entradas["objetivos"]): string {
  return PRIORIDADES.map((p) => `${p.n} ${objetivos[p.k]}`).join(", ");
}

/** "Sin riego; no sembrar: vicia y sorgo" o "Sin restricciones". */
export function resumenRestricciones(e: Pick<Entradas, "restricciones" | "noSembrar">): string {
  const partes: string[] = [];
  const r = e.restricciones;
  const lista = [r.sinRiego && "sin riego", r.sinHacienda && "sin hacienda", r.maquinariaLimitada && "maquinaria limitada"];
  const activas = lista.filter((x): x is string => Boolean(x));
  if (activas.length) partes.push(activas.join(", "));
  if (e.noSembrar.length) partes.push(`no sembrar: ${unir(e.noSembrar.map((k) => minuscula(C[k].n)))}`);
  if (!partes.length) return "Sin restricciones";
  const texto = partes.join("; ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ANEGABLE: Record<Entradas["anegable"], string> = { no: "no", a_veces: "a veces", si: "sí", no_se: "no sé" };
const TEXTURA: Record<Entradas["textura"], string> = {
  franco: "franco",
  arenoso: "arenoso",
  arcilloso: "arcilloso",
  no_se: "no sé",
};

/** "Se encharca: no; textura: franco". */
export function resumenDatosLote(e: Pick<Entradas, "anegable" | "textura">): string {
  return `Se encharca: ${ANEGABLE[e.anegable]}; textura: ${TEXTURA[e.textura]}`;
}

/** "Sin cargar" o "Planilla lluvia.csv": las mediciones llegan solo por planilla. */
export function resumenMediciones(m: Entradas["mediciones"]): string {
  return m.planilla?.resultado.ok ? `Planilla ${m.planilla.nombre}` : "Sin cargar";
}

/** "a", "a y b", "a, b y c". */
function unir(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
