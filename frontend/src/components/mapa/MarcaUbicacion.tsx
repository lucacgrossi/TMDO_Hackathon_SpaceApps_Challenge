"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";
import { useEntradas } from "@/lib/store";

/**
 * Marca "Tu lote está acá": el punto que eligió el productor con el buscador
 * o el GPS (BuscadorLote solo escribe `ubicacion` en el estado; el mapa se
 * encarga de mostrarla). Sale de `showTarget()` del prototipo (~línea 137).
 *
 * Solo se ve cuando el modo es "dibujo": es la guía para marcar las esquinas.
 * Con el lote de ejemplo no tiene sentido mostrarla.
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
  const modoLote = useEntradas((s) => s.modoLote);
  if (!ubicacion || modoLote !== "dibujo") return null;
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
