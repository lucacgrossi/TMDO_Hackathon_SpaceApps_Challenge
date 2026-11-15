import type { Bounds } from "./contrato";
import type { LatLng } from "./entradas";

/**
 * Recorte de una capa raster al polígono del lote: lo que está fuera del lote
 * no se dibuja. La grilla del back cubre el rectángulo que encierra al lote,
 * así que sin recorte los píxeles de las esquinas (que no son del lote) se
 * ven por fuera del borde.
 *
 * El PNG se agranda con un factor entero (sin suavizado: los píxeles siguen
 * siendo cuadrados nítidos) y se recorta con el contorno exacto del lote. Esto
 * es la parte pura: dónde cae cada esquina del lote dentro de la imagen.
 * Leaflet estira el `ImageOverlay` en coordenadas proyectadas (Web Mercator),
 * por eso la latitud se pasa a Mercator y no se interpola lineal.
 */

/** Lado máximo, en píxeles, de la imagen agrandada (cuida la memoria en lotes grandes). */
const LADO_MAXIMO = 2048;
/** Factor máximo: con 16 el borde del recorte ya se ve liso en la pantalla. */
const FACTOR_MAXIMO = 16;

/** Factor entero para agrandar una imagen de `ancho` × `alto` píxeles antes de recortarla. */
export function factorRecorte(ancho: number, alto: number): number {
  const lado = Math.max(ancho, alto, 1);
  return Math.max(1, Math.min(FACTOR_MAXIMO, Math.floor(LADO_MAXIMO / lado)));
}

const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Esquinas del lote en píxeles de una imagen de `ancho` × `alto` que cubre
 * `bounds` ([[sur, oeste], [norte, este]]). (0, 0) es la esquina noroeste.
 */
export function esquinasEnImagen(poligono: readonly LatLng[], bounds: Bounds, ancho: number, alto: number): [number, number][] {
  const [[sur, oeste], [norte, este]] = bounds;
  const yNorte = mercator(norte);
  const alturaMerc = yNorte - mercator(sur);
  return poligono.map(([lat, lng]) => [
    ((lng - oeste) / (este - oeste)) * ancho,
    ((yNorte - mercator(lat)) / alturaMerc) * alto,
  ]);
}
