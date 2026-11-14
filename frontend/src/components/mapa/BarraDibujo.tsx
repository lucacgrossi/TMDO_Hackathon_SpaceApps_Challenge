"use client";

import { evaluar, textosBarra, useDibujo } from "@/lib/dibujo";

/**
 * F5 · Barra de arriba del mapa mientras se dibuja el lote (`.drawbar`):
 * cuánto va marcado, qué hacer, y los botones Deshacer, Cancelar y Listo.
 *
 * Sale del `#drawbar` de prototipo-body.html y de `drawUI()` del prototipo
 * (prototipo-app.js ~línea 83), que reescribe los textos y habilita los
 * botones con cada esquina. Acá React lo recalcula solo al cambiar `puntos`.
 *
 * Está fuera del mapa (en page.tsx) porque es parte de la interfaz, no del
 * mapa; habla con la capa del mapa a través del store `useDibujo`.
 */
export default function BarraDibujo() {
  const dibujando = useDibujo((s) => s.dibujando);
  const puntos = useDibujo((s) => s.puntos);
  const deshacer = useDibujo((s) => s.deshacer);
  const cancelar = useDibujo((s) => s.cancelar);
  const terminar = useDibujo((s) => s.terminar);

  if (!dibujando) return null;

  const { titulo, ayuda, error } = textosBarra(puntos);
  const { valido, n } = evaluar(puntos);

  return (
    // role="status": el lector de pantalla anuncia los cambios de texto (ej. "Muy chico").
    <div className="drawbar" id="drawbar" role="status">
      <div className="tx">
        <b>{titulo}</b>
        <span className={error ? "err" : undefined}>{ayuda}</span>
      </div>
      <button className="sm" type="button" onClick={deshacer} disabled={n === 0}>
        Deshacer
      </button>
      <button className="sm" type="button" onClick={cancelar}>
        Cancelar
      </button>
      {/* "Listo" se habilita con 3 esquinas o más y un lote válido (1 a 20.000 ha, sin cruces). */}
      <button className="sm pri" type="button" onClick={terminar} disabled={!valido}>
        Listo
      </button>
    </div>
  );
}
