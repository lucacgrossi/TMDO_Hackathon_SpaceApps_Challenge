/**
 * Planta pixel de la pantalla de carga (S3) y del error (S3b): 5 fotogramas
 * de 16 × 16 (semilla → brote → 2 hojas → 4 hojas → con vainas), escritos
 * como grillas de texto. Cada letra es un color y "." es vacío:
 *
 *   t  tierra        --suelo
 *   m  semilla       --invierno
 *   v  tallo y hoja  --hoja
 *   b  borde de hoja --hoja-brillo
 *   p  vaina         --invierno
 *
 * Un fotograma cada 0,3 s (la planta entera en 1,2 s: muchas respuestas
 * llegan en 2 o 3 s); el último queda fijo hasta la respuesta. Con
 * `prefers-reduced-motion` se muestra solo el de 4 hojas (DESIGN.md,
 * "Pantalla de carga"). No hay barra ni porcentaje: la API no informa
 * progreso, así que el único indicador es la planta y el tiempo.
 */

export type Grilla = readonly string[];

export type ColorPlanta = "t" | "m" | "v" | "b" | "p";

/** Token de DESIGN.md para cada letra. */
export const COLORES_PLANTA: Record<ColorPlanta, string> = {
  t: "var(--suelo)",
  m: "var(--invierno)",
  v: "var(--hoja)",
  b: "var(--hoja-brillo)",
  p: "var(--invierno)",
};

const VACIA = "................";
const TIERRA = "tttttttttttttttt";
const vacias = (n: number): string[] => Array.from({ length: n }, () => VACIA);

const HOJAS_ABAJO = [
  "..bbbb....bbbb..",
  ".bvvvvb..bvvvvb.",
  "..vvvvvvvvvvvv..",
];

const HOJAS_ARRIBA = [
  "...bbb....bbb...",
  "..bvvvb..bvvvb..",
  "...vvvvvvvvvv...",
];

const TALLO = ".......vv.......";

/** Los 5 fotogramas, de arriba abajo; las filas 13 a 15 son la tierra. */
export const FOTOGRAMAS_PLANTA: readonly Grilla[] = [
  // 1 · Semilla
  [...vacias(11), "......mmmm......", ".....mmmmmm.....", TIERRA, TIERRA, TIERRA],
  // 2 · Brote: el tallo parte la semilla
  [
    ...vacias(8),
    ".......vvv......",
    TALLO,
    TALLO,
    TALLO,
    ".....mmvvmm.....",
    TIERRA,
    TIERRA,
    TIERRA,
  ],
  // 3 · Dos hojas
  [...vacias(6), ...HOJAS_ABAJO, TALLO, TALLO, TALLO, TALLO, TIERRA, TIERRA, TIERRA],
  // 4 · Cuatro hojas
  [VACIA, ...HOJAS_ARRIBA, TALLO, TALLO, ...HOJAS_ABAJO, TALLO, TALLO, TALLO, TALLO, TIERRA, TIERRA, TIERRA],
  // 5 · Con vainas
  [
    VACIA,
    ...HOJAS_ARRIBA,
    TALLO,
    TALLO,
    ...HOJAS_ABAJO,
    "......pvvp......",
    ".....ppvvpp.....",
    "....pp.vv.pp....",
    TALLO,
    TIERRA,
    TIERRA,
    TIERRA,
  ],
];

/** Milisegundos entre fotogramas. */
export const MS_POR_FOTOGRAMA = 300;

/** Fotograma que se muestra con `prefers-reduced-motion` (4 hojas). */
export const FOTOGRAMA_QUIETO = 3;

/**
 * Índice del fotograma (0 a 4) según el tiempo desde que empezó el análisis.
 * Avanza uno cada 0,3 s y se queda en el último. Con movimiento reducido,
 * siempre el de 4 hojas.
 */
export function fotogramaPlanta(msTranscurridos: number, movimientoReducido: boolean): number {
  if (movimientoReducido) return FOTOGRAMA_QUIETO;
  const ultimo = FOTOGRAMAS_PLANTA.length - 1;
  if (!(msTranscurridos > 0)) return 0;
  return Math.min(ultimo, Math.floor(msTranscurridos / MS_POR_FOTOGRAMA));
}

/**
 * Un `path` de SVG por color: un rectángulo por cada tramo horizontal de
 * píxeles seguidos del mismo color (`M x y h n v 1 h -n z`).
 */
export function trazosPorColor(grilla: Grilla): Partial<Record<ColorPlanta, string>> {
  const trazos: Partial<Record<ColorPlanta, string>> = {};
  grilla.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      const c = fila[x] as ColorPlanta;
      if (!(c in COLORES_PLANTA)) {
        x++;
        continue;
      }
      const desde = x;
      while (x < fila.length && fila[x] === c) x++;
      const n = x - desde;
      trazos[c] = (trazos[c] ?? "") + `M${desde} ${y}h${n}v1h-${n}z`;
    }
  });
  return trazos;
}
