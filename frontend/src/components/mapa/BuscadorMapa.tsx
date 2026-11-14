"use client";

/**
 * F4b · Buscador del mapa: la caja `.msearch` arriba a la izquierda del paso 2.
 * Sirve para saltar a otro lugar y después dibujar el lote ahí.
 *
 * Sale del bloque "Buscador del mapa" del prototipo final (prototipo-app.js):
 * `mSug` (lista), `mPick` (elegir sugerencia), `mGo` (ir al lugar), el keydown
 * de `#mq` (Enter) y el click en `document` que cierra la lista. El marcado es
 * el `<div class="msearch">` dentro de `.tools` en prototipo-body.html.
 *
 * Diferencias con el buscador del paso 1 (BuscadorLote):
 *   - Pegar coordenadas NO salta solo: se confirma con Enter (como `mGo`).
 *   - No cambia `modoLote`: el productor sigue en lo que estaba; el aviso le
 *     dice que toque «Dibujar mi lote» para marcarlo.
 *   - Sesga la búsqueda con el lugar actual (el prototipo usa el centro del mapa).
 *
 * Qué NO hace: no mueve el mapa ni pone la marca. Solo escribe `ubicacion`;
 * el mapa (Encuadre y MarcaUbicacion) reacciona a ese cambio en el paso 2.
 * Ese es el contrato entre el buscador y el mapa.
 */

import { useEffect, useId, useRef } from "react";
import ListaSugerencias from "@/components/comunes/ListaSugerencias";
import { MENSAJES_MAPA } from "@/lib/buscador";
import type { UbicacionElegida } from "@/lib/entradas";
import { useEntradas } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useBuscadorLugares } from "@/lib/useBuscadorLugares";

/**
 * Punto que sesga la búsqueda: el lugar ya elegido o, si no hay, el centro del
 * lote (promedio de sus esquinas, alcanza para sesgar). No hay acceso directo
 * al mapa desde acá (está fuera de <MapContainer>), así que se usa el estado.
 * Se lee con getState() en el momento del pedido, no en el render.
 */
function centroActual(): { lat: number; lng: number } {
  const { ubicacion, poligono } = useEntradas.getState();
  if (ubicacion) return { lat: ubicacion.lat, lng: ubicacion.lng };
  const n = poligono.length || 1;
  const lat = poligono.reduce((s, p) => s + p[0], 0) / n;
  const lng = poligono.reduce((s, p) => s + p[1], 0) / n;
  return { lat, lng };
}

export default function BuscadorMapa() {
  const paso = useEntradas((s) => s.paso);
  const inputRef = useRef<HTMLInputElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  /** Igual que `mGo`: guarda el lugar, saca el foco del input y avisa qué sigue. */
  function irAlLugar(u: UbicacionElegida) {
    // blur: en el celu cierra el teclado para que se vea el mapa volando.
    inputRef.current?.blur();
    useEntradas.getState().cambiar({ ubicacion: u });
    useToast
      .getState()
      .mostrar(`${u.etiqueta} · tocá «Dibujar mi lote» para marcarlo`);
  }

  const b = useBuscadorLugares({
    alElegir: irAlLugar,
    mensajes: MENSAJES_MAPA,
    coordenadasAlEscribir: false,
    centro: centroActual,
  });

  /*
   * Clic afuera cierra la lista (el listener de `document` del prototipo).
   * Se usa `pointerdown` y no `click` para que cierre también al empezar a
   * arrastrar el mapa. `b.cerrar` solo cambia estado, así que el efecto se
   * registra una vez por montaje leyendo la última versión desde un ref.
   */
  const cerrarRef = useRef(b.cerrar);
  cerrarRef.current = b.cerrar;
  useEffect(() => {
    const alTocar = (e: PointerEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) cerrarRef.current();
    };
    document.addEventListener("pointerdown", alTocar);
    return () => document.removeEventListener("pointerdown", alTocar);
  }, []);

  const idBase = useId();
  const idLista = `${idBase}-msug`;
  const idOpcion = (i: number) => `${idBase}-mop-${i}`;

  /*
   * Solo en el paso 2. En el paso 1 el CSS ya esconde `.tools` (opacidad 0),
   * pero el input seguiría recibiendo foco con Tab; sin montarlo, no.
   */
  if (paso !== "mapa") return null;

  return (
    <div className="msearch" ref={cajaRef}>
      <span className="qic" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Buscar un lugar o pegar coordenadas"
        aria-label="Buscar un lugar en el mapa"
        value={b.texto}
        onChange={(e) => b.alEscribir(e.target.value)}
        onKeyDown={b.alTeclear}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={b.listaVisible && b.sugerencias.length > 0}
        aria-controls={idLista}
        aria-activedescendant={
          b.activa >= 0 && b.listaVisible ? idOpcion(b.activa) : undefined
        }
      />
      <ListaSugerencias buscador={b} id={idLista} idOpcion={idOpcion} />
    </div>
  );
}
