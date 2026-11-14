"use client";

import { useEffect, useRef, useState } from "react";
import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import { metadatosHoja } from "@/lib/formato";
import { useResultado } from "@/lib/resultado";
import { useVista } from "@/lib/vista";
import InterruptorVista, { type VistaResultado } from "./InterruptorVista";
import SerieCampanias from "./SerieCampanias";
import TablaTecnica from "./TablaTecnica";
import VistaPreviaColumnas from "./VistaPreviaColumnas";
import css from "./resultados.module.css";

/**
 * Hoja de resultados (RF11, RF22): sube desde abajo, entre el borde izquierdo y
 * el panel, cuando el panel llama a `abrirHoja()`. Reusa `.sheet` del prototipo.
 *
 * Encabezado: título, metadatos (lote, período de clima, pendiente, fecha),
 * interruptor Tabla / Tarjetas, Compartir (llega en la feature 9) y Cerrar.
 * Pie: el texto del prototipo y el aviso de apoyo, siempre visibles.
 */
export default function HojaComparacion() {
  const abierta = useVista((s) => s.hojaAbierta);
  const cerrar = useVista((s) => s.cerrarHoja);
  const resultado = useResultado();
  const [vista, setVista] = useState<VistaResultado>("tabla");
  // La fecha se toma al abrir, en el cliente: así no difiere entre el servidor y el navegador
  const [fecha, setFecha] = useState<Date | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  // body.sheet-open (subir los controles del mapa) lo pone ClaseBody de la persona 4, solo en compu
  useEffect(() => {
    if (!abierta) return;
    setFecha(new Date());
    titulo.current?.focus();
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && cerrarYVolver();
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
    // cerrarYVolver solo usa el store y el DOM: no hace falta en las dependencias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  function cerrarYVolver() {
    cerrar();
    // El foco vuelve al botón que abrió la hoja
    document.getElementById("comparar")?.focus();
  }

  return (
    <section className={`sheet${abierta ? " open" : ""}`} aria-labelledby="hoja-titulo" inert={!abierta}>
      <header>
        <h2 id="hoja-titulo" ref={titulo} tabIndex={-1}>
          Rotación actual y 3 alternativas
        </h2>
        {resultado.estado === "listo" && fecha && (
          <span className="meta">{metadatosHoja(resultado.datos, fecha)}</span>
        )}
        <div className="sp">
          <InterruptorVista valor={vista} onCambio={setVista} />
          <button type="button" className="ghost" disabled title="Mail, copiar resumen y PDF: próxima entrega">
            Compartir
          </button>
          <button type="button" className="ghost" onClick={cerrarYVolver} aria-label="Cerrar comparación">
            Cerrar
          </button>
        </div>
      </header>

      <div className={css.cuerpo}>
        {resultado.estado === "cargando" && <p className={css.estado}>Trayendo los datos de NASA…</p>}
        {resultado.estado === "error" && (
          <p className={css.estado} role="alert">
            No se pudo armar la comparación: {resultado.mensaje}
          </p>
        )}
        {resultado.estado === "listo" && <SerieCampanias salida={resultado.datos} />}
        {resultado.estado === "listo" &&
          (vista === "tabla" ? <TablaTecnica salida={resultado.datos} /> : <VistaPreviaColumnas salida={resultado.datos} />)}
      </div>

      <div className={`foot ${css.pie}`}>
        <div className={css.pieTextos}>
          <AvisoApoyo />
          <span>Compara datos: no indica qué hacer. Decide el productor con su agrónomo.</span>
        </div>
        {resultado.estado === "listo" && resultado.datos.es_mock && (
          <span>Datos de prueba: valores ilustrativos, no son datos de NASA.</span>
        )}
      </div>
    </section>
  );
}
