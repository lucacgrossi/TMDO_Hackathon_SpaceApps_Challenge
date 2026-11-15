import { ICONOS, trazoDesdeGrilla, type NombreIcono } from "@/lib/pixel";

/** Los trazos se calculan una vez, al cargar el módulo. */
const TRAZOS = Object.fromEntries(
  Object.entries(ICONOS).map(([nombre, grilla]) => [nombre, trazoDesdeGrilla(grilla)]),
) as Record<NombreIcono, string>;

interface Props {
  nombre: NombreIcono;
  /** Solo ×1, ×1,5 o ×2 (16, 24 o 32 px), para que los píxeles queden enteros. */
  escala?: 1 | 1.5 | 2;
  /** Texto para lectores de pantalla. Sin título, el ícono es decorativo. */
  titulo?: string;
  className?: string;
}

/** Ícono pixel de 16 × 16 (DESIGN.md): toma el color del texto (`currentColor`). */
export default function IconoPixel({ nombre, escala = 1, titulo, className }: Props) {
  const lado = 16 * escala;
  return (
    <svg
      width={lado}
      height={lado}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      className={className}
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
