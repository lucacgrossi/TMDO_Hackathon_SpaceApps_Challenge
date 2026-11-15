/**
 * Lógica pura de los tres momentos de la demo (DESIGN.md, "Movimiento"):
 * - "De la órbita al lote": el satélite pixel que cruza el mapa al abrir S1.
 * - "El lote se pixela": la grilla de 1″ (~30 m, la de HLS y NASADEM) que
 *   llena el lote al cerrarlo, en ola desde la primera esquina.
 * - "Franjas climáticas": el tono de cada campaña en Clima histórico.
 * Sin React ni DOM: todo se prueba en `momentos.test.ts`.
 */
import type { LatLng } from "./entradas";
import { dentroDelPoligono } from "./geo";

/* ------------------------------------------------------------------ */
/* Satélite pixel                                                       */
/* ------------------------------------------------------------------ */

/** Satélite de 19 × 7, como los del logo: paneles a los lados y el cuerpo al medio. */
export const SATELITE: readonly string[] = [
  ".........n.........",
  "aaaaa...nnn...aaaaa",
  "abbba..nbbbn..abbba",
  "aaaaaggnbcbnggaaaaa",
  "abbba..nbbbn..abbba",
  "aaaaa...nnn...aaaaa",
  ".........y.........",
];

/** Colores del satélite (tokens de DESIGN.md). */
export const COLORES_SATELITE: Record<string, string> = {
  a: "var(--cielo)",
  b: "var(--cielo-brillo)",
  n: "var(--noche)",
  c: "var(--hoja-brillo)",
  g: "var(--muted)",
  y: "var(--invierno, #d9a441)",
};

/** Un `path` por color: un rectángulo por tramo de píxeles seguidos del mismo color. */
export function trazosGrilla(grilla: readonly string[], colores: Record<string, string>): Record<string, string> {
  const trazos: Record<string, string> = {};
  grilla.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      const c = fila[x];
      if (!(c in colores)) {
        x++;
        continue;
      }
      const desde = x;
      while (x < fila.length && fila[x] === c) x++;
      trazos[c] = (trazos[c] ?? "") + `M${desde} ${y}h${x - desde}v1h-${x - desde}z`;
    }
  });
  return trazos;
}

/* ------------------------------------------------------------------ */
/* El lote se pixela                                                    */
/* ------------------------------------------------------------------ */

/** Un segundo de arco: la grilla común de las capas del lote (~30 m). */
export const PASO_GRILLA = 1 / 3600;
/** Tope de celdas a dibujar: en lotes muy grandes se agrupan de a varias. */
const MAX_CELDAS = 40_000;

export interface GrillaLote {
  /** [[sur, oeste], [norte, este]] de la grilla, ajustada a múltiplos del paso. */
  bounds: [[number, number], [number, number]];
  columnas: number;
  filas: number;
  /** Celdas cuyo centro cae dentro del lote: [fila, columna], fila 0 = norte. */
  dentro: [number, number][];
  /** Dónde arranca la ola (la primera esquina), en fracción de la grilla: [x, y] de 0 a 1. */
  origen: [number, number];
}

/**
 * La grilla de 1″ sobre el lote y qué celdas caen adentro (por su centro). Es
 * la misma grilla en la que el back calcula las capas, así que lo que se ve al
 * cerrar el lote es la resolución real con la que se va a analizar.
 */
export function grillaDelLote(poligono: readonly LatLng[]): GrillaLote | null {
  if (poligono.length < 3) return null;
  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  let paso = PASO_GRILLA;
  const sur0 = Math.min(...lats);
  const norte0 = Math.max(...lats);
  const oeste0 = Math.min(...lngs);
  const este0 = Math.max(...lngs);
  const total = ((norte0 - sur0) / paso) * ((este0 - oeste0) / paso);
  if (total > MAX_CELDAS) paso *= Math.ceil(Math.sqrt(total / MAX_CELDAS));

  const sur = Math.floor(sur0 / paso) * paso;
  const norte = Math.ceil(norte0 / paso) * paso;
  const oeste = Math.floor(oeste0 / paso) * paso;
  const este = Math.ceil(este0 / paso) * paso;
  const filas = Math.max(1, Math.round((norte - sur) / paso));
  const columnas = Math.max(1, Math.round((este - oeste) / paso));

  const dentro: [number, number][] = [];
  for (let f = 0; f < filas; f++) {
    const lat = norte - (f + 0.5) * paso;
    for (let c = 0; c < columnas; c++) {
      if (dentroDelPoligono(lat, oeste + (c + 0.5) * paso, poligono as LatLng[])) dentro.push([f, c]);
    }
  }
  const [lat0, lng0] = poligono[0];
  return {
    bounds: [
      [sur, oeste],
      [norte, este],
    ],
    columnas,
    filas,
    dentro,
    origen: [(lng0 - oeste) / (este - oeste), (norte - lat0) / (norte - sur)],
  };
}

/* ------------------------------------------------------------------ */
/* Franjas climáticas                                                   */
/* ------------------------------------------------------------------ */

export interface TonoFranja {
  /** Hacia dónde se aparta de la mediana de las 30 campañas. */
  lado: "seco" | "humedo";
  /** Cuánto se aparta, de 0 (la mediana) a 1 (la campaña más extrema). */
  intensidad: number;
}

/**
 * Tono de cada campaña en las franjas: cuánto se aparta su balance de agua (o
 * su lluvia, si no hay balance) de la mediana de las 30. Más intenso, más
 * extremo. El tercio (S, N, H) sigue saliendo del back: esto solo pinta.
 */
export function tonosFranjas(valores: readonly (number | null)[]): (TonoFranja | null)[] {
  const conDato = valores.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!conDato.length) return valores.map(() => null);
  const m = conDato.length;
  const mediana = m % 2 ? conDato[(m - 1) / 2] : (conDato[m / 2 - 1] + conDato[m / 2]) / 2;
  const escala = Math.max(...conDato.map((v) => Math.abs(v - mediana))) || 1;
  return valores.map((v) =>
    v == null || !Number.isFinite(v)
      ? null
      : { lado: v < mediana ? "seco" : "humedo", intensidad: Math.min(1, Math.abs(v - mediana) / escala) },
  );
}
