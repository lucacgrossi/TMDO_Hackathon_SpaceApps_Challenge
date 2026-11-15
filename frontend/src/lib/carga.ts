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

export type AccionError = "marcar" | "reintentar";

export interface TextosError {
  titulo: string;
  /**
   * Qué pasó, en una frase. Si está, reemplaza al `mensaje` del back (que dice
   * lo mismo con otras palabras); si no, se muestra el `mensaje` tal cual.
   */
  explicacion?: string;
  comoSeguir: string;
  /** Una o dos; la primera es la acción principal. */
  acciones: readonly AccionError[];
}

/**
 * Qué pasó y cómo seguir según el código de `/analizar` (api-frontend.md §4.2).
 * - 422: el polígono no es un lote agrícola.
 * - 503: el sistema de NASA (NASA POWER) no respondió al servidor de AgroPixel.
 * - 0 (sin respuesta, tiempo agotado): el que no responde es el servidor de
 *   AgroPixel, no internet; salvo que el navegador diga que está sin conexión
 *   (`sinInternet`).
 * - Otro (500…): no se pudo terminar el análisis.
 * `deLaApp` (422 con `{detail}`): el pedido no cumplió el esquema; reintentar
 * no lo arregla, así que solo se ofrece marcar de nuevo.
 * Nunca se muestra el código HTTP. No hay lote de ejemplo: el productor
 * siempre marca el suyo.
 */
export function textosError(codigo: number, deLaApp = false, sinInternet = false): TextosError {
  if (deLaApp) {
    return {
      titulo: "No se pudo armar el pedido del análisis",
      comoSeguir: "Volvé a marcar el lote. Si se repite, es un error de la app y no de tu lote.",
      acciones: ["marcar"],
    };
  }
  if (codigo === 422) {
    return {
      titulo: "Este polígono no parece un lote agrícola",
      comoSeguir: "Marcá otro lote sobre un campo cultivado.",
      acciones: ["marcar"],
    };
  }
  if (codigo === 503) {
    return {
      titulo: "El sistema de NASA (NASA POWER) no responde",
      explicacion:
        "El clima de 30 campañas del lote sale de NASA POWER, y ese servicio no contestó. Sin esos datos no se puede armar la comparación.",
      comoSeguir: "Tu lote y tus entradas quedan como están. Probá de nuevo en unos minutos.",
      acciones: ["reintentar"],
    };
  }
  if (codigo === 0 && sinInternet) {
    return {
      titulo: "Sin conexión a internet",
      explicacion: "El navegador no tiene conexión, así que el pedido no llegó al servidor de AgroPixel.",
      comoSeguir: "Tu lote y tus entradas quedan como están. Probá de nuevo cuando vuelva la conexión.",
      acciones: ["reintentar"],
    };
  }
  if (codigo === 0) {
    return {
      titulo: "El servidor de AgroPixel no responde",
      comoSeguir: "Tu lote y tus entradas quedan como están. Probá de nuevo en unos segundos.",
      acciones: ["reintentar"],
    };
  }
  return {
    titulo: "No se pudo terminar el análisis",
    comoSeguir: "Tu lote y tus entradas quedan como están. Probá de nuevo en unos segundos.",
    acciones: ["reintentar"],
  };
}

/** Etiqueta del botón de cada acción (sin flechas, el verbo describe la acción). */
export const ETIQUETAS_ACCION: Record<AccionError, string> = {
  marcar: "Marcar otro lote",
  reintentar: "Probar de nuevo",
};
