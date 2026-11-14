/**
 * Capa raster del lote que va a mandar el backend (propuesta de Back 2 en el
 * PR #25 y `docs/plan-armonizacion-capas.md`): NDVI de cada mes, pendiente,
 * erosión y cultivo, ya pintados sobre una grilla común del lote.
 *
 * Por qué así: el back calcula y el front solo dibuja, para que el mapa y la
 * tabla muestren el mismo número. Todas las capas comparten `bounds`, así que
 * sus píxeles se superponen exactamente.
 *
 * El tipo es el de `contrato.ts`. `valores` puede venir null (NDVI de lotes
 * grandes): sin valores no hay "tocar un píxel", pero el PNG se dibuja igual.
 */

import type { Bounds, CapaRaster } from "./contrato";

/** El tipo es el del contrato (`contrato.ts`, copia de `contrato.py`): un solo tipo para el mapa y la tabla. */
export type { CapaRaster };

/** [[sur, oeste], [norte, este]], como los `bounds` de Leaflet. */
export type Limites = Bounds;

/** Imagen lista para `ImageOverlay`. */
export function urlImagen(capa: CapaRaster): string {
  return capa.png.startsWith("data:") ? capa.png : `data:image/png;base64,${capa.png}`;
}

/** base64 → Int16Array (little-endian, como lo escribe numpy en x86). */
export function decodificarValores(base64: string): Int16Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const vista = new DataView(bytes.buffer);
  const n = Math.floor(bytes.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = vista.getInt16(i * 2, true);
  return out;
}

/**
 * Fila y columna del píxel que cae en (lat, lng), o null si está fuera.
 * La fila 0 es el borde norte (como una imagen), la columna 0 el oeste.
 */
export function pixelEn(capa: CapaRaster, lat: number, lng: number): { fila: number; columna: number } | null {
  const [[sur, oeste], [norte, este]] = capa.bounds;
  if (lat < sur || lat > norte || lng < oeste || lng > este) return null;
  const fila = Math.min(capa.alto - 1, Math.floor(((norte - lat) / (norte - sur)) * capa.alto));
  const columna = Math.min(capa.ancho - 1, Math.floor(((lng - oeste) / (este - oeste)) * capa.ancho));
  return { fila, columna };
}

/**
 * Valor real del píxel en (lat, lng): `valores[fila][columna] × factor` (RF18).
 * null si está fuera de la grilla o el píxel es `nodata`.
 * `cache` evita decodificar el base64 en cada movimiento del mouse.
 */
export function valorEn(capa: CapaRaster, lat: number, lng: number, cache?: Int16Array): number | null {
  const p = pixelEn(capa, lat, lng);
  if (!p) return null;
  const valores = cache ?? (capa.valores ? decodificarValores(capa.valores) : null);
  if (!valores) return null;
  const entero = valores[p.fila * capa.ancho + p.columna];
  if (entero === undefined || entero === capa.nodata) return null;
  return entero * capa.factor;
}
