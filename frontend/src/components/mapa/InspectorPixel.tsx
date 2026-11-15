"use client";

import type { LecturaPixel } from "@/lib/capasLote";
import css from "./InspectorPixel.module.css";

/**
 * Inspector de píxel (RF18): el valor de `valores[fila][columna]` de la capa
 * activa, con el píxel y la fuente. Se abre con el mouse o con las flechas
 * sobre el mapa con foco. Sin capa con valores por píxel, dice por qué.
 */
export default function InspectorPixel({ lectura, ayuda }: { lectura: LecturaPixel | null; ayuda: string }) {
  return (
    <div className={css.inspector} aria-live="polite" aria-atomic="true">
      {lectura ? (
        <>
          <b className={css.valor}>
            {lectura.color && <i style={{ background: lectura.color }} aria-hidden="true" />}
            {lectura.texto}
          </b>
          <span className={css.pie}>{lectura.pixel}</span>
          <span className={css.fuente}>{lectura.fuente}</span>
        </>
      ) : (
        <span className={css.pie}>{ayuda}</span>
      )}
    </div>
  );
}
