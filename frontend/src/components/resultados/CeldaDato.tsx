import type { ReactNode } from "react";
import type { Confianza } from "@/lib/contrato";
import PildoraConfianza from "./PildoraConfianza";
import css from "./tabla.module.css";

/** De dónde sale un valor: lo que se muestra debajo de cada número (RF11, "técnico por defecto"). */
export interface Origen {
  fuente: string;
  anios?: string | null;
  resolucion?: string | null;
  /** Solo si el contrato la manda: nunca se completa a mano. */
  confianza?: Confianza;
  /** Valor de una regla fija (tabla de cultivos), no una medición. */
  regla?: boolean;
  motivo?: string | null;
}

/** "NASA POWER mensual · 1996/97 a 2025/26 · ~50 km" */
export function textoOrigen(o: Origen): string {
  return [o.fuente, o.anios, o.resolucion].filter(Boolean).join(" · ");
}

export function HuellaDato({ origen }: { origen: Origen }) {
  return (
    <div className={css.huella}>
      {origen.confianza && <PildoraConfianza nivel={origen.confianza} motivo={origen.motivo} />}
      {origen.regla && (
        <span className={css.pildora} data-nivel="regla">
          regla fija
        </span>
      )}
      <span>{textoOrigen(origen)}</span>
      {origen.motivo && <span className={css.motivo}>{origen.motivo}</span>}
    </div>
  );
}

/**
 * Un valor de la tabla: número con unidad, diferencia con la actual (si hay) y
 * la huella del dato (confianza, fuente, años y resolución). Siempre igual en
 * toda la tabla, así se lee de un vistazo de dónde sale cada número.
 */
export default function CeldaDato({
  valor,
  unidad,
  diferencia,
  origen,
  children,
}: {
  valor: ReactNode;
  unidad?: string;
  /** Texto ya armado: "−119 mm frente a la actual". */
  diferencia?: string | null;
  origen?: Origen;
  /** Detalle debajo del valor. */
  children?: ReactNode;
}) {
  return (
    <div className={css.celda}>
      <div className={css.valor}>
        <span className={css.numero}>{valor}</span>
        {unidad && <span className={css.unidad}>{unidad}</span>}
      </div>
      {diferencia && <div className={css.diferencia}>{diferencia}</div>}
      {children && <div className={css.detalle}>{children}</div>}
      {origen && <HuellaDato origen={origen} />}
    </div>
  );
}
