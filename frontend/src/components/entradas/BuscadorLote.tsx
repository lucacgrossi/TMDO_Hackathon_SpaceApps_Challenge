"use client";

/**
 * F4 · "¿Dónde está tu lote?": buscador de lugares (Esri), coordenadas o links
 * de Google Maps pegados, y el GPS del celu.
 *
 * Sale del prototipo final (prototipo-app.js): el listener de `#q` (escribir),
 * `showSug` (lista de sugerencias), `pickSug` (elegir una), el listener de
 * `#geo` (GPS) y `setTarget` (guardar el punto y mostrar "Tu lote está acá").
 * El marcado es el bloque `.where` de prototipo-body.html.
 *
 * Qué NO hace: no dibuja nada en el mapa. Solo escribe `ubicacion` (y
 * `modoLote: "dibujo"`) en el store compartido; el mapa la lee y pone la marca.
 * Vive en la caja de S1 (PantallaMarcar), arriba de "Probar con el lote de ejemplo".
 *
 * La búsqueda (debounce, Esri, teclado) está en el hook compartido
 * `src/lib/useBuscadorLugares.ts`, que también usa el buscador del mapa; la
 * lógica sin React (regex, llamadas a Esri, mensajes) está en `src/lib/buscador.ts`.
 */

import { useId, useState } from "react";
import Boton from "@/components/comunes/Boton";
import ListaSugerencias from "@/components/comunes/ListaSugerencias";
import { MENSAJES, fmt } from "@/lib/buscador";
import type { UbicacionElegida } from "@/lib/entradas";
import { useEntradas } from "@/lib/store";
import { useBuscadorLugares } from "@/lib/useBuscadorLugares";
import estilos from "./BuscadorLote.module.css";

export default function BuscadorLote() {
  const ubicacion = useEntradas((s) => s.ubicacion);
  const cambiar = useEntradas((s) => s.cambiar);
  const [buscandoGps, setBuscandoGps] = useState(false);

  /**
   * Igual que `setTarget`: guarda el punto. Elegir un lugar implica que el
   * productor va a marcar SU lote, así que el modo pasa a "dibujo" (el
   * prototipo hace `S.entry="draw"` y apaga el radio del ejemplo). Se escribe
   * todo en un solo `cambiar` para que nadie lea un estado a medias.
   */
  function guardar(u: UbicacionElegida) {
    cambiar({ ubicacion: u, modoLote: "dibujo" });
  }

  const b = useBuscadorLugares({
    alElegir: guardar,
    mensajes: MENSAJES,
    // En el paso 1, pegar coordenadas o un link ya ubica el lote (listener de `#q`).
    coordenadasAlEscribir: true,
  });

  // Ids para unir el input con la lista (accesibilidad: aria-controls y aria-activedescendant).
  const idBase = useId();
  const idLista = `${idBase}-sug`;
  const idOpcion = (i: number) => `${idBase}-op-${i}`;

  /** Listener de `#geo`: pide el GPS del navegador. */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      b.mostrarMensaje(MENSAJES.sinGeo);
      return;
    }
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBuscandoGps(false);
        b.elegir({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          etiqueta: "tu ubicación actual",
          precisionM: p.coords.accuracy,
        });
      },
      () => {
        setBuscandoGps(false);
        b.mostrarMensaje(MENSAJES.gpsFallo);
      },
      // Alta precisión: en el campo importa la del GPS, no la de la antena. 12 s y se rinde.
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className={estilos.buscador}>
      <label className={estilos.etiqueta} htmlFor={`${idBase}-q`}>
        Buscá dónde está
      </label>
      <div className={estilos.campo}>
        {/* Lupa decorativa: aria-hidden para que el lector de pantalla no lea "⌕". */}
        <span className={estilos.lupa} aria-hidden="true">
          ⌕
        </span>
        <input
          id={`${idBase}-q`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Lugar, coordenadas o link de Google Maps"
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
      </div>

      <ListaSugerencias buscador={b} id={idLista} idOpcion={idOpcion} />

      {ubicacion && (
        <p className={estilos.elegido}>
          <b>Tu lote está acá:</b> {ubicacion.etiqueta}
          {ubicacion.precisionM ? <small> (± {fmt(ubicacion.precisionM)} m)</small> : null}
        </p>
      )}

      <Boton variante="fantasma" onClick={usarMiUbicacion} disabled={buscandoGps} className={estilos.gps}>
        {buscandoGps ? "Buscando tu ubicación…" : "Usar mi ubicación"}
      </Boton>
    </div>
  );
}
