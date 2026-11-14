import type { IdEstrategia } from "@/lib/contrato";
import css from "./resultados.module.css";

/** Letra del badge: la actual va con "·" (DESIGN.md). */
export const LETRA: Record<IdEstrategia, string> = { actual: "·", A: "A", B: "B", C: "C" };

/**
 * Badge con la letra de la estrategia en su color (tokens --s-* del prototipo;
 * el fondo y la tinta de cada letra están en resultados.module.css, con su
 * contraste medido). Decorativo: el nombre va siempre al lado.
 */
export default function InsigniaEstrategia({ id }: { id: IdEstrategia }) {
  return (
    <span className={css.insignia} data-id={id} aria-hidden="true">
      {LETRA[id]}
    </span>
  );
}
