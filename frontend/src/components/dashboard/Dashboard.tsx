"use client";

import type { ReactNode } from "react";
import type { Salida } from "@/lib/contrato";
import { TEXTO_DESACTUALIZADO, datosSeccion, fichaDelLote, type Seccion } from "@/lib/dashboard";
import BarraLateral from "./BarraLateral";
import Encabezado from "./Encabezado";
import SeccionPendiente from "./SeccionPendiente";
import css from "./Dashboard.module.css";

export interface PropsDashboard {
  /** Sección activa (`useApp().seccion`). */
  seccion: Seccion;
  /** Cambia de sección (`useApp().irA`). */
  onCambiarSeccion: (s: Seccion) => void;
  /** "Editar lote y entradas": vuelve a `configurar` sin perder el resultado. */
  onEditar: () => void;
  /** La respuesta de /analizar. */
  salida: Salida;
  /** true si las entradas cambiaron después del análisis (banda `--warn`). */
  desactualizado: boolean;
}

/**
 * Contenido de cada sección. Cada dueño cambia SOLO su línea:
 * Mapa y Clima histórico (Luca) y Rotaciones (persona 5).
 */
function contenido(seccion: Seccion): ReactNode {
  switch (seccion) {
    case "mapa":
      return <SeccionPendiente nombre="Mapa del lote" />;
    case "clima":
      return <SeccionPendiente nombre="Clima histórico" />;
    case "rotaciones":
      return <SeccionPendiente nombre="Rotaciones" />;
  }
}

/**
 * Esqueleto del dashboard (persona 5): barra lateral + encabezado + la sección
 * activa. Recibe todo por props: no depende de `useApp` (paso 0 de persona 4),
 * que lo conecta desde `page.tsx`.
 */
export default function Dashboard({ seccion, onCambiarSeccion, onEditar, salida, desactualizado }: PropsDashboard) {
  const datos = datosSeccion(seccion);
  const idTitulo = `titulo-${seccion}`;

  return (
    <div className={css.dashboard}>
      <BarraLateral
        seccion={seccion}
        onCambiarSeccion={onCambiarSeccion}
        onEditar={onEditar}
        aviso={salida.aviso}
        lugar={salida.lote.localidad_aprox}
      />
      <main className={css.principal}>
        {desactualizado && (
          <p className={css.desactualizado} role="status">
            {TEXTO_DESACTUALIZADO}
          </p>
        )}
        <Encabezado id={idTitulo} titulo={datos.titulo} ficha={fichaDelLote(salida)} esMock={salida.es_mock} />
        <section className={css.seccion} aria-labelledby={idTitulo}>
          {contenido(seccion)}
        </section>
      </main>
    </div>
  );
}
