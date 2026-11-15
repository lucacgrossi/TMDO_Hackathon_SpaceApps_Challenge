"use client";

import type { ReactNode } from "react";
import ClimaHistorico from "@/components/clima/ClimaHistorico";
import SeccionMapa from "@/components/mapa/SeccionMapa";
import Rotaciones from "@/components/resultados/Rotaciones";
import Boton from "@/components/comunes/Boton";
import type { Seccion } from "@/lib/app";
import type { Salida } from "@/lib/contrato";
import { TEXTO_DESACTUALIZADO, fichaDelLote, itemMenu } from "@/lib/dashboard";
import BarraLateral from "./BarraLateral";
import Encabezado from "./Encabezado";
import css from "./Dashboard.module.css";

export interface PropsDashboard {
  /** Sección activa (`useApp().seccion`). */
  seccion: Seccion;
  /** Cambia de sección (`useApp().irA`). */
  onCambiarSeccion: (s: Seccion) => void;
  /** "Editar lote y entradas": vuelve a `configurar` sin perder el resultado (`useApp().volverAEditar`). */
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
function contenido(seccion: Seccion, salida: Salida): ReactNode {
  switch (seccion) {
    case "mapa":
      return <SeccionMapa salida={salida} />;
    case "clima":
      return <ClimaHistorico salida={salida} />;
    case "rotaciones":
      return <Rotaciones salida={salida} />;
  }
}

/**
 * Esqueleto del dashboard (persona 5): barra lateral + encabezado + la sección
 * activa. Recibe todo por props; `page.tsx` lo conecta con `useApp` y el resultado.
 */
export default function Dashboard({ seccion, onCambiarSeccion, onEditar, salida, desactualizado }: PropsDashboard) {
  const item = itemMenu(seccion);
  const idTitulo = `titulo-${seccion}`;

  return (
    <div className={css.dashboard}>
      <BarraLateral
        seccion={seccion}
        onCambiarSeccion={onCambiarSeccion}
        onEditar={onEditar}
        lugar={salida.lote.localidad_aprox}
      />
      <main className={css.principal}>
        {desactualizado && (
          <p className={css.desactualizado} role="status">
            {TEXTO_DESACTUALIZADO}
          </p>
        )}
        <Encabezado
          id={idTitulo}
          titulo={item.titulo}
          ficha={fichaDelLote(salida)}
          esMock={salida.es_mock}
          accion={seccion === "rotaciones" ? <BotonExportar /> : undefined}
        />
        <section className={css.seccion} aria-labelledby={idTitulo}>
          {contenido(seccion, salida)}
        </section>
      </main>
    </div>
  );
}

/** "Exportar PDF" (Rotaciones): abre la impresión del navegador; la hoja la arma `HojaImpresion`. */
function BotonExportar() {
  return (
    <Boton variante="primario" icono="imprimir" onClick={() => window.print()}>
      Exportar PDF
    </Boton>
  );
}
