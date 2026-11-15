"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";
import { useApp } from "@/lib/app";
import { COLORES_SATELITE, SATELITE, trazosGrilla } from "@/lib/momentos";
import { useEntradas } from "@/lib/store";
import css from "./IntroOrbita.module.css";

/** Vista desde la órbita: Sudamérica entera. */
const DESDE: [number, number] = [-28, -63];
const ZOOM_ORBITA = 3.5;
/** Llegada: la región pampeana, donde se busca y se marca el lote (la vista inicial de S1). */
const HASTA: [number, number] = [-33.5, -62.5];
const ZOOM_LLEGADA = 7;
/** El zoom mínimo normal del mapa (frontend/CLAUDE.md, "Límites de zoom"). */
const ZOOM_MINIMO = 5;
/** Lo que tarda el satélite en cruzar; el vuelo dura un poco menos. */
const MS_CRUCE = 3000;

const trazos = trazosGrilla(SATELITE, COLORES_SATELITE);

/**
 * "De la órbita al lote" (DESIGN.md, "Movimiento"): al abrir la app, el mapa
 * arranca con Sudamérica vista desde lejos, un satélite pixel (como los del
 * logo) cruza la pantalla y la cámara baja hasta la región pampeana. Pasa una
 * vez, al entrar a S1 sin lote; cualquier toque en el mapa lo corta. Con
 * `prefers-reduced-motion` no pasa: el mapa arranca directo en la región.
 *
 * Vive dentro de <MapContainer> (usa `useMap`).
 */
export default function IntroOrbita() {
  const mapa = useMap();
  const [satelite, setSatelite] = useState(false);

  useEffect(() => {
    const enS1SinLote = useApp.getState().etapa === "marcar" && useEntradas.getState().poligono.length < 3;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enS1SinLote || reducido) return;

    const contenedor = mapa.getContainer();
    const terminar = () => {
      mapa.setMinZoom(ZOOM_MINIMO);
      setSatelite(false);
    };
    // Cualquier gesto del productor corta la animación y le devuelve el mapa.
    const cortar = () => {
      mapa.stop();
      terminar();
      quitar();
    };
    const quitar = () => {
      contenedor.removeEventListener("pointerdown", cortar);
      contenedor.removeEventListener("wheel", cortar);
    };

    mapa.setMinZoom(3);
    mapa.setView(DESDE, ZOOM_ORBITA, { animate: false });
    setSatelite(true);
    contenedor.addEventListener("pointerdown", cortar, { once: true });
    contenedor.addEventListener("wheel", cortar, { once: true, passive: true });

    const vuelo = window.setTimeout(() => {
      mapa.flyTo(HASTA, ZOOM_LLEGADA, { duration: 2.4, easeLinearity: 0.15 });
      mapa.once("moveend", () => {
        mapa.setMinZoom(ZOOM_MINIMO);
        quitar();
      });
    }, 450);
    const fin = window.setTimeout(terminar, MS_CRUCE);

    return () => {
      window.clearTimeout(vuelo);
      window.clearTimeout(fin);
      quitar();
      mapa.setMinZoom(ZOOM_MINIMO);
    };
  }, [mapa]);

  if (!satelite) return null;
  return createPortal(
    <div className={css.orbita} aria-hidden="true">
      <svg className={css.satelite} viewBox="0 0 19 7" shapeRendering="crispEdges" focusable="false">
        {Object.entries(trazos).map(([c, d]) => (
          <path key={c} d={d} style={{ fill: COLORES_SATELITE[c] }} />
        ))}
      </svg>
    </div>,
    mapa.getContainer(),
  );
}
