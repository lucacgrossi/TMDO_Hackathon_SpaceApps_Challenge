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

import type { Bounds, CapaRaster, EscalaCapa } from "./contrato";

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
  return valorPixel(capa, p.fila, p.columna, cache);
}

/** Los valores decodificados de cada capa, una sola vez por objeto (el inspector lee en cada movimiento). */
const decodificadas = new WeakMap<CapaRaster, Int16Array | null>();

/** `valores` decodificado y guardado; null si la capa no trae valores por píxel. */
export function valoresDe(capa: CapaRaster): Int16Array | null {
  if (!decodificadas.has(capa)) decodificadas.set(capa, capa.valores ? decodificarValores(capa.valores) : null);
  return decodificadas.get(capa) ?? null;
}

/**
 * Valor real de `valores[fila][columna]` (× `factor`), para el inspector de
 * píxel con el mouse o con las flechas del teclado. null fuera de la grilla,
 * en `nodata` o si la capa no trae valores.
 */
export function valorPixel(capa: CapaRaster, fila: number, columna: number, cache?: Int16Array): number | null {
  if (!Number.isInteger(fila) || !Number.isInteger(columna)) return null;
  if (fila < 0 || columna < 0 || fila >= capa.alto || columna >= capa.ancho) return null;
  const valores = cache ?? valoresDe(capa);
  if (!valores) return null;
  const entero = valores[fila * capa.ancho + columna];
  if (entero === undefined || entero === capa.nodata) return null;
  return entero * capa.factor;
}

/** Centro del píxel [lat, lng]: donde se dibuja el recuadro del inspector. */
export function centroPixel(capa: CapaRaster, fila: number, columna: number): [number, number] {
  const [[sur, oeste], [norte, este]] = capa.bounds;
  const lat = norte - ((fila + 0.5) / capa.alto) * (norte - sur);
  const lng = oeste + ((columna + 0.5) / capa.ancho) * (este - oeste);
  return [lat, lng];
}

/**
 * Clase de la escala del back en la que cae un valor: el último corte que es
 * menor o igual (cada corte es el piso de su clase). Por debajo del primer
 * corte cuenta como la primera clase. null si la escala está vacía o el valor no es un número.
 */
export function claseEscala(escala: EscalaCapa, valor: number): number | null {
  if (!Number.isFinite(valor) || escala.cortes.length === 0) return null;
  let i = 0;
  escala.cortes.forEach((corte, k) => {
    if (valor >= corte) i = k;
  });
  return Math.min(i, escala.colores.length - 1);
}

/** Color de la escala del back para un valor (barritas de la línea de tiempo, inspector). */
export function colorEscala(escala: EscalaCapa, valor: number): string | null {
  const i = claseEscala(escala, valor);
  return i == null ? null : (escala.colores[i] ?? null);
}
