/**
 * Dibujos pixel (íconos de 16 × 16 y, más adelante, la planta de la carga)
 * escritos como grillas de texto: "#" = píxel pintado, "." = vacío. Se pasan a
 * un único `path` de SVG con `trazoDesdeGrilla`, así cada ícono es un solo
 * elemento con `fill: currentColor` y `shape-rendering: crispEdges`
 * (DESIGN.md, "Forma, espacio y acentos pixel").
 *
 * Por qué grillas y no SVG exportados: se pueden leer y corregir en el código
 * sin herramientas, y el test comprueba que todas miden lo que dicen.
 */

export type Grilla = readonly string[];

/**
 * Un `path` con un rectángulo por cada tramo horizontal de "#" seguidos
 * (`M x y h n v 1 h -n z`). Menos nodos que un cuadrado por píxel.
 */
export function trazoDesdeGrilla(grilla: Grilla): string {
  const partes: string[] = [];
  grilla.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      if (fila[x] !== "#") {
        x++;
        continue;
      }
      const desde = x;
      while (x < fila.length && fila[x] === "#") x++;
      const n = x - desde;
      partes.push(`M${desde} ${y}h${n}v1h-${n}z`);
    }
  });
  return partes.join("");
}

export type NombreIcono = "mapa" | "clima" | "rotacion" | "editar" | "imprimir" | "capas";

/** Los 6 íconos de 16 × 16 (Figma, página 01). */
export const ICONOS: Record<NombreIcono, Grilla> = {
  // Marcador sobre el suelo
  mapa: [
    "................",
    ".....######.....",
    "....##....##....",
    "...##......##...",
    "...#...##...#...",
    "...#..####..#...",
    "...#...##...#...",
    "...##......##...",
    "....##....##....",
    ".....##..##.....",
    "......####......",
    ".......##.......",
    "................",
    "..############..",
    "................",
    "................",
  ],
  // Nube con lluvia
  clima: [
    "................",
    "......####......",
    ".....#....#.....",
    "...###.....##...",
    "..#..........#..",
    ".#............#.",
    ".#............#.",
    "..############..",
    "................",
    "...#...#...#....",
    "..#...#...#.....",
    "................",
    "....#...#...#...",
    "...#...#...#....",
    "................",
    "................",
  ],
  // Dos flechas en círculo
  rotacion: [
    "................",
    ".....######.....",
    "...##......##...",
    "..#..........#..",
    "..#.........###.",
    ".#.........#####",
    ".#..............",
    ".#..............",
    "..............#.",
    "..............#.",
    "#####.........#.",
    ".###.........#..",
    "..#..........#..",
    "...##......##...",
    ".....######.....",
    "................",
  ],
  // Lápiz en diagonal
  editar: [
    "................",
    "...........##...",
    "..........#..#..",
    ".........#....#.",
    "........#....#..",
    ".......#....#...",
    "......#....#....",
    ".....#....#.....",
    "....#....#......",
    "...#....#.......",
    "..##...#........",
    "..#.#.#.........",
    "..#..#..........",
    "..####..........",
    "................",
    "................",
  ],
  // Impresora con hoja
  imprimir: [
    "................",
    "....########....",
    "....#......#....",
    "....#......#....",
    ".##############.",
    ".#............#.",
    ".#..........#.#.",
    ".#............#.",
    ".#...######...#.",
    ".####......####.",
    "....#......#....",
    "....#.####.#....",
    "....#......#....",
    "....########....",
    "................",
    "................",
  ],
  // Tres capas apiladas
  capas: [
    "................",
    ".......##.......",
    ".....##..##.....",
    "...##......##...",
    ".##..........##.",
    "...##......##...",
    ".#...##..##...#.",
    "..##...##...##..",
    "....##....##....",
    ".#....####....#.",
    "..##........##..",
    "....##....##....",
    "......####......",
    "................",
    "................",
    "................",
  ],
};
