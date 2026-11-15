"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { margenes } from "@/lib/encuadre";
import { centro } from "@/lib/geo";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";
import { celdaPower } from "@/lib/zonaClima";

/**
 * F9 · Al cambiar de capa, la cámara va a la escala de esa capa.
 * Es la parte de cámara de `setLayer()` del prototipo final (prototipo-app.js ~líneas 335-342):
 * - Vegetación: el lote con 35 % de aire, zoom 16 como máximo (se ven los vecinos para comparar).
 * - Pendiente y Vista aérea: el lote justo, zoom 17.
 * - Lluvia y heladas: toda la celda de ~50 km de POWER, zoom 12, para ver qué tan grande es la zona del dato.
 *
 * Solo reacciona a CAMBIOS de capa (no al montar): al abrir la app la cámara
 * la maneja Encuadre con el vuelo al lote.
 */

/** Zoom máximo general del mapa (el mismo ZOOM_MAX de Mapa.tsx). La capa NDVI lo baja a 16 o 17. */
const ZOOM_MAX_MAPA = 18;

export default function EncuadreCapa() {
  const mapa = useMap();
  const capa = useMapa((s) => s.capa);
  const anterior = useRef(capa);

  useEffect(() => {
    if (anterior.current === capa) return;
    anterior.current = capa;
    // Al salir de Vegetación se devuelve el zoom máximo normal.
    if (capa !== "ndvi") mapa.setMaxZoom(ZOOM_MAX_MAPA);

    const poligono = useEntradas.getState().poligono;
    if (poligono.length < 3) return;
    const lote = L.latLngBounds(poligono);
    const ir = (limites: L.LatLngBounds, maxZoom: number) => {
      mapa.invalidateSize();
      mapa.fitBounds(limites, { ...margenes(), maxZoom });
    };
    if (capa === "ndvi") ir(lote.pad(0.35), 16);
    else if (capa === "clima") ir(L.latLngBounds(celdaPower(centro(poligono))).extend(lote.pad(4)), 12);
    else ir(lote, 17);
  }, [capa, mapa]);

  return null;
}
