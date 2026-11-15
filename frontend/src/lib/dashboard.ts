/**
 * Lógica pura del esqueleto del dashboard (persona 5): el menú de las 3
 * secciones con su título y la ficha del lote del encabezado. Sin React.
 *
 * La ficha solo LEE la respuesta de /analizar y le da formato: no calcula
 * superficie, campaña ni período (vienen del back).
 */
import type { Seccion } from "./app";
import type { Salida } from "./contrato";
import { fmt } from "./formato";
import type { NombreIcono } from "./pixel";

export interface ItemMenu {
  id: Seccion;
  /** Texto del menú lateral. */
  menu: string;
  /** Título (H1) del encabezado. */
  titulo: string;
  icono: NombreIcono;
}

/** Ítems del menú lateral, en orden. Las secciones en sí están en `SECCIONES` de `app.ts`. */
export const MENU_SECCIONES: readonly ItemMenu[] = [
  { id: "mapa", menu: "Mapa", titulo: "Mapa del lote", icono: "mapa" },
  { id: "clima", menu: "Clima histórico", titulo: "Clima histórico", icono: "clima" },
  { id: "rotaciones", menu: "Rotaciones", titulo: "Rotaciones", icono: "rotacion" },
];

export function itemMenu(id: Seccion): ItemMenu {
  return MENU_SECCIONES.find((s) => s.id === id) ?? MENU_SECCIONES[0];
}

export const SIN_DATO = "sin dato";

/** Texto del encabezado cuando la respuesta es la demo precalculada (`es_mock`). */
export const TEXTO_PRECALCULADO = "Datos precalculados del lote de ejemplo";

/** Banda `--warn` cuando las entradas cambiaron después del análisis. */
export const TEXTO_DESACTUALIZADO = "Cambiaste entradas después del análisis. Analizá de nuevo para actualizar.";

export interface ParFicha {
  etiqueta: string;
  valor: string;
}

/**
 * "Tus mediciones": "Sin cargar" si no hay contraste; con planilla, cuántas
 * campañas distintas se compararon con NASA (`campanas_comparadas` de cada
 * fila); "Cargadas" si hay mediciones pero ninguna trae campañas.
 */
export function textoMediciones(s: Salida): string {
  if (s.contraste_mediciones.length === 0) return "Sin cargar";
  const campanas = new Set(s.contraste_mediciones.flatMap((c) => c.campanas_comparadas ?? []));
  if (campanas.size === 0) return "Cargadas";
  return `Planilla, ${campanas.size} ${campanas.size === 1 ? "campaña comparada" : "campañas comparadas"} con NASA`;
}

/**
 * Pares etiqueta/valor del encabezado, siempre los 4 y en este orden:
 * Superficie, Campaña satelital, Clima, Tus mediciones.
 * `null` del back se muestra como "sin dato", nunca como 0.
 */
export function fichaDelLote(s: Salida): ParFicha[] {
  const area = s.lote.area_ha;
  const campana = s.visto_por_satelite.campana;
  const anios = s.clima_mensual.n_anios;
  const periodo = s.periodo_clima;

  return [
    { etiqueta: "Superficie", valor: Number.isFinite(area) ? `${fmt(area, 1)} ha` : SIN_DATO },
    { etiqueta: "Campaña satelital", valor: campana ?? SIN_DATO },
    {
      etiqueta: "Clima",
      valor: periodo ? `${anios} ${anios === 1 ? "campaña" : "campañas"}, ${periodo}` : SIN_DATO,
    },
    { etiqueta: "Tus mediciones", valor: textoMediciones(s) },
  ];
}
