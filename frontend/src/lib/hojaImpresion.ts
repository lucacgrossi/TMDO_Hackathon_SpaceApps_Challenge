/**
 * Lógica pura de la hoja de impresión (S6b, persona 5): la ficha del lote y la
 * lista de fuentes con sus años y resoluciones. Sin React.
 *
 * Todo sale de la respuesta de /analizar (y del polígono analizado para el
 * centro): no se calcula ningún dato de NASA.
 */
import type { Pesos } from "./cercania";
import { OBJETIVOS, type Objetivo, type Salida } from "./contrato";
import { SIN_DATO, fichaDelLote, type ParFicha } from "./dashboard";
import type { LatLng } from "./entradas";
import { coordenadas } from "./resumenEntradas";

export const TITULO_HOJA = "Comparación de rotaciones";

/** Cierre de la lista de fuentes: cómo se arma la comparación. */
export const NOTA_MOTOR = "Reglas fijas del motor de AgroPixel, sin IA. Compara datos: no indica qué hacer.";

const NOMBRE_OBJETIVO: Record<Objetivo, string> = { agua: "Agua", suelo: "Suelo", erosion: "Erosión", ingreso: "Ingreso" };

/** "Agua 3, Suelo 4, Erosión 3, Ingreso 3": con estas prioridades se calculó la cercanía impresa. */
export function textoPrioridades(pesos: Pesos): string {
  return OBJETIVOS.map((o) => `${NOMBRE_OBJETIVO[o]} ${pesos[o]}`).join(", ");
}

/** "15/11/2026" */
export function fechaGeneracion(fecha: Date): string {
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Ficha del lote de la hoja: lugar, los 4 pares del encabezado del dashboard
 * (superficie, campaña satelital, clima, tus mediciones), el centro del
 * polígono analizado y las prioridades.
 */
export function fichaImpresion(s: Salida, centro: LatLng | null, pesos: Pesos): ParFicha[] {
  return [
    { etiqueta: "Lote", valor: s.lote.localidad_aprox ?? SIN_DATO },
    ...fichaDelLote(s),
    { etiqueta: "Centro", valor: centro ? coordenadas(centro) : SIN_DATO },
    { etiqueta: "Prioridades (1 a 5)", valor: textoPrioridades(pesos) },
  ];
}

/** "Fuente (resolución, años)", sin partes vacías. */
function conDetalle(fuente: string, ...detalle: (string | null | undefined)[]): string {
  const d = detalle.filter((x): x is string => Boolean(x && x.trim()));
  return d.length ? `${fuente} (${d.join(", ")})` : fuente;
}

/**
 * Nombre de la fuente sin el detalle: lo que va antes de " (", " · " o " + ".
 * "NASA HLS 30 m + MODIS 250 m (…)" y "NASA HLS 30 m (Landsat + Sentinel-2) …"
 * son la misma fuente: "NASA HLS 30 m".
 */
function nombreFuente(f: string): string {
  return f.split(/ \(| · | \+ /)[0].trim();
}

/**
 * Fuentes del análisis con sus años y resoluciones, una por fuente y en este
 * orden: clima, satélite, indicadores del lote y probabilidades. Si dos textos
 * nombran la misma fuente (la probabilidad repite la de POWER; el satélite y el
 * indicador de NDVI describen HLS distinto), queda el más completo. Los textos
 * vienen del back tal cual.
 */
export function fuentesDelAnalisis(s: Salida): string[] {
  const cm = s.clima_mensual;
  const sat = s.visto_por_satelite;
  const lista = [
    conDetalle(cm.fuente, cm.resolucion, cm.periodo),
    conDetalle(sat.fuente, sat.campana),
    ...Object.values(s.indicadores).map((i) => conDetalle(i.fuente, i.resolucion, i.anios)),
    ...s.estrategias.flatMap((e) => e.probabilidades.map((p) => p.fuente)),
  ];
  // Una por fuente, en el orden en que aparece por primera vez. De dos textos de la
  // misma fuente queda el que dice más (más palabras); si empatan, el primero.
  const porNombre = new Map<string, string>();
  for (const f of lista) {
    const nombre = nombreFuente(f);
    if (!nombre) continue;
    const previo = porNombre.get(nombre);
    if (previo == null || palabras(f) > palabras(previo)) porNombre.set(nombre, f);
  }
  return [...porNombre.values()];
}

/** Cuántas palabras tiene un texto, sin contar separadores ni paréntesis. */
function palabras(f: string): number {
  return f.replace(/[()·,]/g, " ").split(/\s+/).filter(Boolean).length;
}
