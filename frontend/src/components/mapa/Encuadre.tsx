"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { ANCHO_CELU, ZOOM_LOTE, margenes, useEncuadre } from "@/lib/encuadre";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";

/**
 * Mueve la cámara del mapa. No dibuja nada: vive dentro de <MapContainer>
 * para poder usar `useMap()`.
 *
 * Sale de estas partes del prototipo (prototipo-app.js):
 * - `focus()` (~línea 374): encuadrar el lote dejando lugar al panel.
 * - el listener de `resize` (~línea 491): reencuadrar al cambiar la ventana.
 * - la parte del mapa de `goMap()` (~línea 377): volar al lote al pasar al paso 2.
 *   En el prototipo final el lote no se ve durante el vuelo: aparece con un
 *   fundido al llegar (`showLote` en `moveend`). Acá eso se avisa con el store
 *   `useMapa` (loteVisible / volando / marcaVisible / pedirDibujo).
 *
 * Por qué `invalidateSize()` antes de encuadrar: Leaflet guarda el tamaño del
 * contenedor. Si el CSS lo cambia (otra ventana, o en celu el mapa que pasa
 * de `display:none` a 52vh), Leaflet calcula mal el centro hasta que se lo avisamos.
 */

/** Recorte del lote actual, leído en el momento (no en el render) para no usar uno viejo. */
function limitesLote(aire = 0): L.LatLngBounds {
  return L.latLngBounds(useEntradas.getState().poligono).pad(aire);
}

/** Radio alrededor del lugar buscado al volar hasta él (toBounds(900) del prototipo). */
const METROS_UBICACION = 900;

export default function Encuadre() {
  const mapa = useMap();
  const paso = useEntradas((s) => s.paso);
  const ubicacion = useEntradas((s) => s.ubicacion);
  const pedido = useEncuadre((s) => s.pedido);

  /** focus() del prototipo: encuadra el lote (con aire opcional) sin animación. */
  const encuadrar = useRef((aire = 0) => {
    mapa.invalidateSize();
    mapa.fitBounds(limitesLote(aire), { ...margenes(), maxZoom: ZOOM_LOTE });
  });

  // Al cambiar el tamaño de la ventana: esperar 200 ms a que el usuario termine
  // de arrastrar (si no, se reencuadra decenas de veces por segundo).
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const alCambiarTamano = () => {
      clearTimeout(espera);
      espera = setTimeout(() => encuadrar.current(), 200);
    };
    window.addEventListener("resize", alCambiarTamano);
    return () => {
      window.removeEventListener("resize", alCambiarTamano);
      clearTimeout(espera);
    };
  }, []);

  // Pedidos que llegan desde el panel (por ejemplo, "Lote de ejemplo").
  useEffect(() => {
    if (pedido) encuadrar.current(pedido.aire);
  }, [pedido]);

  // Paso 1 → paso 2 (goMap del prototipo). Solo la parte del mapa: el botón y
  // la animación del panel (clase `morph`) los maneja PanelEntradas.
  const pasoAnterior = useRef(paso);
  useEffect(() => {
    const venia = pasoAnterior.current;
    pasoAnterior.current = paso;
    if (!(venia === "inicio" && paso === "mapa")) return;

    const { modoLote, ubicacion: lugar } = useEntradas.getState();
    const irAlLugar = modoLote === "dibujo" && lugar !== null;
    const { cambiarMapa, pedirDibujo } = useMapa.getState();
    const temporizadores: ReturnType<typeof setTimeout>[] = [];

    /**
     * Lo que pasa al LLEGAR (moveend del prototipo):
     * - con un lugar elegido para dibujar: aparece la marca del lugar y, 150 ms
     *   después, arranca el dibujo (startDraw). El lote de ejemplo queda oculto:
     *   está en Río Cuarto y el productor va a marcar el suyo en otro lado.
     * - si no: el lote aparece con fundido (CapaLote hace el fundido al ver
     *   `loteVisible` en true).
     */
    const alLlegar = (esperaDibujo: number) => {
      cambiarMapa({ volando: false });
      if (irAlLugar) {
        cambiarMapa({ marcaVisible: true });
        temporizadores.push(setTimeout(pedirDibujo, esperaDibujo));
      } else {
        cambiarMapa({ loteVisible: true });
      }
    };

    if (window.innerWidth <= ANCHO_CELU) {
      // Celu: el mapa recién aparece (estaba en display:none). 60 ms alcanzan
      // para que el navegador le dé tamaño; sin animación, porque el usuario
      // está viendo el panel y el vuelo no se apreciaría.
      temporizadores.push(
        setTimeout(() => {
          mapa.invalidateSize();
          if (irAlLugar) mapa.setView([lugar.lat, lugar.lng], 16);
          else encuadrar.current();
          // Sin vuelo no hay nada que esperar: se muestra todo ya (el dibujo
          // arranca a los 300 ms, como el prototipo en celu).
          alLlegar(300);
        }, 60),
      );
      return () => temporizadores.forEach(clearTimeout);
    }

    // Se escucha la llegada una sola vez. Se guarda la función para poder
    // sacarla si el componente se desmonta a mitad del vuelo.
    const llegada = () => alLlegar(150);

    // Compu: 350 ms = lo que tarda el panel en irse a la derecha; recién ahí
    // el mapa queda a la vista y el vuelo se ve entero.
    temporizadores.push(
      setTimeout(() => {
        mapa.invalidateSize();
        // El lote ya viene oculto desde el paso 1; se asegura por si acaso
        // (hideLote del prototipo, que se llama antes de cada vuelo).
        cambiarMapa({ loteVisible: false, marcaVisible: false, volando: true });
        if (irAlLugar) {
          // Va a donde dijo el buscador, a una escala en la que se ven los lotes.
          const destino = L.latLng(lugar.lat, lugar.lng).toBounds(METROS_UBICACION);
          mapa.flyToBounds(destino, { ...margenes(), maxZoom: 16.5, duration: 1.8, easeLinearity: 0.2 });
        } else {
          // Con modo "dibujo" y sin lugar elegido se deja más aire (1,2) para que
          // se vea la zona y no solo el rectángulo de ejemplo.
          const aire = modoLote === "dibujo" ? 1.2 : 0.3;
          mapa.flyToBounds(limitesLote(aire), {
            ...margenes(),
            maxZoom: ZOOM_LOTE,
            duration: 1.6,
            easeLinearity: 0.2,
          });
        }
        // `once` después de arrancar el vuelo: el moveend que llega es el del final del vuelo.
        mapa.once("moveend", llegada);
      }, 350),
    );
    return () => {
      temporizadores.forEach(clearTimeout);
      mapa.off("moveend", llegada);
    };
  }, [paso, mapa]);

  // Si el lugar elegido cambia estando ya en el mapa, se va hasta ahí.
  // (En el paso 1 no hace falta: el vuelo de arriba ya lo usa al pasar al mapa.)
  useEffect(() => {
    if (!ubicacion || useEntradas.getState().paso !== "mapa") return;
    const destino = L.latLng(ubicacion.lat, ubicacion.lng).toBounds(METROS_UBICACION);
    mapa.flyToBounds(destino, { ...margenes(), maxZoom: 16.5, duration: 1.2 });
    useMapa.getState().cambiarMapa({ marcaVisible: true });
  }, [ubicacion, mapa]);

  return null;
}
