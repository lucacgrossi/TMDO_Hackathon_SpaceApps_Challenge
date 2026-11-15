"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { dibujoNdvi, estadoCapas, filasFicha, type IdCapaLote, lecturaPixel, moverPixel, rasterDeCapa } from "@/lib/capasLote";
import type { Salida } from "@/lib/contrato";
import { useMapaLote } from "@/lib/mapaLote";
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
  const ayuda = conValores
    ? "Pasá el mouse sobre el lote o usá las flechas con el mapa enfocado para leer un píxel."
    : "Esta capa no trae valores por píxel (lote grande): se ve la imagen, sin lectura.";

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
        <MapaLote salida={salida} capa={capa} mes={mes} poligono={poligono} pixel={pixel} onPixel={setPixel} />
        <div className={css.arribaIzq}>
          <SelectorCapasLote capas={capas} activa={capa} onCambiar={cambiarCapa} />
        </div>
        {raster && (
          <div className={css.arribaDer}>
            <InspectorPixel lectura={lectura} ayuda={ayuda} />
          </div>
        )}
        <div className={css.abajoIzq}>
          <LineaTiempoLote visto={salida.visto_por_satelite} capas={salida.capas} mes={mes} onMes={elegirMes} />
        </div>
        <div className={css.abajoDer}>
          <LeyendaLote salida={salida} capa={capa} mes={mes} raster={raster} ndvi={ndvi} />
        </div>
      </div>
      <FichaLote filas={filas} />
    </section>
  );
}
