import type { CapaRaster } from "@/lib/capaRaster";

/**
 * Ejemplo LOCAL de una capa raster, con el formato que propuso Back 2.
 * Solo para tests y para probar el componente sin backend: no se muestra en
 * la app ni representa datos reales del lote.
 *
 * Grilla de 3 columnas × 2 filas sobre un recuadro chico del lote demo.
 * Valores (× 0,1 = % de pendiente), fila 0 = norte:
 *   12  25  -32768(nodata)
 *    8  40   61
 */
const VALORES = [12, 25, -32768, 8, 40, 61];

function int16Base64(valores: number[]): string {
  const bytes = new Uint8Array(valores.length * 2);
  const vista = new DataView(bytes.buffer);
  valores.forEach((v, i) => vista.setInt16(i * 2, v, true));
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

/** PNG transparente de 1×1 (el dibujo no importa para los tests). */
const PNG_VACIO =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export const CAPA_RASTER_EJEMPLO: CapaRaster = {
  id: "pendiente",
  titulo: "Pendiente del lote",
  unidad: "%",
  fuente: "NASADEM",
  campana: "2025/26",
  resolucion_nativa: "30 m",
  resolucion_grilla: "1 segundo de arco (~30 m)",
  bounds: [
    [-33.25, -64.24],
    [-33.24, -64.21],
  ],
  ancho: 3,
  alto: 2,
  png: PNG_VACIO,
  valores: int16Base64(VALORES),
  factor: 0.1,
  nodata: -32768,
  escala: {
    cortes: [0, 2.5, 6],
    colores: ["#2e7d32", "#fdd835", "#c62828"],
    etiquetas: ["0 %", "2,5 %", "6 %+"],
  },
  resumen: { media: 2.9, min: 0.8, max: 6.1, pixeles: 5 },
  confianza: "alta",
  nota: "Ejemplo local, no es dato del lote.",
};
