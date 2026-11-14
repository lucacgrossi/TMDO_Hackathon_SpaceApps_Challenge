"use client";

/**
 * F4 · Paso 1, "¿Dónde está tu lote?": el bloque `.entry` del prototipo final.
 *
 * Sale de prototipo-body.html (el `<div class="entry">`) y de `setEntry` en
 * prototipo-app.js. En el prototipo final el paso 1 tiene dos caminos:
 *   1. Arriba, siempre visible, el buscador (`.where` → <BuscadorLote/>).
 *      Elegir un lugar pone `modoLote: "dibujo"` (eso lo hace BuscadorLote).
 *   2. Abajo, después del separador "o", UNA sola opción: "Probar con el lote
 *      de ejemplo" (`.opts.one`). Tocarla vuelve al lote de Río Cuarto.
 *
 * Solo se ve en el paso 1: el CSS muestra `.entry` únicamente con `body.onb`.
 * El botón de abajo (BotonPrincipal) lee `modoLote` y `ubicacion` para decidir
 * su texto; acá no se toca.
 */

import { useEntradas } from "@/lib/store";
import BuscadorLote from "./BuscadorLote";

export default function ElegirLote() {
  const modoLote = useEntradas((s) => s.modoLote);
  const cambiar = useEntradas((s) => s.cambiar);

  /*
   * Igual que `setEntry("demo")` en el paso 1: marca el ejemplo y borra el lugar
   * buscado, así el mapa no queda apuntando a un punto que ya no vale y el
   * botón vuelve a "Ver el lote de ejemplo en el mapa".
   */
  function usarEjemplo() {
    cambiar({ modoLote: "demo", ubicacion: null });
  }

  return (
    <div className="entry" data-a="ent">
      <BuscadorLote />

      {/* Separador "—— o ——": las rayas las dibuja el CSS con ::before y ::after. */}
      <div className="or">
        <span>o</span>
      </div>

      {/*
       * radiogroup con una sola opción: es lo que hace el prototipo final.
       * aria-checked le dice al lector de pantalla (y al CSS, que la resalta)
       * si el ejemplo es el elegido. Cuando el productor busca su lugar, el
       * modo pasa a "dibujo" y esta opción se apaga sola.
       */}
      <div className="opts one" role="radiogroup" aria-label="Lote de ejemplo">
        <button
          type="button"
          className="opt"
          role="radio"
          aria-checked={modoLote === "demo"}
          onClick={usarEjemplo}
        >
          <span className="ic" aria-hidden="true">
            ◎
          </span>
          <b>Probar con el lote de ejemplo</b>
          <span>Campo real cerca de Río Cuarto · 95 ha · ya cargado</span>
        </button>
      </div>
    </div>
  );
}
