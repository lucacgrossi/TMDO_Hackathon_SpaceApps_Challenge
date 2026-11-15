"use client";

import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import Boton from "@/components/comunes/Boton";
import { useApp } from "@/lib/app";
import { centro } from "@/lib/geo";
import {
  coordenadas,
  resumenDatosLote,
  resumenMediciones,
  resumenPrioridades,
  resumenRestricciones,
  resumenRotacion,
  superficie,
} from "@/lib/resumenEntradas";
import { useEntradas } from "@/lib/store";
import { useZona } from "@/lib/zona";
import estilos from "./PanelEntradas.module.css";
import SeccionDatosLote from "./SeccionDatosLote";
import SeccionMediciones from "./SeccionMediciones";
import SeccionObjetivos from "./SeccionObjetivos";
import SeccionPlegable from "./SeccionPlegable";
import SeccionRestricciones from "./SeccionRestricciones";
import SeccionRotacion from "./SeccionRotacion";

/**
 * S2 · Panel de entradas (DESIGN.md): panel derecho de 400 px con scroll y
 * pie fijo. Arriba "Tu lote"; en el medio, una sección plegable por grupo de
 * entradas, cada una con su resumen cuando está cerrada; abajo, "Analizar lote".
 *
 * Sobre el mapa, arriba a la izquierda, la superficie del lote y "Volver a
 * marcar el lote" (vuelve a S1).
 */
export default function PanelEntradas() {
  const entradas = useEntradas();
  const analizar = useApp((s) => s.analizar);
  const hayResultado = useApp((s) => s.hayResultado);
  const volverAMarcar = useApp((s) => s.volverAMarcar);
  const irA = useApp((s) => s.irA);
  const zona = useZona(entradas.poligono);
  const ha = superficie(entradas.poligono);

  return (
    <>
      <div className={estilos.loteMapa}>
        <span>
          Lote de <b>{ha}</b>
        </span>
        <Boton variante="secundario" icono="editar" onClick={volverAMarcar}>
          Volver a marcar el lote
        </Boton>
      </div>

      <aside className={estilos.panel} aria-labelledby="titulo-panel">
        <header className={estilos.encabezado}>
          <h1 id="titulo-panel" className={estilos.titulo}>
            Tu lote
          </h1>
          <dl className={estilos.ficha}>
            <div>
              <dt>Superficie</dt>
              <dd>{ha}</dd>
            </div>
            <div>
              <dt>Centro</dt>
              <dd>{coordenadas(centro(entradas.poligono))}</dd>
            </div>
            <div>
              <dt>Zona</dt>
              <dd>{zona ?? (entradas.modoLote === "demo" ? "Lote de ejemplo, Río Cuarto" : "Sin dato")}</dd>
            </div>
          </dl>
        </header>

        <div className={estilos.secciones}>
          <SeccionPlegable titulo="Rotación actual" resumen={resumenRotacion(entradas)} abiertaAlInicio>
            <SeccionRotacion />
          </SeccionPlegable>
          <SeccionPlegable titulo="Prioridades" resumen={resumenPrioridades(entradas.objetivos)}>
            <SeccionObjetivos />
          </SeccionPlegable>
          <SeccionPlegable titulo="Restricciones y no sembrar" resumen={resumenRestricciones(entradas)}>
            <SeccionRestricciones />
          </SeccionPlegable>
          <SeccionPlegable titulo="Datos del lote" resumen={resumenDatosLote(entradas)}>
            <SeccionDatosLote />
          </SeccionPlegable>
          <SeccionPlegable titulo="Mediciones propias" resumen={resumenMediciones(entradas.mediciones)}>
            <SeccionMediciones />
          </SeccionPlegable>
        </div>

        <footer className={estilos.pie}>
          {/* El error de /analizar (S3b) y la conexión con la API los suma el PR de la conexión. */}
          <Boton variante="primario" ancho="completo" onClick={analizar}>
            Analizar lote
          </Boton>
          <p className={estilos.nota}>
            Consulta NASA POWER, HLS, NASADEM y ESA WorldCover. Suele tardar hasta 30 s.
          </p>
          {hayResultado && (
            <Boton variante="fantasma" onClick={() => irA("mapa")}>
              Volver al análisis anterior
            </Boton>
          )}
          <AvisoApoyo />
        </footer>
      </aside>
    </>
  );
}
