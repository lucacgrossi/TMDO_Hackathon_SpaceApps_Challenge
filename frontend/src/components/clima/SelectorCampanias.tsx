"use client";

import { LETRA_TERCIO } from "@/lib/campanaClima";
import type { SerieAnual } from "@/lib/contrato";
import { barrasSerie } from "@/lib/serie";
import css from "./SelectorCampanias.module.css";

/**
 * Selector de las 30 campañas (S5): una barra por campaña con su lluvia,
 * pintada por tercio y con su letra (S, N, H: el color nunca es la única
 * señal). El tercio es el `tipo` que manda el back. Si la respuesta no trae
 * los 12 meses de cada campaña, las barras se ven pero no se eligen, y se
 * dice por qué.
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
  return (
    <div>
      <div className={css.barras} role="group" aria-label="Campañas de julio a junio, lluvia por tercio">
        {barras.map((b) => (
          <button
            key={b.campana}
            type="button"
            className={css.barra}
            data-tipo={b.tipo}
            style={{ height: `${Math.max(4, b.alto * 100)}%` }}
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
        <span>{barras[barras.length - 1]?.campana}</span>
      </div>
      {!habilitada && motivo && <p className={css.motivo}>{motivo}</p>}
    </div>
  );
}
