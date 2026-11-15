import { fmt } from "./formato";

/**
 * Textos de la pantalla de carga (S3) y del error del análisis (S3b).
 * DESIGN.md, "Pantalla de carga" y "Lenguaje de la interfaz".
 */

/**
 * "Lote de 94,9 ha cerca de Río Cuarto." `lugar` llega armado desde quien
 * dispara el análisis ("cerca de Río Cuarto"); sin superficie o sin lugar,
 * la frase se acorta en vez de inventar.
 */
export function textoLote(superficieHa: number | null, lugar: string | null): string {
  const donde = lugar?.trim() ? ` ${lugar.trim()}` : "";
  if (superficieHa == null || !Number.isFinite(superficieHa) || superficieHa <= 0) return `Tu lote${donde}.`;
  return `Lote de ${fmt(superficieHa, 1)} ha${donde}.`;
}

/** "Suele tardar hasta 30 s; van 12 s." Los segundos se redondean hacia abajo. */
export function textoTiempo(msTranscurridos: number): string {
  const s = Number.isFinite(msTranscurridos) ? Math.max(0, Math.floor(msTranscurridos / 1000)) : 0;
  return `Suele tardar hasta 30 s; van ${s} s.`;
}

/** Lo que pide `/analizar` en un solo pedido, con la fuente y la resolución de cada parte. */
export const CONSULTAS: readonly { dato: string; detalle: string; fuente: string; resolucion: string }[] = [
  {
    dato: "Clima",
    detalle: "Lluvia, temperaturas, heladas y balance de agua de 30 campañas",
    fuente: "NASA POWER (comunidad AG)",
    resolucion: "~50 km (0,5° × 0,625°)",
  },
  {
    dato: "Vegetación",
    detalle: "NDVI mes a mes de la última campaña",
    fuente: "NASA HLS (Landsat + Sentinel-2), MODIS de respaldo",
    resolucion: "30 m (MODIS: 250 m)",
  },
  {
    dato: "Relieve",
    detalle: "Pendiente y riesgo de erosión",
    fuente: "NASADEM",
    resolucion: "30 m",
  },
  {
    dato: "Uso del suelo",
    detalle: "Si el polígono es un lote agrícola",
    fuente: "ESA WorldCover 2021",
    resolucion: "10 m",
  },
  {
    dato: "Comparación",
    detalle: "Tu rotación contra las alternativas A, B y C",
    fuente: "Reglas fijas de AgroPixel sobre los datos de arriba",
    resolucion: "El lote",
  },
];

export type AccionError = "marcar" | "reintentar" | "ejemplo";

export interface TextosError {
  titulo: string;
  comoSeguir: string;
  /** La primera es la acción principal. */
  acciones: readonly [AccionError, AccionError];
}

/**
 * Qué pasó y cómo seguir según el código de `/analizar` (api-frontend.md §4.2).
 * 422: el polígono no es un lote agrícola. 503: NASA POWER no respondió.
 * Cualquier otro (500, red caída): error genérico con "Probar de nuevo".
 * `deLaApp` (422 con `{detail}`): el pedido no cumplió el esquema; reintentar
 * no lo arregla, así que se ofrece el lote de ejemplo o marcar de nuevo.
 */
export function textosError(codigo: number, deLaApp = false): TextosError {
  if (deLaApp) {
    return {
      titulo: "No se pudo armar el pedido del análisis",
      comoSeguir: "Probá con el lote de ejemplo de Río Cuarto o volvé a marcar el lote.",
      acciones: ["ejemplo", "marcar"],
    };
  }
  if (codigo === 422) {
    return {
      titulo: "Este polígono no parece un lote agrícola",
      comoSeguir: "Marcá otro lote sobre un campo cultivado o probá con el lote de ejemplo de Río Cuarto.",
      acciones: ["marcar", "ejemplo"],
    };
  }
  if (codigo === 503) {
    return {
      titulo: "NASA POWER no responde",
      comoSeguir:
        "Probá de nuevo en unos minutos. El lote de ejemplo usa datos precalculados y anda sin NASA POWER.",
      acciones: ["reintentar", "ejemplo"],
    };
  }
  return {
    titulo: "No se pudo terminar el análisis",
    comoSeguir: "Probá de nuevo. El lote de ejemplo usa datos precalculados y anda sin conexión con el servidor.",
    acciones: ["reintentar", "ejemplo"],
  };
}

/** Etiqueta del botón de cada acción (sin flechas, el verbo describe la acción). */
export const ETIQUETAS_ACCION: Record<AccionError, string> = {
  marcar: "Marcar otro lote",
  reintentar: "Probar de nuevo",
  ejemplo: "Probar con el lote de ejemplo",
};
