"use client";

import type { EstadoCapaLote, IdCapaLote } from "@/lib/capasLote";
import css from "./SelectorCapasLote.module.css";

/**
 * Chips de capa del mapa del lote (S4): Satélite, NDVI, Pendiente, Cultivo,
 * Erosión y Celda NASA POWER. Las capas que la respuesta no trae (o que están
 * en `capas.no_disponibles`) van deshabilitadas con el motivo en el `title`.
 */
export default function SelectorCapasLote({
  capas,
  activa,
  onCambiar,
}: {
  capas: EstadoCapaLote[];
  activa: IdCapaLote;
  onCambiar: (id: IdCapaLote) => void;
}) {
  return (
    <div className={css.chips} role="group" aria-label="Capa del mapa">
      {capas.map((c) => (
        <button
          key={c.id}
          type="button"
          className={css.chip}
          aria-pressed={activa === c.id}
          disabled={!c.disponible}
          title={c.disponible ? c.ayuda : `${c.nombre}: ${c.motivo}`}
          onClick={() => onCambiar(c.id)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}
