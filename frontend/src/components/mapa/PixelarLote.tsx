"use client";

import type L from "leaflet";
import { useEffect, useState } from "react";
import { ImageOverlay } from "react-leaflet";
import { useDibujo } from "@/lib/dibujo";
import { grillaDelLote, type GrillaLote } from "@/lib/momentos";
import { useEntradas } from "@/lib/store";
import css from "./PixelarLote.module.css";

/** Lo que dura todo: la ola (0,9 s), la grilla entera un momento y el apagado (0,5 s). */
const MS_TOTAL = 2200;
/** Lado máximo de la imagen de la grilla, en píxeles de pantalla. */
const LADO_MAXIMO = 1600;

interface Pixelado {
  clave: number;
  url: string;
  grilla: GrillaLote;
}

/** La grilla como imagen: un cuadrado por celda de ~30 m dentro del lote, con 1 px de junta. */
function imagenGrilla(g: GrillaLote): string | null {
  const k = Math.max(2, Math.min(12, Math.floor(LADO_MAXIMO / Math.max(g.columnas, g.filas))));
  const lienzo = document.createElement("canvas");
  lienzo.width = g.columnas * k;
  lienzo.height = g.filas * k;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  const junta = k >= 4 ? 1 : 0;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--hoja-brillo").trim() || "#4CAF50";
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  for (const [f, c] of g.dentro) ctx.fillRect(c * k, f * k, k - junta, k - junta);
  return lienzo.toDataURL("image/png");
}

/**
 * "El lote se pixela" (DESIGN.md, "Movimiento"): al cerrar el lote, la grilla
 * de 1″ (~30 m, la misma con la que el back calcula las capas) lo llena en una
 * ola desde la primera esquina y se apaga. Muestra, en un segundo, la
 * resolución con la que se va a analizar el campo. Responde a una acción del
 * productor (cerrar el lote), no se repite sola. Con `prefers-reduced-motion`
 * no pasa.
 *
 * Vive dentro de <MapContainer>.
 */
export default function PixelarLote() {
  const [pixelado, setPixelado] = useState<Pixelado | null>(null);

  useEffect(
    () =>
      useDibujo.subscribe((actual, anterior) => {
        if (actual.cierres <= anterior.cierres) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const grilla = grillaDelLote(useEntradas.getState().poligono);
        const url = grilla && grilla.dentro.length ? imagenGrilla(grilla) : null;
        if (grilla && url) setPixelado({ clave: actual.cierres, url, grilla });
      }),
    [],
  );

  useEffect(() => {
    if (!pixelado) return;
    const t = window.setTimeout(() => setPixelado(null), MS_TOTAL);
    return () => window.clearTimeout(t);
  }, [pixelado]);

  if (!pixelado) return null;
  const [x, y] = pixelado.grilla.origen;
  return (
    <ImageOverlay
      key={pixelado.clave}
      url={pixelado.url}
      bounds={pixelado.grilla.bounds}
      className={css.pixelar}
      interactive={false}
      eventHandlers={{
        // La ola nace en la primera esquina: su posición va como variable CSS en la imagen.
        add: (e) => {
          const img = (e.target as L.ImageOverlay).getElement();
          img?.style.setProperty("--ox", `${(x * 100).toFixed(1)}%`);
          img?.style.setProperty("--oy", `${(y * 100).toFixed(1)}%`);
        },
      }}
    />
  );
}
