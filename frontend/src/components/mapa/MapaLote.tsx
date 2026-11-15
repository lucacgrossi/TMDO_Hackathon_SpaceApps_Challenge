"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { ImageOverlay, MapContainer, Polygon, Rectangle, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { pixelEn, urlImagen } from "@/lib/capaRaster";
import { boundsCelda, boundsPixel, dibujoNdvi, type IdCapaLote, rasterDeCapa } from "@/lib/capasLote";
import type { Bounds, Salida } from "@/lib/contrato";
import type { LatLng } from "@/lib/entradas";
import css from "./MapaLote.module.css";

/**
 * Mapa de la sección Mapa del dashboard (S4). Solo dibuja lo que manda el back:
 * - Base Esri (maxNativeZoom 17, maxZoom 18, minZoom 5: frontend/CLAUDE.md).
 * - La capa elegida como `ImageOverlay` pixelado sobre sus `bounds`; el NDVI
 *   sin raster va por teselas (escena del back en Planetary Computer o GIBS).
 * - La celda de NASA POWER con `clima_celda.bbox` ([oeste, sur, este, norte]).
 * - El contorno del lote y el recuadro del píxel del inspector.
 *
 * Solo en el navegador (Leaflet usa `window`): se importa con `dynamic`.
 * El píxel elegido vive afuera (SeccionMapa) para que el inspector y las
 * flechas del teclado lo compartan.
 */

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export interface Pixel {
  fila: number;
  columna: number;
}

interface Props {
  salida: Salida;
  capa: IdCapaLote;
  mes: number;
  poligono: LatLng[];
  pixel: Pixel | null;
  onPixel: (p: Pixel | null) => void;
}

/** Al cambiar de capa, la cámara va a su escala: el lote, o la celda de ~50 km. */
function Encuadre({ capa, lote, celda }: { capa: IdCapaLote; lote: L.LatLngBounds; celda: Bounds }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.invalidateSize();
    // latLngBounds nuevo: extend() modifica el objeto.
    if (capa === "celda") mapa.fitBounds(L.latLngBounds(celda).extend(lote), { padding: [24, 24], maxZoom: 12 });
    else mapa.fitBounds(lote.pad(0.25), { maxZoom: 17 });
  }, [capa, mapa, lote, celda]);
  return null;
}

/** Lee el píxel bajo el mouse en la capa raster activa. */
function LecturaMouse({ capaRaster, onPixel }: { capaRaster: ReturnType<typeof rasterDeCapa>; onPixel: Props["onPixel"] }) {
  useMapEvents({
    mousemove(e) {
      if (!capaRaster?.valores) return;
      onPixel(pixelEn(capaRaster, e.latlng.lat, e.latlng.lng));
    },
    mouseout() {
      onPixel(null);
    },
  });
  return null;
}

export default function MapaLote({ salida, capa, mes, poligono, pixel, onPixel }: Props) {
  const lote = useMemo(() => L.latLngBounds(poligono), [poligono]);
  const celdaB = useMemo(() => boundsCelda(salida.clima_celda.bbox), [salida.clima_celda.bbox]);

  const ndvi = capa === "ndvi" ? dibujoNdvi(salida, mes) : null;
  const raster = ndvi ? (ndvi.tipo === "raster" ? ndvi.capa : null) : rasterDeCapa(salida, capa, mes);

  return (
    <MapContainer
      bounds={lote.pad(0.25)}
      minZoom={5}
      maxZoom={18}
      zoomSnap={0.25}
      zoomControl={false}
      // Las flechas leen píxeles (las maneja SeccionMapa), no mueven el mapa.
      keyboard={false}
      className={css.mapa}
    >
      <TileLayer url={ESRI} maxZoom={18} maxNativeZoom={17} keepBuffer={4} attribution="Imagen © Esri, Maxar, Earthstar Geographics" />
      <ZoomControl position="bottomright" />
      <Encuadre capa={capa} lote={lote} celda={celdaB} />
      <LecturaMouse capaRaster={raster} onPixel={onPixel} />

      {raster && (
        // `key` por capa y mes: al cambiar, se crea la imagen nueva con un fundido de 0,2 s.
        <ImageOverlay
          key={`${capa}-${mes}`}
          url={urlImagen(raster)}
          bounds={raster.bounds}
          opacity={0.9}
          className={css.px}
          interactive={false}
          alt={raster.titulo}
        />
      )}
      {ndvi?.tipo === "hls" && (
        <TileLayer
          key={ndvi.url}
          url={ndvi.url}
          minZoom={9}
          maxNativeZoom={16}
          maxZoom={18}
          opacity={0.85}
          className={css.px}
          attribution="NDVI: NASA HLS vía Microsoft Planetary Computer"
        />
      )}
      {ndvi?.tipo === "gibs" && (
        <TileLayer
          key={ndvi.url}
          url={ndvi.url}
          // GIBS tiene MODIS NDVI hasta el nivel 9 (~250 m por píxel): se ve el píxel real.
          maxNativeZoom={9}
          maxZoom={18}
          opacity={0.75}
          className={css.px}
          attribution="NDVI: NASA GIBS · MODIS Terra"
        />
      )}

      {capa === "celda" && (
        <Rectangle bounds={celdaB} pathOptions={{ className: css.celda, weight: 2, dashArray: "4 6", fillOpacity: 0.08 }} interactive={false}>
          <Tooltip permanent direction="center" className={css.rotulo}>
            Celda de NASA POWER ({salida.clima_celda.resolucion}): el lote está {salida.clima_celda.posicion_lote}
          </Tooltip>
        </Rectangle>
      )}

      <Polygon positions={poligono} pathOptions={{ className: css.lote, weight: 2, fillOpacity: 0 }} interactive={false} />

      {raster && pixel && (
        <Rectangle
          bounds={boundsPixel(raster, pixel.fila, pixel.columna)}
          pathOptions={{ className: css.pixel, weight: 2, fillOpacity: 0 }}
          interactive={false}
        />
      )}
    </MapContainer>
  );
}
