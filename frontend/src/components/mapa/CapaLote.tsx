"use client";

import L from "leaflet";
import { useCallback, useEffect, useState } from "react";
import { Marker, Polygon, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useDibujo } from "@/lib/dibujo";
import { useEncuadre } from "@/lib/encuadre";
import { areaHa, centro, formatoNumero, moverPoligono } from "@/lib/geo";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";

/**
 * F3 · El lote en el mapa: el polígono blanco, su etiqueta "Lote · 95 ha" y
 * el punto (`.pin`) que lo marca cuando se ve muy chico.
 *
 * Sale de estas partes del prototipo (prototipo-app.js):
 * - `loteLayer` y su `bindTooltip` (~línea 56): polígono blanco con 8 % de relleno.
 * - `pin` y `lotePin()` (~líneas 58-62): el punto aparece cuando el lote mide
 *   menos de 28 px en pantalla (zoom alejado) y al tocarlo encuadra el lote.
 * - el `map.on("click")` (~línea 71): tocar el mapa mueve el lote entero ahí,
 *   sin cambiarle la forma.
 * - `showLote()` (~línea 376): fundido de entrada al llegar al lote.
 *
 * Vive dentro de <MapContainer> (usa `useMap`). El polígono sale de
 * `useEntradas.poligono`; si es visible o no, de `useMapa.loteVisible`.
 */

/** Opacidad del relleno con el lote a la vista (fillOpacity .08 del prototipo). */
const RELLENO = 0.08;
/** Cuánto sube la opacidad en cada cuadro del fundido (k += .12 → ~9 cuadros, 150 ms). */
const PASO_FUNDIDO = 0.12;
/** Debajo de este tamaño en pantalla (px) el lote es un punto: se muestra el pin. */
const LADO_MINIMO_PX = 28;

// Ícono del pin con la clase `.pin` del prototipo. Se crea una sola vez.
const iconoPin = L.divIcon({
  className: "",
  html: '<div class="pin"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function CapaLote() {
  const mapa = useMap();
  const poligono = useEntradas((s) => s.poligono);
  const paso = useEntradas((s) => s.paso);
  const cambiar = useEntradas((s) => s.cambiar);
  const loteVisible = useMapa((s) => s.loteVisible);
  // Mientras se dibuja, el lote anterior queda de fondo, tenue (startDraw del prototipo).
  const dibujando = useDibujo((s) => s.dibujando);

  // Opacidad actual del borde (0 a 1). El relleno va en proporción.
  const [opacidad, setOpacidad] = useState(0);
  const [pinVisible, setPinVisible] = useState(false);

  // Fundido (showLote): al pasar a visible sube de a 0,12 por cuadro con
  // requestAnimationFrame; al ocultarse (hideLote) se apaga de golpe, porque
  // se oculta justo antes de un vuelo y no tiene que verse.
  useEffect(() => {
    if (!loteVisible) {
      setOpacidad(0);
      return;
    }
    // Con "reducir movimiento" activado en el sistema, sin animación.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpacidad(1);
      return;
    }
    let k = 0;
    let cuadro = 0;
    const avanzar = () => {
      k = Math.min(1, k + PASO_FUNDIDO);
      setOpacidad(k);
      if (k < 1) cuadro = requestAnimationFrame(avanzar);
    };
    cuadro = requestAnimationFrame(avanzar);
    return () => cancelAnimationFrame(cuadro);
  }, [loteVisible]);

  // Etiqueta y pin solo con el lote entero a la vista y sin dibujo en curso
  // (lotePin del prototipo saca el pin si DRAW.on).
  const visibleDelTodo = opacidad >= 1 && !dibujando;

  // lotePin(): ¿el lote se ve como un punto en pantalla? Se mide su recuadro
  // en píxeles de la pantalla; si el lado más corto mide menos de 28 px, pin.
  const medirPin = useCallback(() => {
    const limites = L.latLngBounds(poligono);
    const a = mapa.latLngToContainerPoint(limites.getNorthWest());
    const z = mapa.latLngToContainerPoint(limites.getSouthEast());
    setPinVisible(Math.min(Math.abs(z.x - a.x), Math.abs(z.y - a.y)) < LADO_MINIMO_PX);
  }, [mapa, poligono]);

  useEffect(medirPin, [medirPin]);

  useMapEvents({
    zoomend: medirPin,
    moveend: medirPin,
    // Tocar el mapa mueve el lote (con su forma) al punto tocado. Solo en el
    // paso 2: en el paso 1 el mapa está tapado por el formulario.
    click: (e) => {
      if (useEntradas.getState().paso !== "mapa") return;
      // Dibujando, el toque marca una esquina (lo atiende CapaDibujo), no mueve el lote.
      if (useDibujo.getState().dibujando) return;
      cambiar({ poligono: moverPoligono(poligono, [e.latlng.lat, e.latlng.lng]) });
    },
  });

  if (paso !== "mapa") return null;

  const ha = areaHa(poligono);
  return (
    <>
      <Polygon
        positions={poligono}
        pathOptions={
          dibujando
            ? { color: "#fff", weight: 3, fillColor: "#fff", opacity: 0.25, fillOpacity: 0 }
            : { color: "#fff", weight: 3, fillColor: "#fff", opacity: opacidad, fillOpacity: RELLENO * opacidad }
        }
      >
        {/* La etiqueta aparece recién cuando terminó el fundido (openTooltip en showLote).
            `key` con la superficie: Leaflet no reacomoda una etiqueta permanente al
            cambiar el texto, así que se vuelve a crear. */}
        {visibleDelTodo && (
          <Tooltip key={ha.toFixed(0)} permanent direction="top" className="lotelabel" offset={[0, -6]}>
            Lote · {formatoNumero(ha)} ha
          </Tooltip>
        )}
      </Polygon>
      {visibleDelTodo && pinVisible && (
        <Marker
          position={centro(poligono)}
          icon={iconoPin}
          keyboard={false}
          title="Ir al lote"
          // Si el click llegara al mapa, además de encuadrar movería el lote al pin.
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => useEncuadre.getState().pedirEncuadre() }}
        />
      )}
    </>
  );
}
