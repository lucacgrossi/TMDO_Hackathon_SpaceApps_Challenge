"use client";

import L from "leaflet";
import { useEffect, useState } from "react";
import { Marker, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import { useDibujo } from "@/lib/dibujo";
import { useMapa } from "@/lib/mapa";
import estilos from "./CapaDibujo.module.css";

/**
 * F5 · Lo que se ve en el mapa mientras se dibuja el lote: la línea punteada
 * que une las esquinas, el relleno de prueba y las esquinas que se arrastran.
 *
 * Sale de `addVertex`, `vertexMark` y la parte de mapa de `startDraw`/`endDraw`
 * del prototipo (prototipo-app.js ~líneas 89-104). El estado (puntos, reglas)
 * está en `lib/dibujo.ts`; la barra con los botones, en `BarraDibujo.tsx`.
 *
 * Vive dentro de <MapContainer> (usa `useMap`).
 */

/** Tocar a menos de 14 px de la primera esquina cierra el lote (en vez de sumar otra). */
const RADIO_CIERRE_PX = 14;

/**
 * Color del trazo, leído del CSS en el momento: blanco (`--papel`) para que se
 * vea sobre cualquier imagen satelital (el verde `--hoja` se pierde en los
 * lotes), con el relleno en `--hoja-brillo`.
 */
function colorCss(token: string, porDefecto: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || porDefecto;
}

// Esquinas pixel (DESIGN.md, S1): cuadrados de 10 px. La primera va rellena:
// es la que se toca para cerrar el lote.
const iconoEsquina = L.divIcon({
  className: "",
  html: `<div class="${estilos.esquina}"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});
const iconoPrimera = L.divIcon({
  className: "",
  html: `<div class="${estilos.esquina} ${estilos.primera}"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export default function CapaDibujo() {
  const mapa = useMap();
  const dibujando = useDibujo((s) => s.dibujando);
  const puntos = useDibujo((s) => s.puntos);
  const pedidoDibujo = useMapa((s) => s.pedidoDibujo);
  /** Dónde está el mouse: de la última esquina hasta acá va el tramo punteado. */
  const [cursor, setCursor] = useState<L.LatLng | null>(null);

  // Arranca el dibujo cuando lo pide Encuadre (al llegar al lugar elegido en
  // el paso 2). El 0 inicial no es un pedido.
  useEffect(() => {
    if (pedidoDibujo > 0) useDibujo.getState().iniciar(null);
  }, [pedidoDibujo]);

  // Cursor en cruz mientras se dibuja (clase `drawing` del CSS del prototipo).
  // Se toca la clase del contenedor de Leaflet porque ese div lo crea Leaflet, no React.
  useEffect(() => {
    const contenedor = mapa.getContainer();
    contenedor.classList.toggle("drawing", dibujando);
    return () => contenedor.classList.remove("drawing");
  }, [mapa, dibujando]);

  // Atajos de teclado del prototipo: Escape cancela, Enter cierra, Backspace o
  // "z" deshacen (salvo que se esté escribiendo en un campo).
  useEffect(() => {
    if (!dibujando) return;
    const alTeclear = (e: KeyboardEvent) => {
      const d = useDibujo.getState();
      const escribiendo = /INPUT|SELECT|TEXTAREA/.test((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if (e.key === "Escape") d.cancelar();
      else if (e.key === "Enter" && !escribiendo) d.terminar();
      else if ((e.key === "Backspace" || e.key === "z") && !escribiendo) d.deshacer();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [dibujando]);

  // addVertex: cada toque suma una esquina; cerca de la primera, cierra.
  useMapEvents({
    mousemove: (e) => {
      // Solo el tramo al cursor se redibuja: es un estado local de esta capa.
      if (useDibujo.getState().dibujando) setCursor(e.latlng);
    },
    mouseout: () => setCursor(null),
    click: (e) => {
      const d = useDibujo.getState();
      if (!d.dibujando) return;
      if (d.puntos.length >= 3) {
        const primera = mapa.latLngToContainerPoint(d.puntos[0]);
        if (primera.distanceTo(e.containerPoint) < RADIO_CIERRE_PX) {
          d.terminar();
          return;
        }
      }
      d.agregar([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!dibujando) return null;

  const color = colorCss("--papel", "#FFFFFF");
  const relleno = colorCss("--hoja-brillo", "#4CAF50");
  const ultima = puntos[puntos.length - 1];
  return (
    <>
      {/* Relleno de prueba: aparece con 3 esquinas, para ver la forma que va a quedar. */}
      <Polygon
        positions={puntos.length >= 3 ? puntos : []}
        pathOptions={{ stroke: false, fillColor: relleno, fillOpacity: 0.25 }}
        interactive={false}
      />
      <Polyline positions={puntos} pathOptions={{ color, weight: 2 }} interactive={false} />
      {/* Tramo hacia el cursor, punteado: dónde caería la próxima esquina. */}
      {ultima && cursor && (
        <Polyline
          positions={[ultima, cursor]}
          pathOptions={{ color, weight: 2, dashArray: "4 4", opacity: 0.9 }}
          interactive={false}
        />
      )}
      {puntos.map((p, i) => (
        <Marker
          // La clave es la posición en la lista: deshacer saca siempre la última.
          key={i}
          position={p}
          icon={i === 0 ? iconoPrimera : iconoEsquina}
          draggable
          autoPan
          keyboard={false}
          // Sin esto, tocar una esquina también llegaría al mapa y sumaría otra.
          bubblingMouseEvents={false}
          title={i === 0 ? "Tocá para cerrar o arrastrá para mover" : "Arrastrá para mover"}
          eventHandlers={{
            drag: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              useDibujo.getState().mover(i, [ll.lat, ll.lng]);
            },
            dragstart: () => useDibujo.getState().setArrastrando(true),
            // 50 ms después de soltar: el click que manda el navegador al soltar
            // llega antes y así se ignora (ver `arrastrando` en lib/dibujo.ts).
            dragend: () => setTimeout(() => useDibujo.getState().setArrastrando(false), 50),
            click: () => {
              if (i === 0 && !useDibujo.getState().arrastrando) useDibujo.getState().terminar();
            },
          }}
        />
      ))}
    </>
  );
}
