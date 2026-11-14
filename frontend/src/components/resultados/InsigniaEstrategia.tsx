import type { IdEstrategia } from "@/lib/contrato";
import css from "./resultados.module.css";

/** Color de cada columna: tokens del prototipo en globals.css. */
const COLOR: Record<IdEstrategia, string> = {
  actual: "var(--s-actual)",
  A: "var(--s-a)",
  B: "var(--s-b)",
  C: "var(--s-c)",
};

/** Letra del badge: la actual va con "·" (DESIGN.md). */
export const LETRA: Record<IdEstrategia, string> = { actual: "·", A: "A", B: "B", C: "C" };

/** Badge con la letra de la estrategia en su color. Decorativo: el nombre va siempre al lado. */
export default function InsigniaEstrategia({ id }: { id: IdEstrategia }) {
  return (
    <span className={css.insignia} data-id={id} style={{ background: COLOR[id] }} aria-hidden="true">
      {LETRA[id]}
    </span>
  );
}
