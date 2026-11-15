import type { LatLng } from "./entradas";
import { centro } from "./geo";

/**
 * NDVI de la capa "Vegetación": cómo pedirlo y cómo pintarlo.
 * Sale del bloque "NDVI" del prototipo final (prototipo-app.js ~líneas 168-216).
 *
 * - Principal: NASA HLS (Landsat 8/9 + Sentinel-2 armonizados por NASA),
 *   píxel de 30 m, servido por Microsoft Planetary Computer sin cuenta.
 *   Por cada mes de la última campaña se usa la escena con menos nubes.
 * - Respaldo: MODIS 250 m de NASA GIBS (teselas ya pintadas), si HLS no
 *   tiene escena con menos de 30 % de nubes o no responde.
 *
 * El navegador pide estas teselas directo a NASA / Planetary Computer, igual
 * que el prototipo: son imágenes para ver, no datos que use la comparación.
 */

export const PC = "https://planetarycomputer.microsoft.com/api";

/** NDVI = (infrarrojo cercano − rojo) / (infrarrojo cercano + rojo). Cada sensor nombra distinto sus bandas. */
export const HLS_EXPR: Record<string, string> = {
  "hls2-s30": "(B08-B04)/(B08+B04)",
  "hls2-l30": "(B05-B04)/(B05+B04)",
};
export const HLS_SENSOR: Record<string, string> = { "hls2-s30": "Sentinel-2", "hls2-l30": "Landsat" };

/**
 * Primer año de la última campaña completa (julio a junio), ESTIMADA con la
 * fecha: si ya pasó junio, es la que terminó este junio; si no, la anterior.
 * Ej.: noviembre de 2026 → 2025 (campaña 2025/26).
 *
 * MVP 4.4: la campaña la da la API (`visto_por_satelite.campana`, la misma
 * que confirma NASA POWER), el front no la calcula. Esto es solo el respaldo
 * mientras no hay respuesta del back (se conecta en la auditoría), igual que
 * el prototipo final. Antes era "año − 2", que en noviembre daba una campaña
 * vieja (2024/25).
 */
export function campanaEstimada(hoy: Date = new Date()): number {
  return hoy.getMonth() >= 6 ? hoy.getFullYear() - 1 : hoy.getFullYear() - 2;
}

export const CAMP0 = campanaEstimada();

/** Primer año de la campaña que manda la API ("2025/26" → 2025); sin dato, la estimada. */
export function camp0De(campana: string | null | undefined): number {
  const anio = Number(campana?.slice(0, 4));
  return Number.isInteger(anio) && anio > 1900 ? anio : CAMP0;
}

/** Año calendario del mes m (0 = enero) dentro de la campaña: julio a diciembre caen en CAMP0. */
export function anioCampania(m: number, camp0 = CAMP0): number {
  return m >= 6 ? camp0 : camp0 + 1;
}

/**
 * NDVI medio del lote por debajo de 0,3 = lote pelado o casi.
 * Regla del prototipo (a validar con la persona 3); el umbral está pensado para HLS.
 */
export const UMBRAL_PELADO = 0.3;

/**
 * 6 clases: 0–0,15 y 0,15–0,3 = pelado (tonos arena); de 0,3 en adelante,
 * vegetación (verdes). Cortes y colores del prototipo (NDVI_CL y NDVI_COLS).
 */
export const NDVI_CORTES = [0, 0.15, 0.3, 0.45, 0.6, 0.75];
export const NDVI_COLORES = ["#E6D8AE", "#CDBA86", "#94AF63", "#689C49", "#3F8139", "#1B5E2E"];
/** Tope de la escala: la imagen se reescala de 0 a 0,9. */
export const NDVI_MAX = 0.9;

/**
 * Mapa de colores para el servidor de teselas de Planetary Computer.
 * El servidor recibe el NDVI reescalado a 0–255 (rescale=0,0.9) y pide
 * rangos [desde, hasta) con un color RGBA cada uno. Es `NDVI_CM` del prototipo.
 */
export function colormapHls(): string {
  const rangos = NDVI_COLORES.map((c, i) => [
    [
      Math.round((NDVI_CORTES[i] / NDVI_MAX) * 255),
      // la última clase llega hasta 256 para incluir el 255
      i < NDVI_CORTES.length - 1 ? Math.round((NDVI_CORTES[i + 1] / NDVI_MAX) * 255) : 256,
    ],
    [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255],
  ]);
  return encodeURIComponent(JSON.stringify(rangos));
}

/** Una escena de HLS elegida para un mes. */
export interface EscenaHls {
  coleccion: string;
  id: string;
  fecha: string;
  nubes: number;
}

function consultaHls(sc: Pick<EscenaHls, "coleccion" | "id">): string {
  return `collection=${sc.coleccion}&item=${encodeURIComponent(sc.id)}&expression=${encodeURIComponent(HLS_EXPR[sc.coleccion])}&asset_as_band=true`;
}

/** URL de teselas de NDVI pintado a 30 m (hlsLayer del prototipo). */
export function urlTeselasHls(sc: Pick<EscenaHls, "coleccion" | "id">): string {
  return `${PC}/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?${consultaHls(sc)}&rescale=0,${NDVI_MAX}&colormap=${colormapHls()}&format=png`;
}

/**
 * URL de teselas de MODIS en NASA GIBS (modisLayer del prototipo). GIBS
 * guarda una imagen cada 16 días: pidiendo el día 15 del mes se obtiene la
 * composición que cubre la mitad del mes.
 */
export function urlTeselasModis(m: number, camp0 = CAMP0): string {
  const fecha = `${anioCampania(m, camp0)}-${String(m + 1).padStart(2, "0")}-15`;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/${fecha}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
}

/** "2024-07-18" → "18 jul 2024" (fmtDate del prototipo). */
export function formatoFecha(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${MES_CORTO[Number(m) - 1]} ${a}`;
}

/** El lote como GeoJSON (lng, lat y cerrado), que es lo que piden STAC y el endpoint de estadísticas. */
export function geoLote(poligono: LatLng[]) {
  const p = poligono.map(([lat, lng]) => [lng, lat]);
  return { type: "Polygon" as const, coordinates: [[...p, p[0]]] };
}

/**
 * Cache de escenas por lote y mes (HLS_CACHE del prototipo): se guarda la
 * promesa, así dos pedidos iguales al mismo tiempo comparten la respuesta.
 * Si falla, se borra para poder reintentar.
 */
const cacheEscenas = new Map<string, Promise<EscenaHls | null>>();

function claveLote(poligono: LatLng[]): string {
  return centro(poligono)
    .map((v) => v.toFixed(4))
    .join(",");
}

/** Busca en STAC la escena de HLS con menos nubes (< 30 %) del mes m de la campaña (hlsScene del prototipo). */
export function buscarEscenaHls(poligono: LatLng[], m: number): Promise<EscenaHls | null> {
  const k = `${claveLote(poligono)}|${m}`;
  const enCache = cacheEscenas.get(k);
  if (enCache) return enCache;
  const pedido = (async () => {
    const a = anioCampania(m);
    const desde = `${a}-${String(m + 1).padStart(2, "0")}-01`;
    // Día 0 del mes siguiente = último día de este mes.
    const hasta = new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10);
    const r = await fetch(`${PC}/stac/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collections: ["hls2-s30", "hls2-l30"],
        intersects: geoLote(poligono),
        datetime: `${desde}/${hasta}`,
        query: { "eo:cloud_cover": { lt: 30 } },
        sortby: [{ field: "eo:cloud_cover", direction: "asc" }],
        limit: 3,
      }),
    });
    if (!r.ok) throw new Error(`STAC respondió ${r.status}`);
    const f = (await r.json()).features?.[0];
    if (!f) return null;
    return {
      coleccion: f.collection,
      id: f.id,
      fecha: String(f.properties.datetime).slice(0, 10),
      nubes: f.properties["eo:cloud_cover"],
    };
  })();
  cacheEscenas.set(k, pedido);
  pedido.catch(() => cacheEscenas.delete(k));
  return pedido;
}

/**
 * NDVI medio dentro del lote para una escena (hlsMean del prototipo).
 * Devuelve null si el lote tiene menos de 20 píxeles válidos: con tan pocos,
 * el promedio no representa al lote (misma regla que `loadSeen`).
 */
export async function promedioHls(sc: EscenaHls, poligono: LatLng[]): Promise<number | null> {
  const r = await fetch(`${PC}/data/v1/item/statistics?${consultaHls(sc)}&max_size=512`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "Feature", properties: {}, geometry: geoLote(poligono) }),
  });
  if (!r.ok) throw new Error(`statistics respondió ${r.status}`);
  const st = Object.values((await r.json()).properties.statistics)[0] as { mean: number; count: number };
  return st.count >= 20 ? st.mean : null;
}
