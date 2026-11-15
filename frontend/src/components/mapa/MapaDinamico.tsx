"use client";

import dynamic from "next/dynamic";

/** Leaflet usa `window`: el mapa se carga solo en el navegador, nunca en el servidor. */
const MapaDinamico = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <div id="map" aria-label="Cargando el mapa" />,
});

export default MapaDinamico;
