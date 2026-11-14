"use client";

import L from "leaflet";
import { Marker, Rectangle } from "react-leaflet";
import { centro } from "@/lib/geo";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";
import { celdaPower } from "@/lib/zonaClima";

/**
 * F9 · Capa "Lluvia y heladas": dibuja la zona del dato de clima (la celda de
 * ~50 km de NASA POWER que contiene al lote). Los valores del mes van en la leyenda.
 * Sale de `drawClima()` y `clearClima()` del prototipo final (prototipo-app.js ~líneas 326-330).
 *
 * Estilo distinto al lote (celeste, punteado) y con rótulo, para que no
 * parezca otro lote: toda esa zona tiene un solo valor de clima.
 */

// Rótulo `.celltag` del prototipo, pegado a la esquina noroeste de la celda.
const iconoRotulo = L.divIcon({
  className: "",
  html: '<div class="celltag">Zona del dato de clima de NASA · ~50 km</div>',
  iconSize: [0, 0],
  // Ancla negativa: el rótulo queda 8 px adentro de la esquina, no encima del borde.
  iconAnchor: [-8, -8],
});

export default function CapaClima() {
  const activa = useMapa((s) => s.capa === "clima");
  const poligono = useEntradas((s) => s.poligono);
  if (!activa) return null;

  const celda = celdaPower(centro(poligono));
  return (
    <>
      <Rectangle
        bounds={celda}
        pathOptions={{
          color: "#9fd3ff",
          weight: 2,
          dashArray: "2 7",
          lineCap: "round",
          fillColor: "#5aa9e6",
          fillOpacity: 0.08,
        }}
        interactive={false}
      />
      <Marker position={[celda[1][0], celda[0][1]]} icon={iconoRotulo} interactive={false} keyboard={false} />
    </>
  );
}
