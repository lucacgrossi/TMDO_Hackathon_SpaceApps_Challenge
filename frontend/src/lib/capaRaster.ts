/**
 * Capa raster del lote que va a mandar el backend (propuesta de Back 2 en el
 * PR #25 y `docs/plan-armonizacion-capas.md`): NDVI de cada mes, pendiente,
 * erosión y cultivo, ya pintados sobre una grilla común del lote.
 *
 * Por qué así: el back calcula y el front solo dibuja, para que el mapa y la
 * tabla muestren el mismo número. Todas las capas comparten `bounds`, así que
 * sus píxeles se superponen exactamente.
 *
 * OJO: este tipo copia la PROPUESTA de Luca. El contrato lo define la
 * persona 1 (Benja suma `CapaRaster` al contrato con un mock). Cuando eso
 * llegue a `src/lib/contrato.ts`, este tipo se reemplaza por el de ahí. La
 * conexión con `/analizar` se hace en la auditoría, no antes.
 */

/** [[sur, oeste], [norte, este]], como los `bounds` de Leaflet. */
export type Limites = [[number, number], [number, number]];

export interface EscalaRaster {
  /** Límites de cada clase, de menor a mayor (por ejemplo NDVI 0 · 0,15 · 0,3 …). */
  cortes: number[];
  /** Un color por clase (`cortes.length - 1` colores). */
  colores: string[];
  /** Texto de cada corte o clase, para la leyenda. */
  etiquetas: string[];
}

export interface CapaRaster {
  id: string;
  titulo: string;
  unidad: string;
  fuente: string;
  /** Una de las dos: fecha de la escena ("AAAA-MM-DD") o campaña ("2025/26"). */
  fecha?: string;
  campana?: string;
  /** Resolución del dato original, por ejemplo "30 m". */
  resolucion_nativa: string;
  /** Resolución de la grilla común (1 segundo de arco, ~30 m). */
  resolucion_grilla: string;
  bounds: Limites;
  /** Columnas y filas de la grilla. */
  ancho: number;
  alto: number;
  /** PNG en base64 (sin el prefijo data:), transparente fuera del lote. */
  png: string;
  /** Valores int16 little-endian en base64, fila por fila desde el NORTE. */
  valores: string;
  /** valor real = entero × factor (por ejemplo 0,001 para NDVI). */
  factor: number;
  /** Entero que significa "sin dato" (fuera del lote, nubes…). */
  nodata: number;
  escala: EscalaRaster;
  resumen: { media: number; min: number; max: number; pixeles: number };
  confianza: string;
  nota?: string;
}

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
  const valores = cache ?? decodificarValores(capa.valores);
  const entero = valores[p.fila * capa.ancho + p.columna];
  if (entero === undefined || entero === capa.nodata) return null;
  return entero * capa.factor;
}
