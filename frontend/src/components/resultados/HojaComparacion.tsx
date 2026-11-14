"use client";

import { useEffect, useRef, useState } from "react";
import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import AvisoDesactualizado from "./AvisoDesactualizado";
import { VENTANA_ENTRADA_MS, sinMovimiento } from "@/lib/animacion";
import { AVISO_PRECALCULADO, metadatosHoja } from "@/lib/formato";
import { despertar } from "@/lib/api";
import { useResultado, useResultadoStore } from "@/lib/resultado";
import { useVista } from "@/lib/vista";
import ChoqueObjetivos from "./ChoqueObjetivos";
import { EntradaHoja } from "./EntradaHoja";
import InterruptorVista, { type VistaResultado } from "./InterruptorVista";
import MenuCompartir from "./MenuCompartir";
import SerieCampanias from "./SerieCampanias";
import TablaTecnica from "./TablaTecnica";
import TarjetasEstrategias from "./TarjetasEstrategias";
import css from "./resultados.module.css";

/**
 * Hoja de resultados (RF11, RF22): sube desde abajo, entre el borde izquierdo y
 * el panel, cuando el panel llama a `abrirHoja()`. Reusa `.sheet` del prototipo.
 *
 * Encabezado: título, metadatos (lote, período de clima, pendiente, fecha),
 * interruptor Tabla / Tarjetas, Compartir (`MenuCompartir`) y Cerrar.
 * Pie: el texto del prototipo y el aviso de apoyo, siempre visibles.
 *
 * Entrada: al abrir, la hoja lleva la clase `intro` del prototipo durante
 * `VENTANA_ENTRADA_MS` (columnas o tarjetas en orden, rotación que se dibuja,
 * barras de la serie una tras otra, números desde 0). Con
 * `prefers-reduced-motion: reduce` no hay entrada.
 */
export default function HojaComparacion() {
  const abierta = useVista((s) => s.hojaAbierta);
  const cerrar = useVista((s) => s.cerrarHoja);
  const resultado = useResultado();
  const reintentar = useResultadoStore((s) => s.reintentar);
  const [vista, setVista] = useState<VistaResultado>("tabla");
  // La fecha se toma al abrir, en el cliente: así no difiere entre el servidor y el navegador
  const [fecha, setFecha] = useState<Date | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [entrada, setEntrada] = useState(false);

  // Despierta el back (Cloud Run) al cargar la página: el primer pedido después de un rato tarda más
  useEffect(() => despertar(), []);

  // body.sheet-open (subir los controles del mapa) lo pone ClaseBody de la persona 4, solo en compu
  useEffect(() => {
    if (!abierta) return;
    setFecha(new Date());
    titulo.current?.focus();
    let fin: ReturnType<typeof setTimeout> | undefined;
    if (!sinMovimiento()) {
      setEntrada(true);
      fin = setTimeout(() => setEntrada(false), VENTANA_ENTRADA_MS);
    }
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && cerrarYVolver();
    window.addEventListener("keydown", alEscape);
    return () => {
      window.removeEventListener("keydown", alEscape);
      clearTimeout(fin);
      setEntrada(false);
    };
    // cerrarYVolver solo usa el store y el DOM: no hace falta en las dependencias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  function cerrarYVolver() {
    cerrar();
    // El foco vuelve al botón que abrió la hoja
    document.getElementById("comparar")?.focus();
  }

  return (
    <section className={`sheet${abierta ? " open" : ""}${entrada ? " intro" : ""}`} aria-labelledby="hoja-titulo" inert={!abierta}>
      <header>
        <h2 id="hoja-titulo" ref={titulo} tabIndex={-1}>
          Rotación actual y 3 alternativas
        </h2>
        {resultado.estado === "listo" && fecha && (
          <span className="meta">{metadatosHoja(resultado.datos, fecha)}</span>
        )}
        <div className="sp">
          <InterruptorVista valor={vista} onCambio={setVista} />
          <MenuCompartir salida={resultado.estado === "listo" ? resultado.datos : null} />
          <button type="button" className="ghost" onClick={cerrarYVolver} aria-label="Cerrar comparación">
            Cerrar
          </button>
        </div>
      </header>

      <AvisoDesactualizado />

      <EntradaHoja.Provider value={entrada}>
        <div className={css.cuerpo}>
          {resultado.estado === "cargando" && (
            <p className={css.estado} role="status">
              Trayendo los datos de NASA… puede tardar hasta medio minuto.
            </p>
          )}
          {resultado.estado === "error" && (
            <div className={css.estado} role="alert">
              <p>No se pudo armar la comparación: {resultado.mensaje.replace(/[.\s]+$/, "")}.</p>
              {resultado.reintentable && (
                <button type="button" className="ghost" onClick={reintentar}>
                  Probar de nuevo
                </button>
              )}
            </div>
          )}
          {resultado.estado === "listo" && <ChoqueObjetivos estrategias={resultado.datos.estrategias} />}
          {resultado.estado === "listo" && <SerieCampanias salida={resultado.datos} />}
          {resultado.estado === "listo" &&
            (vista === "tabla" ? <TablaTecnica salida={resultado.datos} /> : <TarjetasEstrategias salida={resultado.datos} />)}
        </div>
      </EntradaHoja.Provider>

      <div className={`foot ${css.pie}`}>
        <div className={css.pieTextos}>
          <AvisoApoyo />
          <span>Compara datos: no indica qué hacer. Decide el productor con su agrónomo.</span>
        </div>
        {resultado.estado === "listo" && resultado.datos.es_mock && (
          <span>{AVISO_PRECALCULADO}</span>
        )}
      </div>
    </section>
  );
}
