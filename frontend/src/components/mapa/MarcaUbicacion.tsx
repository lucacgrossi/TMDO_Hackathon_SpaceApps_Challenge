"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";

/**
 * Marca "Tu lote está acá": el punto que eligió el productor con el buscador
 * o el GPS (BuscadorLote solo escribe `ubicacion` en el estado; el mapa se
 * encarga de mostrarla). Sale de `showTarget()` del prototipo (~línea 150).
 *
 * Cuándo se ve lo decide `useMapa.marcaVisible`, no el modo: en el prototipo
 * final la marca aparece recién cuando el mapa LLEGA al lugar (no durante el
 * vuelo del paso 1 al 2) y se va al terminar o cancelar el dibujo (endDraw).
 */

// Ícono hecho con HTML (divIcon) para reusar la clase `.tmark` del prototipo
// (círculo con pulso). Se crea una sola vez: Leaflet no necesita uno por render.
const icono = L.divIcon({
  className: "",
  html: '<div class="tmark" role="img" aria-label="Tu lote está acá"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11], // la mitad: así el centro del círculo cae en el punto exacto
});

export default function MarcaUbicacion() {
  const ubicacion = useEntradas((s) => s.ubicacion);
  const marcaVisible = useMapa((s) => s.marcaVisible);
  if (!ubicacion || !marcaVisible) return null;
  return (
    <Marker
      position={[ubicacion.lat, ubicacion.lng]}
      icon={icono}
      // No interactiva: un click encima tiene que llegar al mapa (para marcar una esquina).
      interactive={false}
      keyboard={false}
    />
  );
}
