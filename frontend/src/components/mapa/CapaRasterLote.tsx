"use client";

import { useMemo, useState } from "react";
import { ImageOverlay, Tooltip, useMapEvents } from "react-leaflet";
import { type CapaRaster, decodificarValores, urlImagen, valorEn } from "@/lib/capaRaster";
import { formatoNumero } from "@/lib/geo";

/**
 * Capa raster genérica del lote (ver `lib/capaRaster.ts`): dibuja el PNG que
 * manda el backend sobre sus `bounds` y, al pasar el mouse, muestra el valor
 * del píxel con su unidad (RF18).
 *
 * `className="px"` activa `image-rendering: pixelated` (globals.css): se ven
 * los píxeles de ~30 m a propósito, porque es la escala real del dato.
 *
 * No calcula nada: si `capa` es null no dibuja nada y la leyenda dice por qué.
 * Por ahora la usa la capa de pendiente; NDVI, erosión y cultivo la van a usar
 * cuando lleguen del backend.
 */
export default function CapaRasterLote({ capa, opacidad = 0.85 }: { capa: CapaRaster | null; opacidad?: number }) {
  // Se decodifica una vez por capa, no en cada movimiento del mouse.
  const valores = useMemo(() => (capa ? decodificarValores(capa.valores) : null), [capa]);
  const [lectura, setLectura] = useState<{ lat: number; lng: number; valor: number } | null>(null);

  useMapEvents({
    mousemove(e) {
      if (!capa || !valores) return;
      const v = valorEn(capa, e.latlng.lat, e.latlng.lng, valores);
      setLectura(v == null ? null : { lat: e.latlng.lat, lng: e.latlng.lng, valor: v });
    },
    mouseout() {
      setLectura(null);
    },
  });

  if (!capa) return null;
  return (
    <ImageOverlay url={urlImagen(capa)} bounds={capa.bounds} opacity={opacidad} className="px" interactive={false}>
      {lectura && (
        // Tooltip suelto en el punto del mouse: "2,4 %"
        <Tooltip position={[lectura.lat, lectura.lng]} permanent direction="top" offset={[0, -8]}>
          {formatoNumero(lectura.valor, 1)} {capa.unidad}
        </Tooltip>
      )}
    </ImageOverlay>
  );
}
