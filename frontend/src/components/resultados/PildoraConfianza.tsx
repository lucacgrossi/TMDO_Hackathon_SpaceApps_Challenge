import type { Confianza } from "@/lib/contrato";
import css from "./tabla.module.css";

const TEXTO: Record<Confianza, string> = {
  alta: "confianza alta",
  media: "confianza media",
  baja: "confianza baja",
  sin_dato: "sin dato",
};

/** Confianza del dato (RF11). El color acompaña al texto: nunca es la única señal. */
export default function PildoraConfianza({ nivel, motivo }: { nivel: Confianza; motivo?: string | null }) {
  return (
    <span className={css.pildora} data-nivel={nivel} title={motivo ?? undefined}>
      {TEXTO[nivel]}
    </span>
  );
}
