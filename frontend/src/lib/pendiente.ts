import type { LatLng } from "./entradas";
import { dentroDelPoligono } from "./geo";

/**
 * Pendiente del lote a partir de la elevación de AWS Terrain Tiles (que
 * incluye SRTM). Sale de `loadSlope()`, `blur()`, `solve3()` y `slopeColor()`
 * del prototipo final (prototipo-app.js ~líneas 218-258).
 *
 * Pasos:
 * 1. Se bajan las teselas "terrarium" (zoom 14, ~8 m por píxel) que cubren el lote.
 * 2. Cada píxel codifica la altura en sus colores: alto = R·256 + G + B/256 − 32768 m.
 * 3. Se suaviza la elevación (el modelo tiene ruido de ±1 m que inventaría pendiente).
 * 4. Pendiente de cada píxel = desnivel entre vecinos / distancia, en %.
 * 5. Pendiente general del lote = plano ajustado por mínimos cuadrados a
 *    todas las alturas del lote (robusto al ruido).
 *
 * Las funciones de cálculo son puras (se prueban con vitest); la descarga y
 * el canvas están en `cargarPendiente`, que solo corre en el navegador.
 */

/** Zoom de las teselas de elevación: 14 ≈ 8 m por píxel en Córdoba. */
export const ZOOM_ELEVACION = 14;
/** Píxeles extra alrededor del lote, para que el suavizado no se corte en el borde. */
const MARGEN_PX = 6;
/** Radio del suavizado y distancia a los vecinos para medir el desnivel (píxeles). */
const RADIO = 5;

// Conversión lat/lng ↔ píxel global de Web Mercator (tesela de 256 px).
export function lon2x(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z * 256;
}
export function lat2y(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * 256;
}
export function x2lon(x: number, z: number): number {
  return (x / (2 ** z * 256)) * 360 - 180;
}
export function y2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z * 256);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Altura en metros de un píxel "terrarium". */
export function alturaTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Promedio de cada píxel con sus vecinos en un cuadrado de lado 2r+1 (blur del prototipo). */
export function suavizar(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const o = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let s = 0;
      let n = 0;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const x = i + di;
          const y = j + dj;
          if (x >= 0 && y >= 0 && x < W && y < H) {
            s += a[y * W + x];
            n++;
          }
        }
      o[j * W + i] = s / n;
    }
  return o;
}

/** Resuelve un sistema 3×3 por eliminación de Gauss con pivoteo (solve3 del prototipo). null si no tiene solución única. */
export function resolver3(A: number[][], b: number[]): number[] | null {
  const m = A.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-9) return null;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((fila, i) => fila[3] / fila[i]);
}

/** Color de una pendiente (%): verde (0) → amarillo (2,5) → rojo (6 o más). slopeColor del prototipo. */
export function colorPendiente(s: number): [number, number, number] {
  const tramos: [number, [number, number, number]][] = [
    [0, [46, 125, 50]],
    [1, [124, 179, 66]],
    [2.5, [253, 216, 53]],
    [4, [245, 124, 0]],
    [6, [198, 40, 40]],
  ];
  for (let i = 1; i < tramos.length; i++) {
    if (s <= tramos[i][0]) {
      const [a, ca] = tramos[i - 1];
      const [b, cb] = tramos[i];
      const t = (s - a) / (b - a);
      return ca.map((v, q) => Math.round(v + (cb[q] - v) * t)) as [number, number, number];
    }
  }
  return tramos[tramos.length - 1][1];
}

/** Recorte en píxeles globales que cubre el lote con margen (x0..x1, y0..y1). */
export function recortePixeles(poligono: LatLng[], z = ZOOM_ELEVACION) {
  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  return {
    x0: Math.floor(lon2x(Math.min(...lngs), z)) - MARGEN_PX,
    x1: Math.ceil(lon2x(Math.max(...lngs), z)) + MARGEN_PX,
    // El norte (latitud mayor) es el y más chico en Web Mercator.
    y0: Math.floor(lat2y(Math.max(...lats), z)) - MARGEN_PX,
    y1: Math.ceil(lat2y(Math.min(...lats), z)) + MARGEN_PX,
  };
}

export interface CalculoPendiente {
  /** Pendiente general (plano ajustado), %. null si el lote no tiene píxeles. */
  media: number | null;
  /** Pendiente máxima de un píxel, %. */
  maxima: number;
  /** Imagen RGBA W×H: cada píxel del lote con su color, el resto transparente. */
  rgba: Uint8ClampedArray;
}

/**
 * Calcula la pendiente sobre una grilla de alturas `crudo` (W×H, en metros)
 * cuyo píxel (0,0) es el píxel global (x0, y0) al zoom z.
 */
export function calcularPendiente(
  crudo: Float32Array,
  W: number,
  H: number,
  x0: number,
  y0: number,
  z: number,
  poligono: LatLng[],
): CalculoPendiente {
  const el = suavizar(crudo, W, H, RADIO);
  const lats = poligono.map((p) => p[0]);
  const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Metros por píxel de Web Mercator a esa latitud (156543 m en el ecuador a zoom 0).
  const px = (156543.03392 * Math.cos((latMedia * Math.PI) / 180)) / 2 ** z;
  const rgba = new Uint8ClampedArray(W * H * 4);
  let suma = 0;
  let n = 0;
  let maxima = 0;
  const k = RADIO;
  for (let j = k; j < H - k; j++)
    for (let i = k; i < W - k; i++) {
      if (!dentroDelPoligono(y2lat(y0 + j + 0.5, z), x2lon(x0 + i + 0.5, z), poligono)) continue;
      const dzx = (el[j * W + i + k] - el[j * W + i - k]) / (2 * k * px);
      const dzy = (el[(j + k) * W + i] - el[(j - k) * W + i]) / (2 * k * px);
      const s = Math.hypot(dzx, dzy) * 100;
      suma += s;
      n++;
      if (s > maxima) maxima = s;
      const c = colorPendiente(s);
      const o = (j * W + i) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 200; // algo transparente: se ve el lote debajo
    }

  // Plano z = a·X + b·Y + c por mínimos cuadrados (ecuaciones normales 3×3).
  // La pendiente del plano es hypot(a, b).
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bv = [0, 0, 0];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!dentroDelPoligono(y2lat(y0 + j + 0.5, z), x2lon(x0 + i + 0.5, z), poligono)) continue;
      const v = [i * px, j * px, 1];
      const Z = crudo[j * W + i];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c];
        bv[r] += v[r] * Z;
      }
    }
  const sol = resolver3(A, bv);
  const media = sol ? Math.hypot(sol[0], sol[1]) * 100 : n ? suma / n : null;
  return { media, maxima, rgba };
}

async function cargarImagen(src: string): Promise<ImageBitmap> {
  const r = await fetch(src, { mode: "cors" });
  if (!r.ok) throw new Error(`Terrain Tiles respondió ${r.status}`);
  const b = await r.blob();
  // Sin conversión de color: los colores SON la altura, no se pueden tocar.
  try {
    return await createImageBitmap(b, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    return await createImageBitmap(b);
  }
}

export interface PendienteCargada {
  media: number;
  imagen: string;
  limites: [[number, number], [number, number]];
}

/**
 * Baja la elevación del lote y devuelve la pendiente y la imagen coloreada.
 * Solo en el navegador (usa canvas). Si algo falla, tira error y quien llama
 * usa el valor ilustrativo, como el prototipo.
 */
export async function cargarPendiente(poligono: LatLng[]): Promise<PendienteCargada> {
  const z = ZOOM_ELEVACION;
  const { x0, x1, y0, y1 } = recortePixeles(poligono, z);
  const tx0 = Math.floor(x0 / 256);
  const tx1 = Math.floor(x1 / 256);
  const ty0 = Math.floor(y0 / 256);
  const ty1 = Math.floor(y1 / 256);

  // Mosaico con todas las teselas que tocan el recorte.
  const mosaico = document.createElement("canvas");
  mosaico.width = (tx1 - tx0 + 1) * 256;
  mosaico.height = (ty1 - ty0 + 1) * 256;
  const mc = mosaico.getContext("2d", { willReadFrequently: true });
  if (!mc) throw new Error("Sin canvas");
  const pedidos: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++)
    for (let ty = ty0; ty <= ty1; ty++)
      pedidos.push(
        cargarImagen(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`).then((im) =>
          mc.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256),
        ),
      );
  await Promise.all(pedidos);

  const W = x1 - x0;
  const H = y1 - y0;
  const datos = mc.getImageData(x0 - tx0 * 256, y0 - ty0 * 256, W, H).data;
  const crudo = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) crudo[i] = alturaTerrarium(datos[i * 4], datos[i * 4 + 1], datos[i * 4 + 2]);

  const { media, rgba } = calcularPendiente(crudo, W, H, x0, y0, z, poligono);
  if (media == null) throw new Error("El lote no tiene píxeles de elevación");

  const salida = document.createElement("canvas");
  salida.width = W;
  salida.height = H;
  const oc = salida.getContext("2d");
  if (!oc) throw new Error("Sin canvas");
  const img = oc.createImageData(W, H);
  img.data.set(rgba);
  oc.putImageData(img, 0, 0);

  return {
    media,
    imagen: salida.toDataURL(),
    // [[sur, oeste], [norte, este]] del recorte.
    limites: [
      [y2lat(y1, z), x2lon(x0, z)],
      [y2lat(y0, z), x2lon(x1, z)],
    ],
  };
}
