import { COLORES_PLANTA, FOTOGRAMAS_PLANTA, trazosPorColor, type ColorPlanta } from "@/lib/planta";

interface Props {
  /** Índice del fotograma: 0 semilla, 1 brote, 2 dos hojas, 3 cuatro hojas, 4 con vainas. */
  fotograma: number;
  /** Tamaño de cada píxel en px (la grilla es de 16 × 16). En la carga, ×12. */
  escala?: number;
  /** Primera fila que se muestra (0 a 15). La semilla del error usa 11 para no dejar aire arriba. */
  desdeFila?: number;
  className?: string;
}

/**
 * Planta pixel de 16 × 16 (S3 y S3b). Un `path` por color, con
 * `shape-rendering: crispEdges` para que los píxeles queden nítidos a
 * cualquier escala. Es decorativa: el texto de al lado dice qué pasa.
 */
export default function PlantaPixel({ fotograma, escala = 12, desdeFila = 0, className }: Props) {
  const grilla = FOTOGRAMAS_PLANTA[Math.max(0, Math.min(FOTOGRAMAS_PLANTA.length - 1, fotograma))];
  const trazos = trazosPorColor(grilla);
  const desde = Math.max(0, Math.min(15, Math.floor(desdeFila)));
  const filas = 16 - desde;
  return (
    <svg
      className={className}
      width={16 * escala}
      height={filas * escala}
      viewBox={`0 ${desde} 16 ${filas}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {(Object.keys(trazos) as ColorPlanta[]).map((c) => (
        <path key={c} d={trazos[c]} style={{ fill: COLORES_PLANTA[c] }} />
      ))}
    </svg>
  );
}
