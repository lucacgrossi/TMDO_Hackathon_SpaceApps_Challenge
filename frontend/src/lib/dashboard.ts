/**
 * Lógica pura del esqueleto del dashboard (persona 5): las 3 secciones con su
 * título y la ficha del lote del encabezado. Sin React.
 *
 * La ficha solo LEE la respuesta de /analizar y le da formato: no calcula
 * superficie, campaña ni período (vienen del back).
 */
import type { Salida } from "./contrato";
import { fmt } from "./formato";

/**
 * Las 3 secciones del dashboard. Cuando llegue `useApp` (`src/lib/app.ts`,
 * paso 0 de persona 4) con su propio tipo `seccion`, este tipo tiene que
 * coincidir con aquel.
 */
export type Seccion = "mapa" | "clima" | "rotaciones";

export interface DatosSeccion {
  id: Seccion;
  /** Texto del menú lateral. */
  menu: string;
  /** Título (H1) del encabezado. */
  titulo: string;
}

/** En el orden del menú. */
export const SECCIONES: readonly DatosSeccion[] = [
  { id: "mapa", menu: "Mapa", titulo: "Mapa del lote" },
  { id: "clima", menu: "Clima histórico", titulo: "Clima histórico" },
  { id: "rotaciones", menu: "Rotaciones", titulo: "Rotaciones" },
];

export function datosSeccion(id: Seccion): DatosSeccion {
  return SECCIONES.find((s) => s.id === id) ?? SECCIONES[0];
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
 * Pares etiqueta/valor del encabezado, siempre los 4 y en este orden:
 * Superficie, Campaña satelital, Clima, Tus mediciones.
 * `null` del back se muestra como "sin dato", nunca como 0.
 */
export function fichaDelLote(s: Salida): ParFicha[] {
  const area = s.lote.area_ha;
  const campana = s.visto_por_satelite.campana;
  const anios = s.clima_mensual.n_anios;
  const periodo = s.periodo_clima;
  const mediciones = s.contraste_mediciones.length;

  return [
    { etiqueta: "Superficie", valor: Number.isFinite(area) ? `${fmt(area, 1)} ha` : SIN_DATO },
    { etiqueta: "Campaña satelital", valor: campana ?? SIN_DATO },
    {
      etiqueta: "Clima",
      valor: periodo ? `${anios} ${anios === 1 ? "campaña" : "campañas"}, ${periodo}` : SIN_DATO,
    },
    {
      etiqueta: "Tus mediciones",
      valor:
        mediciones === 0
          ? "Sin cargar"
          : `${mediciones} ${mediciones === 1 ? "dato" : "datos"} contra NASA`,
    },
  ];
}
