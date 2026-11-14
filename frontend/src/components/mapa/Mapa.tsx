"use client";

/**
 * F2 · Mapa base (Esri satélite + nombres, zoom 5 a 18, Esri nativo hasta 17).
 * Pieza vacía creada en F0: la completa front-mapa-base con react-leaflet.
 * Después F3 dibuja el lote, F4 la marca de ubicación y F5 el dibujo.
 * Solo corre en el navegador: importarlo siempre con MapaDinamico.
 */
export default function Mapa() {
  return <div id="map" aria-label="Mapa satelital" />;
}
