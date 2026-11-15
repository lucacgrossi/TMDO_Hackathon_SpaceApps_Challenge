"use client";

/**
 * La lista `.sug` de un buscador de lugares (sugerencias de Esri o un
 * mensaje). La comparten BuscadorLote (paso 1) y BuscadorMapa (paso 2).
 *
 * Sale de `showSug` / `mSug` del prototipo final: los dos arman el mismo HTML
 * (botones con role="option" o un `.msg`). El CSS decide dónde se ve: en el
 * paso 1 debajo del input, en el mapa flotando bajo la caja (`.msearch .sug`).
 */

import { limpiarTexto } from "@/lib/buscador";
import type { BuscadorLugares } from "@/lib/useBuscadorLugares";

interface Props {
  buscador: BuscadorLugares;
  /** id de la lista, para el aria-controls del input. */
  id: string;
  /** id de cada opción, para el aria-activedescendant del input. */
  idOpcion: (i: number) => string;
}

export default function ListaSugerencias({ buscador: b, id, idOpcion }: Props) {
  return (
    <div className="sug" id={id} role="listbox" hidden={!b.listaVisible}>
      {b.sugerencias.length > 0
        ? b.sugerencias.map((s, i) => (
            <button
              key={s.magicKey}
              id={idOpcion(i)}
              type="button"
              role="option"
              aria-selected={i === b.activa}
              className={i === b.activa ? "on" : undefined}
              // tabIndex -1: se recorren con las flechas desde el input, no con Tab.
              tabIndex={-1}
              onMouseEnter={() => b.setActiva(i)}
              onClick={() => void b.elegirSugerencia(i)}
            >
              {limpiarTexto(s.text)}
            </button>
          ))
        : b.mensaje && (
            <div className="msg" role="status">
              {b.mensaje}
            </div>
          )}
    </div>
  );
}
