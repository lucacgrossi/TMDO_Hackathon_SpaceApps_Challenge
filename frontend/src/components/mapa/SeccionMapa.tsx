"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dibujoNdvi, estadoCapas, filasFicha, type IdCapaLote, lecturaPixel, moverPixel, rasterDeCapa } from "@/lib/capasLote";
import type { Salida } from "@/lib/contrato";
import { useMapaLote } from "@/lib/mapaLote";
import { type Margenes, margenesLote } from "@/lib/margenesMapa";
import { useResultadoStore } from "@/lib/resultado";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";
import FichaLote from "./FichaLote";
import InspectorPixel from "./InspectorPixel";
import LeyendaLote from "./LeyendaLote";
import LineaTiempoLote from "./LineaTiempoLote";
import type { Pixel } from "./MapaLote";
import css from "./SeccionMapa.module.css";
import SelectorCapasLote from "./SelectorCapasLote";

/** Leaflet usa `window`: el mapa se carga solo en el navegador. */
const MapaLote = dynamic(() => import("./MapaLote"), {
  ssr: false,
  loading: () => <div className={css.cargando}>Cargando el mapa…</div>,
});

const SIN_PANELES: Margenes = { paddingTopLeft: [12, 12], paddingBottomRight: [12, 12] };

/** Pantalla táctil sin mouse (celular, tablet): el inspector se lee tocando el lote. */
function useTactil(): boolean {
  const [tactil, setTactil] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const actualizar = () => setTactil(mq.matches);
    actualizar();
    mq.addEventListener("change", actualizar);
    return () => mq.removeEventListener("change", actualizar);
  }, []);
  return tactil;
}

/**
 * Sección Mapa del dashboard (S4): el mapa del lote con sus capas del back, el
 * selector, la línea de tiempo de julio a junio, la leyenda, el inspector de
 * píxel y, a la derecha, la ficha técnica del lote.
 *
 * Autocontenida: recibe la respuesta de /analizar por props (la monta el
 * `Dashboard` de la persona 5). El mes es `useVista().mes` (0 = enero), el
 * mismo que lee el resto del dashboard; la capa, `useMapaLote`.
 */
export default function SeccionMapa({ salida }: { salida: Salida }) {
  // El lote con el que se pidió este análisis: si después se editó el lote, el
  // mapa sigue mostrando (y recortando las capas a) el que corresponde a los datos.
  const delPedido = useResultadoStore((s) => s.pedidoCon?.poligono);
  const actual = useEntradas((s) => s.poligono);
  const poligono = delPedido && delPedido.length >= 3 ? delPedido : actual;
  const mes = useVista((s) => s.mes);
  const cambiarMes = useVista((s) => s.cambiarMes);
  const capaElegida = useMapaLote((s) => s.capa);
  const cambiarCapa = useMapaLote((s) => s.cambiarCapa);
  const [pixel, setPixel] = useState<Pixel | null>(null);
  const tactil = useTactil();

  // Lienzo del mapa y paneles flotantes: se miden al encuadrar para no tapar el lote (H-020)
  const lienzo = useRef<HTMLDivElement>(null);
  const paneles = useRef<(HTMLDivElement | null)[]>([]);
  const margenes = useCallback((aspecto: number) => {
    const caja = lienzo.current?.getBoundingClientRect();
    if (!caja) return SIN_PANELES;
    const cajas = paneles.current.filter((p): p is HTMLDivElement => p != null).map((p) => p.getBoundingClientRect());
    return margenesLote(caja, cajas, aspecto);
  }, []);
  const panel = (i: number) => (el: HTMLDivElement | null) => {
    paneles.current[i] = el;
  };

  const capas = useMemo(() => estadoCapas(salida), [salida]);
  const filas = useMemo(() => filasFicha(salida), [salida]);
  // Si la capa elegida no viene en esta respuesta, se ve el satélite solo.
  const capa: IdCapaLote = capas.find((c) => c.id === capaElegida)?.disponible ? capaElegida : "satelite";

  const ndvi = capa === "ndvi" ? dibujoNdvi(salida, mes) : null;
  const raster = ndvi ? (ndvi.tipo === "raster" ? ndvi.capa : null) : rasterDeCapa(salida, capa, mes);
  const conValores = raster?.valores != null;
  const lectura = raster && conValores && pixel ? lecturaPixel(raster, pixel.fila, pixel.columna) : null;

  const elegirMes = useCallback(
    (m: number) => {
      cambiarMes(m);
      // La línea de tiempo es del NDVI: elegir un mes muestra el NDVI de ese mes.
      if (useMapaLote.getState().capa !== "ndvi") cambiarCapa("ndvi");
    },
    [cambiarMes, cambiarCapa],
  );

  // Sin capa raster (Satélite, Celda NASA POWER o NDVI por teselas) no hay
  // píxeles que leer: el inspector no se muestra.
  const ayuda = !conValores
    ? "Esta capa no trae valores por píxel (lote grande): se ve la imagen, sin lectura."
    : tactil
      ? "Tocá el lote para leer un píxel."
      : "Pasá el mouse sobre el lote o usá las flechas con el mapa enfocado para leer un píxel.";

  return (
    <section className={css.seccion} aria-label="Mapa del lote">
      <div
        className={css.mapa}
        tabIndex={0}
        aria-label="Mapa del lote. Con las flechas se lee el valor de un píxel."
        onKeyDown={(e) => {
          if (!raster || !conValores) return;
          if (e.key === "Escape") return setPixel(null);
          const p = moverPixel(raster, pixel, e.key);
          if (p) {
            e.preventDefault();
            setPixel(p);
          }
        }}
      >
        <div ref={lienzo} className={css.lienzo}>
          <MapaLote
            salida={salida}
            capa={capa}
            mes={mes}
            poligono={poligono}
            pixel={pixel}
            onPixel={setPixel}
            margenes={margenes}
          />
        </div>
        <div ref={panel(0)} className={css.arribaIzq}>
          <SelectorCapasLote capas={capas} activa={capa} onCambiar={cambiarCapa} />
        </div>
        {raster && (
          <div ref={panel(1)} className={css.arribaDer}>
            <InspectorPixel lectura={lectura} ayuda={ayuda} />
          </div>
        )}
        {/* En compu flotan sobre el mapa; debajo de 1100 px van debajo del mapa */}
        <div ref={panel(2)} className={css.abajoIzq}>
          <LineaTiempoLote visto={salida.visto_por_satelite} capas={salida.capas} mes={mes} onMes={elegirMes} />
        </div>
        <div ref={panel(3)} className={css.abajoDer}>
          <LeyendaLote salida={salida} capa={capa} mes={mes} raster={raster} ndvi={ndvi} />
        </div>
      </div>
      <FichaLote filas={filas} />
    </section>
  );
}
