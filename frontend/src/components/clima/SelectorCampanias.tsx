"use client";

import { LETRA_TERCIO } from "@/lib/campanaClima";
import type { SerieAnual } from "@/lib/contrato";
import { tonosFranjas, type TonoFranja } from "@/lib/momentos";
import { barrasSerie } from "@/lib/serie";
import css from "./SelectorCampanias.module.css";

/** Color de una franja: hacia el seco o el húmedo, más intenso cuanto más se aparta de lo común. */
function fondoFranja(t: TonoFranja | null): string {
  if (!t) return "var(--soft)";
  const pct = Math.round(12 + 88 * t.intensidad);
  return `color-mix(in oklab, var(--${t.lado}) ${pct}%, var(--papel))`;
}

/**
 * Franjas climáticas de las 30 campañas (S5): una franja por campaña, pegadas,
 * pintadas por cuánto se aparta su balance de agua de lo común (más intensa,
 * más extrema; marrón seco, azul húmedo). Debajo, la letra del tercio que
 * manda el back (S, N, H: el color nunca es la única señal). Cada franja es un
 * botón que elige la campaña; si la respuesta no trae los 12 meses de cada
 * campaña, se ven pero no se eligen, y se dice por qué.
 */
export default function SelectorCampanias({
  serie,
  elegida,
  habilitada,
  motivo,
  onElegir,
}: {
  serie: SerieAnual;
  elegida: string | null;
  habilitada: boolean;
  motivo: string | null;
  onElegir: (campana: string) => void;
}) {
  const barras = barrasSerie(serie);
  const conBalance = serie.campanas.some((c) => c.balance_mm != null);
  const tonos = tonosFranjas(serie.campanas.map((c) => (conBalance ? c.balance_mm : c.lluvia_mm)));
  return (
    <div>
      <div className={css.barras} role="group" aria-label="Campañas de julio a junio, por balance de agua">
        {barras.map((b, i) => (
          <button
            key={b.campana}
            type="button"
            className={css.barra}
            data-tipo={b.tipo}
            style={{ background: fondoFranja(tonos[i]) }}
            aria-pressed={habilitada && b.campana === elegida}
            disabled={!habilitada}
            title={habilitada ? b.texto : `${b.texto}. ${motivo ?? ""}`}
            aria-label={b.texto}
            onClick={() => onElegir(b.campana)}
          />
        ))}
      </div>
      <div className={css.letras} aria-hidden="true">
        {barras.map((b) => (
          <span key={b.campana} className={b.campana === elegida && habilitada ? css.letraElegida : undefined}>
            {LETRA_TERCIO[b.tipo]}
          </span>
        ))}
      </div>
      <div className={css.extremos} aria-hidden="true">
        <span>{barras[0]?.campana}</span>
        <span className={css.escala}>
          Más seca
          <i className={css.rampa} />
          Más húmeda
        </span>
        <span>{barras[barras.length - 1]?.campana}</span>
      </div>
      {!habilitada && motivo && <p className={css.motivo}>{motivo}</p>}
    </div>
  );
}
