"use client";

import { useEffect, useState } from "react";
import { urlImagen, type CapaRaster } from "@/lib/capaRaster";
import type { LatLng } from "@/lib/entradas";
import { esquinasEnImagen, factorRecorte } from "@/lib/recorteRaster";

/** Recortes ya hechos (por capa y lote): cambiar de mes y volver no recalcula. */
const cache = new Map<string, string>();

function recortar(img: HTMLImageElement, raster: CapaRaster, poligono: readonly LatLng[]): string | null {
  const k = factorRecorte(img.naturalWidth, img.naturalHeight);
  const ancho = img.naturalWidth * k;
  const alto = img.naturalHeight * k;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  // Sin suavizado: cada píxel del dato queda como un bloque nítido de k × k.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, ancho, alto);
  // Se queda solo lo que cae dentro del contorno del lote.
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  esquinasEnImagen(poligono, raster.bounds, ancho, alto).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  return lienzo.toDataURL("image/png");
}

/**
 * La imagen de la capa recortada al polígono del lote (`lib/recorteRaster.ts`),
 * lista para `ImageOverlay`. null mientras se arma: así nunca se ve, ni por un
 * instante, el raster entero por fuera del lote.
 */
export function useImagenRecortada(raster: CapaRaster | null, poligono: readonly LatLng[], clave: string): string | null {
  // La llave incluye una huella del PNG: otro análisis del mismo lote puede traer otra imagen.
  const llave = raster && poligono.length >= 3 ? `${clave}|${raster.png.length}|${raster.png.slice(-24)}|${poligono.map((p) => p.join(",")).join(";")}` : null;
  const [url, setUrl] = useState<string | null>(llave ? (cache.get(llave) ?? null) : null);

  useEffect(() => {
    if (!raster || !llave) return setUrl(null);
    const hecha = cache.get(llave);
    if (hecha) return setUrl(hecha);
    setUrl(null);
    let vigente = true;
    const img = new Image();
    img.onload = () => {
      if (!vigente) return;
      const recorte = recortar(img, raster, poligono);
      // Si el navegador no puede recortar, se muestra la capa entera antes que nada.
      const final = recorte ?? urlImagen(raster);
      cache.set(llave, final);
      setUrl(final);
    };
    img.src = urlImagen(raster);
    return () => {
      vigente = false;
    };
    // raster y poligono quedan representados por la llave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);

  return url;
}
