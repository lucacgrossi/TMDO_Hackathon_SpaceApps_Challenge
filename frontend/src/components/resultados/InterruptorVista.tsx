"use client";

import { useRef, type KeyboardEvent } from "react";
import css from "./resultados.module.css";

export type VistaResultado = "tabla" | "tarjetas";

const OPCIONES: { valor: VistaResultado; texto: string }[] = [
  { valor: "tabla", texto: "Tabla" },
  { valor: "tarjetas", texto: "Tarjetas" },
];

/**
 * Interruptor Tabla / Tarjetas (DESIGN.md, "Decisiones tomadas"). Es un grupo de
 * radios: las flechas pasan de una opción a la otra, como el selector del lote.
 */
export default function InterruptorVista({
  valor,
  onCambio,
}: {
  valor: VistaResultado;
  onCambio: (v: VistaResultado) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const i = OPCIONES.findIndex((o) => o.valor === valor);
    const siguiente = (i + 1) % OPCIONES.length;
    onCambio(OPCIONES[siguiente].valor);
    refs.current[siguiente]?.focus();
  }

  return (
    <div className={`seg2 ${css.interruptor}`} role="radiogroup" aria-label="Vista de la comparación" onKeyDown={teclas}>
      {OPCIONES.map((o, i) => (
        <button
          key={o.valor}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          tabIndex={valor === o.valor ? 0 : -1}
          onClick={() => onCambio(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
