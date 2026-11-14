"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import { useEntradas } from "@/lib/store";
import AvisoSinConexion from "./AvisoSinConexion";
import Encuadre from "./Encuadre";
import MarcaUbicacion from "./MarcaUbicacion";

/**
 * F2 · Mapa base: imagen satelital de Esri + nombres de lugares encima.
 * Sale de `L.map(...)` y las dos `L.tileLayer` del prototipo (prototipo-app.js ~líneas 45-55).
 *
 * Solo corre en el navegador (Leaflet usa `window`): importarlo siempre con
 * MapaDinamico. El mapa existe en los dos pasos; en el paso 1 el CSS del
 * prototipo (body.onb) lo tapa con el formulario, así al pasar al mapa ya
 * está cargado y solo hay que volar al lote.
 *
 * Lo que va adentro del mapa son piezas chicas, una por archivo:
 * Encuadre (cámara) y MarcaUbicacion (lo que eligió el buscador).
 */

/** Centro inicial: el lote de ejemplo de Río Cuarto (setView del prototipo). */
const CENTRO_DEMO: [number, number] = [-33.2476, -64.2325];

/**
 * Zoom máximo del mapa. Esri tiene imagen hasta 18 en el lote demo, pero no en
 * todas las zonas: por eso las capas piden teselas reales hasta 17
 * (maxNativeZoom) y en 18 Leaflet agranda las de 17 en vez de mostrar
 * "Map data not yet available". Ver frontend/CLAUDE.md, "Límites de zoom".
 */
const ZOOM_MAX = 18;
const ZOOM_NATIVO_ESRI = 17;

const URL_SATELITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const URL_NOMBRES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/** Teselas fallidas seguidas (sin ninguna buena) para dar el mapa por caído. */
const FALLAS_PARA_AVISAR = 3;
/** Si en 8 s no llegó ni una tesela, también se avisa (puede que ni den error). */
const ESPERA_MAXIMA_MS = 8000;

export default function Mapa() {
  const paso = useEntradas((s) => s.paso);

  // Contadores en refs (no en estado): cambian con cada tesela y no hace falta
  // redibujar por eso. Solo `sinConexion` es estado, porque cambia lo que se ve.
  const teselasOk = useRef(0);
  const teselasConError = useRef(0);
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (teselasOk.current === 0) setSinConexion(true);
    }, ESPERA_MAXIMA_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* El div #map lleva el CSS del prototipo (posición fija, paso 1 / paso 2).
          MapContainer no deja poner aria-label, por eso va en este envoltorio. */}
      <div id="map" aria-label="Mapa satelital">
        <MapContainer
          center={CENTRO_DEMO}
          zoom={15}
          minZoom={5}
          maxZoom={ZOOM_MAX}
          // Zoom en cuartos y rueda más suave: permite encuadrar el lote justo,
          // sin saltos de a un nivel entero (el doble de escala).
          zoomSnap={0.25}
          wheelPxPerZoomLevel={90}
          // El control por defecto se saca y se agrega abajo con su posición explícita.
          zoomControl={false}
          style={{ height: "100%", width: "100%", background: "inherit" }}
        >
          <TileLayer
            url={URL_SATELITE}
            maxZoom={ZOOM_MAX}
            maxNativeZoom={ZOOM_NATIVO_ESRI}
            // Guarda más teselas alrededor de la vista: al volar o mover el
            // lote se ven menos huecos negros.
            keepBuffer={4}
            attribution="Imagen © Esri, Maxar, Earthstar Geographics"
            eventHandlers={{
              tileload: () => {
                teselasOk.current++;
                setSinConexion(false);
              },
              tileerror: () => {
                teselasConError.current++;
                // Si alguna ya cargó, un error suelto no es "sin conexión".
                if (teselasOk.current === 0 && teselasConError.current >= FALLAS_PARA_AVISAR) {
                  setSinConexion(true);
                }
              },
            }}
          />
          {/* Nombres de localidades y rutas, semitransparentes sobre la imagen. */}
          <TileLayer
            url={URL_NOMBRES}
            maxZoom={ZOOM_MAX}
            maxNativeZoom={ZOOM_NATIVO_ESRI}
            opacity={0.85}
          />
          <ZoomControl position="topleft" />
          <Encuadre />
          <MarcaUbicacion />
        </MapContainer>
      </div>
      {/* En el paso 1 el mapa no se ve: el aviso solo taparía el formulario. */}
      <AvisoSinConexion visible={sinConexion && paso === "mapa"} />
    </>
  );
}
