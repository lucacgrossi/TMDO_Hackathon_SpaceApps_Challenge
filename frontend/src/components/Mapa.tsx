"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";
import { ESRI, LOTE_DEMO, ZOOM_INICIAL, ZOOM_MAX, ZOOM_MIN } from "@/lib/mapa";

/**
 * Mapa de fondo. Solo corre en el cliente (Leaflet usa window): se importa
 * con MapaDinamico. Marcar el lote y el buscador van en front-mapa-lote.
 */
export default function Mapa() {
  return (
    <MapContainer
      center={LOTE_DEMO}
      zoom={ZOOM_INICIAL}
      minZoom={ZOOM_MIN}
      maxZoom={ZOOM_MAX}
      zoomControl={false}
      className="h-full w-full bg-mapa"
    >
      <TileLayer url={ESRI.url} attribution={ESRI.atribucion} maxNativeZoom={ESRI.maxNativeZoom} maxZoom={ZOOM_MAX} />
    </MapContainer>
  );
}
