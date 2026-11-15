import type { IdEstrategia } from "@/lib/contrato";
import { BADGE } from "@/lib/rotaciones";
import css from "./InsigniaEstrategia.module.css";

/**
 * Badge de la estrategia (Hoy, A, B, C) con esquinas escalonadas y el color de
 * su columna (DESIGN.md, "Card de estrategia"). Igual en cards, tabla y PDF.
 * Con `descartada`, en gris. Decorativo: el nombre va siempre al lado.
 */
export default function InsigniaEstrategia({ id, descartada = false }: { id: IdEstrategia; descartada?: boolean }) {
  return (
    <span className={css.insignia} data-id={id} data-descartada={descartada} aria-hidden="true">
      {BADGE[id]}
    </span>
  );
}
