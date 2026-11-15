"use client";

import L from "leaflet";
import { useRef } from "react";
import { Marker } from "react-leaflet";
import { useApp } from "@/lib/app";
import { evaluar, textosBarra } from "@/lib/dibujo";
import type { LatLng } from "@/lib/entradas";
import { formatoNumero } from "@/lib/geo";
import { useEntradas } from "@/lib/store";
import { useToast } from "@/lib/toast";
import estilos from "./CapaDibujo.module.css";

/**
 * Esquinas del lote ya marcado, arrastrables en S2 (panel de entradas): para
 * ajustar el borde con precisión sin volver a dibujarlo. Mientras se arrastra,
 * el polígono de `useEntradas` se actualiza en vivo (CapaLote lo redibuja con
 * su superficie). Al soltar se valida con las mismas reglas que el dibujo
 * (`evaluar`: 1 a 20.000 ha, sin líneas cruzadas); si no cumple, la esquina
 * vuelve a donde estaba y un aviso dice por qué.
 *
 * Vive dentro de <MapContainer>. En S1 las esquinas las maneja CapaDibujo.
 */

const icono = L.divIcon({
  className: "",
  html: `<div class="${estilos.esquina}"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export default function EsquinasLote() {
  const configurando = useApp((s) => s.etapa === "configurar");
  const poligono = useEntradas((s) => s.poligono);
  /** El polígono antes de empezar a arrastrar, para volver atrás si queda inválido. */
  const antes = useRef<LatLng[] | null>(null);

  if (!configurando || poligono.length < 3) return null;

  const mover = (i: number, ll: L.LatLng) => {
    const actual = useEntradas.getState().poligono;
    useEntradas.getState().cambiar({ poligono: actual.map((p, j) => (j === i ? ([ll.lat, ll.lng] as LatLng) : p)) });
  };

  const soltar = () => {
    const nuevo = useEntradas.getState().poligono;
    const previo = antes.current;
    antes.current = null;
    const { valido, ha } = evaluar(nuevo);
    if (valido) {
      useToast.getState().mostrar(`Lote ajustado: ${formatoNumero(ha, 1)} ha`);
      return;
    }
    // Inválido: se deshace el arrastre y se explica con el mismo texto que la barra de dibujo.
    if (previo) useEntradas.getState().cambiar({ poligono: previo });
    useToast.getState().mostrar(textosBarra(nuevo).ayuda);
  };

  return (
    <>
      {poligono.map((p, i) => (
        <Marker
          key={i}
          position={p}
          icon={icono}
          draggable
          autoPan
          keyboard={false}
          bubblingMouseEvents={false}
          title="Arrastrá para ajustar el borde del lote"
          eventHandlers={{
            dragstart: () => {
              antes.current = useEntradas.getState().poligono.map((q) => [...q] as LatLng);
            },
            drag: (e) => mover(i, (e.target as L.Marker).getLatLng()),
            dragend: soltar,
          }}
        />
      ))}
    </>
  );
}
