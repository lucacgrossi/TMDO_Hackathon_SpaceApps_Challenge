"use client";

import dynamic from "next/dynamic";

/** Leaflet necesita window: el mapa se carga solo en el navegador. */
const MapaDinamico = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-mapa" aria-label="Cargando el mapa" />,
});

export default MapaDinamico;
