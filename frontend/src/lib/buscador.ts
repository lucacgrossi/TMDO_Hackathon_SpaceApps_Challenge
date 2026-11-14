/**
 * F4 · Lógica pura del buscador de "¿Dónde está tu lote?".
 *
 * Sale del prototipo final (prototipo-app.js): `GEO`, `parseCoords` y las dos
 * llamadas a Esri que hacían el listener de `#q` (suggest) y `pickSug`
 * (findAddressCandidates). Acá no hay React ni DOM: son funciones que reciben
 * texto y devuelven datos, así se pueden probar con `npx tsx src/lib/buscador.test.ts`.
 *
 * El componente que las usa es `src/components/entradas/BuscadorLote.tsx`.
 */

/** Servicio de geocodificación de Esri (gratis, sin clave para suggest/find). */
export const GEO = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

/** Lo que devuelve el parseo o la búsqueda: un punto con su texto. */
export interface PuntoEncontrado {
  lat: number;
  lng: number;
  etiqueta: string;
}

/** Una sugerencia de Esri `suggest`: el texto y la llave para pedir sus coordenadas. */
export interface Sugerencia {
  text: string;
  magicKey: string;
}

/** Mensajes de error, copiados del prototipo para que digan lo mismo. */
export const MENSAJES = {
  sinResultados:
    "No encontré ese lugar. Probá con la localidad más cercana o pegá las coordenadas.",
  sinRed: "No pude buscar ahora. Pegá las coordenadas o usá tu ubicación.",
  noUbico: "No pude ubicar ese lugar. Probá de nuevo.",
  sinGeo: "Este navegador no da la ubicación. Buscá el lugar o pegá las coordenadas.",
  gpsFallo:
    "No pude tomar tu ubicación (permiso denegado o sin GPS). Buscá el lugar o pegá las coordenadas.",
} as const;

/** Número con formato argentino (coma decimal), como `fmt` del prototipo. */
export function fmt(n: number, decimales = 0): string {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Esri agrega ", ARG" al final de cada sugerencia porque filtramos por país.
 * Es ruido para el productor, así que se saca antes de mostrarlo.
 */
export function limpiarTexto(texto: string): string {
  return texto.replace(/, ARG$/, "");
}

/* ---------- Coordenadas y links pegados ---------- */

/**
 * Link de Google Maps al mover el mapa: ".../@-33.2477,-64.2325,15z".
 * La "@" seguida de dos números con decimales es el centro de la vista.
 */
const RE_ARROBA = /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/;

/**
 * Links con el punto en un parámetro: "?q=-33.2,-64.2" (Google Maps compartido),
 * "&ll=" (Google viejo y Apple Maps), "query=" y "destination=" (links de la API
 * de Google Maps). La coma puede venir codificada como "%2C" si el link se
 * copió de otra app. La "i" final ignora mayúsculas en el nombre del parámetro.
 */
const RE_PARAMETRO = /[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i;

/**
 * "lat, lng" suelto, como lo copia Google Maps al hacer clic derecho:
 * "-33.2477, -64.2325". Tiene que ser TODO el texto (^ y $) para no confundir
 * un nombre de ruta con números. Latitud hasta 2 dígitos enteros y longitud
 * hasta 3; el separador puede ser coma, punto y coma o espacio.
 */
const RE_SUELTO = /^(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)$/;

/**
 * Grados, minutos y segundos: 33°14'51.7"S 64°13'57.0"W (como lo muestra
 * Google Maps en la ficha de un punto). Acepta "º" (o ordinal, que sale en
 * teclados en español), comillas tipográficas, segundos con coma decimal,
 * y "O" de oeste además de "W". Los segundos son opcionales.
 */
const RE_GMS =
  /(\d{1,2})[°º]\s*(\d{1,2})['’′]\s*([\d.,]+)?["”″]?\s*([NS])[\s,;]+(\d{1,3})[°º]\s*(\d{1,2})['’′]\s*([\d.,]+)?["”″]?\s*([EWO])/i;

/** Pasa grados, minutos y segundos (texto) a grados decimales. */
function gmsADecimal(grados: string, minutos: string, segundos?: string): number {
  const seg = segundos ? Number(segundos.replace(",", ".")) / 3600 : 0;
  return Number(grados) + Number(minutos) / 60 + seg;
}

/**
 * Reconoce coordenadas o un link de mapas pegado en el buscador, sin llamar
 * a ninguna API. Devuelve null si el texto no es una coordenada (entonces el
 * componente busca el texto en Esri).
 */
export function parsearCoordenadas(texto: string): PuntoEncontrado | null {
  const t = texto.trim();
  let lat: number;
  let lng: number;

  const m = t.match(RE_ARROBA) || t.match(RE_PARAMETRO) || t.match(RE_SUELTO);
  if (m) {
    lat = Number(m[1]);
    lng = Number(m[2]);
  } else {
    const d = t.match(RE_GMS);
    if (!d) return null;
    lat = gmsADecimal(d[1], d[2], d[3]) * (/s/i.test(d[4]) ? -1 : 1);
    lng = gmsADecimal(d[5], d[6], d[7]) * (/[wo]/i.test(d[8]) ? -1 : 1);
  }

  /*
   * En Argentina, si pegaron las coordenadas sin signo ("33.24, 64.23"), van
   * al sur y al oeste. El rango cubre el país (lat 20–56, lng 52–75); fuera de
   * ahí se respeta lo que escribieron.
   */
  if (lat > 20 && lat < 56 && lng > 52 && lng < 75) {
    lat = -lat;
    lng = -lng;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng, etiqueta: etiquetaCoordenadas(lat, lng) };
}

/** "33,2477° S · 64,2325° O": 4 decimales ≈ 10 m, suficiente para ubicar un lote. */
export function etiquetaCoordenadas(lat: number, lng: number): string {
  return `${fmt(Math.abs(lat), 4)}° ${lat < 0 ? "S" : "N"} · ${fmt(Math.abs(lng), 4)}° ${
    lng < 0 ? "O" : "E"
  }`;
}

/* ---------- Llamadas a Esri ---------- */

/**
 * Pide sugerencias de lugares a Esri mientras el productor escribe.
 * - countryCode=ARG: solo Argentina (evita "Río Cuarto" de otro país).
 * - location=-64.2,-32.4: centro de Córdoba, para que ordene primero lo cercano.
 * - maxSuggestions=6: entran en la lista sin scroll.
 * Lanza un error si falla la red; el componente muestra MENSAJES.sinRed.
 */
export async function buscarSugerencias(
  texto: string,
  signal?: AbortSignal,
): Promise<Sugerencia[]> {
  const url = `${GEO}/suggest?f=json&countryCode=ARG&maxSuggestions=6&location=-64.2,-32.4&text=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Esri suggest respondió ${r.status}`);
  const j = (await r.json()) as { suggestions?: Sugerencia[] };
  return j.suggestions ?? [];
}

/**
 * Pide las coordenadas de una sugerencia elegida. El magicKey le dice a Esri
 * cuál de sus resultados era, así no vuelve a adivinar con el texto.
 * Devuelve null si Esri no encontró candidatos.
 */
export async function ubicarSugerencia(s: Sugerencia): Promise<PuntoEncontrado | null> {
  const url = `${GEO}/findAddressCandidates?f=json&maxLocations=1&magicKey=${encodeURIComponent(s.magicKey)}&SingleLine=${encodeURIComponent(s.text)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Esri findAddressCandidates respondió ${r.status}`);
  const j = (await r.json()) as { candidates?: { location: { x: number; y: number } }[] };
  const c = j.candidates?.[0];
  if (!c) return null;
  // Esri devuelve x = longitud, y = latitud.
  return { lat: c.location.y, lng: c.location.x, etiqueta: limpiarTexto(s.text) };
}
