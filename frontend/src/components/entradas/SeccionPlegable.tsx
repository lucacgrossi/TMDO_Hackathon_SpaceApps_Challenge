"use client";

import { useId, useState, type ReactNode } from "react";
import estilos from "./SeccionPlegable.module.css";

interface Props {
  titulo: string;
  /** Lo cargado, en una línea: se ve con la sección cerrada (DESIGN.md, S2). */
  resumen: string;
  abiertaAlInicio?: boolean;
  children: ReactNode;
}

/**
 * Sección plegable del panel de entradas (Figma: Sección plegable · Abierta,
 * Cerrada). El encabezado es un botón con `aria-expanded`; cerrada muestra el
 * resumen para que el productor vea todo lo cargado sin abrir nada.
 *
 * El contenido queda montado aunque esté cerrada (solo se oculta): así los
 * campos no controlados (mediciones) no pierden lo que se escribió.
 */
export default function SeccionPlegable({ titulo, resumen, abiertaAlInicio = false, children }: Props) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const id = useId();
  return (
    <section className={estilos.seccion}>
      <h2 className={estilos.encabezado}>
        <button
          type="button"
          className={estilos.boton}
          aria-expanded={abierta}
          aria-controls={`${id}-contenido`}
          onClick={() => setAbierta((a) => !a)}
        >
          <span className={estilos.textos}>
            <span className={estilos.titulo}>{titulo}</span>
            {!abierta && <span className={estilos.resumen}>{resumen}</span>}
          </span>
          {/* Signo pixel: + cerrada, − abierta. Decorativo: el estado lo dice aria-expanded. */}
          <span className={estilos.signo} aria-hidden="true">
            {abierta ? "−" : "+"}
          </span>
        </button>
      </h2>
      <div id={`${id}-contenido`} className={estilos.contenido} hidden={!abierta}>
        {children}
      </div>
    </section>
  );
}
