"use client";

import { useEffect } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { useCapas } from "@/lib/capas";
import { useMapa } from "@/lib/mapa";
import {
  anioCampania,
  buscarEscenaHls,
  camp0De,
  HLS_EXPR,
  HLS_SENSOR,
  promedioHls,
  urlTeselasHls,
  urlTeselasModis,
} from "@/lib/ndvi";
import { useSalidaDelLote } from "@/lib/resultado";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";

/**
 * F9 · Capa "Vegetación": NDVI del mes elegido en la línea de tiempo.
 * Sale de `setNdvi()` y `clearNdvi()` del prototipo final (prototipo-app.js ~líneas 193-205).
 *
 * Cada vez que cambia el mes o el lote (y la capa está activa):
 * 1. Se busca la escena de NASA HLS (30 m) con menos nubes de ese mes.
 * 2. Si hay, se pintan sus teselas y se calcula el NDVI medio del lote para la leyenda.
 *    El zoom máximo baja a 17: más cerca, un píxel de 30 m ya tapa media pantalla.
 * 3. Si no hay (o Planetary Computer no responde), se usa MODIS 250 m de
 *    NASA GIBS y el zoom máximo baja a 16 por lo mismo.
 * Lo que se eligió queda en `useCapas.ndvi` para que la leyenda lo cuente.
 *
 * Con la respuesta del back para este lote (`useSalidaDelLote`), la escena es la
 * del back (`capas.ndvi_mensual[mes]`), la marca "Lote" es
 * `visto_por_satelite.meses[mes].ndvi_medio` y la campaña es la de la API: el
 * mapa y la tabla muestran lo mismo. Sin respuesta (antes de comparar o con el
 * mock) sigue la búsqueda propia de arriba.
 *
 * `className="px"`: el CSS del prototipo dibuja los píxeles sin suavizar
 * (image-rendering: pixelated). Se ven los cuadrados a propósito: es la
 * escala real del dato (principio "técnico por defecto").
 */
export default function CapaNdvi() {
  const mapa = useMap();
  const activa = useMapa((s) => s.capa === "ndvi");
  const mes = useVista((s) => s.mes);
  const poligono = useEntradas((s) => s.poligono);
  const ndvi = useCapas((s) => s.ndvi);
  const salida = useSalidaDelLote();
  const camp0 = camp0De(salida?.visto_por_satelite.campana);

  useEffect(() => {
    if (!activa) return;
    const { cambiarCapas } = useCapas.getState();
    // `vigente` hace de `ndviToken` del prototipo: si el usuario ya pasó a
    // otro mes (o a otra capa) antes de que llegue la respuesta, se descarta.
    if (salida) {
      const escena = salida.capas.ndvi_mensual[mes];
      const visto = salida.visto_por_satelite.meses[mes];
      if (escena && escena.coleccion in HLS_EXPR) {
        cambiarCapas({
          ndvi: {
            tipo: "hls",
            coleccion: escena.coleccion,
            id: escena.item,
            fecha: escena.fecha,
            nubes: visto?.nubes_escena ?? null,
            media: visto?.ndvi_medio ?? null,
          },
        });
        mapa.setMaxZoom(17);
      } else {
        cambiarCapas({ ndvi: { tipo: "modis", anio: anioCampania(mes, camp0) } });
        mapa.setMaxZoom(16);
      }
      return;
    }
    let vigente = true;
    (async () => {
      let escena = null;
      try {
        escena = await buscarEscenaHls(poligono, mes);
      } catch {
        escena = null; // sin respuesta de Planetary Computer: respaldo MODIS
      }
      if (!vigente) return;
      if (escena) {
        const base = { tipo: "hls" as const, ...escena, media: null };
        cambiarCapas({ ndvi: base });
        mapa.setMaxZoom(17);
        try {
          const media = await promedioHls(escena, poligono);
          if (vigente) cambiarCapas({ ndvi: { ...base, media } });
        } catch {
          // Sin promedio la leyenda muestra la escala sin la marca "Lote".
        }
      } else {
        cambiarCapas({ ndvi: { tipo: "modis", anio: anioCampania(mes) } });
        mapa.setMaxZoom(16);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [activa, mes, poligono, mapa, salida, camp0]);

  if (!activa || !ndvi) return null;

  if (ndvi.tipo === "hls") {
    return (
      <TileLayer
        // `key` distinta por fuente: al pasar de MODIS a HLS se crea otra capa
        // (cambian opacidad y zooms, que Leaflet no actualiza en caliente).
        key="hls"
        url={urlTeselasHls(ndvi)}
        minZoom={9}
        maxNativeZoom={16}
        maxZoom={18}
        opacity={0.85}
        className="px"
        keepBuffer={4}
        attribution={`NDVI: NASA HLS (${HLS_SENSOR[ndvi.coleccion] ?? ndvi.coleccion}) vía Microsoft Planetary Computer`}
      />
    );
  }
  return (
    <TileLayer
      key="modis"
      url={urlTeselasModis(mes, camp0)}
      // GIBS solo tiene MODIS NDVI hasta el nivel 9 (~250 m por píxel).
      maxNativeZoom={9}
      maxZoom={18}
      opacity={0.72}
      className="px"
      keepBuffer={4}
      attribution="NDVI: NASA GIBS · MODIS Terra"
    />
  );
}
