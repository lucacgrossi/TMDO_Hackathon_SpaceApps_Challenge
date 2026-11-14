"use client";

import { useEncuadre } from "@/lib/encuadre";
import { LOTE_DEMO, type LatLng } from "@/lib/entradas";
import { useDibujo } from "@/lib/dibujo";
import { areaHa, centro, formatoNumero, mismoPoligono } from "@/lib/geo";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";
import { useZona } from "@/lib/zona";

/**
 * F3 · Bloque `.lote` del panel en el paso 2: dónde está el lote, el selector
 * "Lote de ejemplo / Dibujar mi lote" y los 3 datos (superficie, pendiente,
 * lluvia por año).
 *
 * Sale del bloque `.lote` de prototipo-body.html y de `onLoteChange()` del
 * prototipo (prototipo-app.js ~línea 161), que reescribe título, subtítulo y
 * superficie cada vez que el lote cambia. Acá no hace falta "avisar": React
 * vuelve a calcular todo cuando cambia `poligono` en el estado.
 *
 * En el paso 1 este bloque no se ve (el CSS tiene `body.onb .lote{display:none}`).
 *
 * "Dibujar mi lote" arranca el dibujo (lib/dibujo.ts); la barra y las esquinas
 * las muestran BarraDibujo y CapaDibujo.
 *
 * Pendiente y lluvia/año quedan en "—": son datos de NASA (NASADEM y POWER)
 * que calcula el backend; el front no calcula datos de NASA (frontend/CLAUDE.md).
 * Se completan cuando llegue la respuesta de /analizar.
 */

/** "33,2477° S · 64,2325° O": hemisferio con letra, como en el prototipo. */
function coordenadas([lat, lng]: LatLng): string {
  const ns = lat < 0 ? "S" : "N";
  const eo = lng < 0 ? "O" : "E";
  return `${formatoNumero(Math.abs(lat), 4)}° ${ns} · ${formatoNumero(Math.abs(lng), 4)}° ${eo}`;
}

export default function ResumenLote() {
  const poligono = useEntradas((s) => s.poligono);
  const modoLote = useEntradas((s) => s.modoLote);
  const cambiar = useEntradas((s) => s.cambiar);
  // Mientras se dibuja, el selector queda deshabilitado (startDraw del prototipo).
  const dibujando = useDibujo((s) => s.dibujando);

  const c = centro(poligono);
  // Zona real del lote (geocodificación inversa de Esri), ver lib/zona.ts
  const zona = useZona(poligono);

  /** "Lote de ejemplo": vuelve el rectángulo de Río Cuarto y lo encuadra (con 30 % de aire). */
  const usarEjemplo = () => {
    cambiar({ modoLote: "demo", poligono: LOTE_DEMO.map((p) => [...p] as LatLng) });
    useMapa.getState().cambiarMapa({ loteVisible: true });
    useEncuadre.getState().pedirEncuadre(0.3);
  };

  /**
   * "Dibujar mi lote": arranca el dibujo. Si ya había un lote propio dibujado,
   * arranca con sus esquinas para poder corregirlo (en vez de empezar de cero),
   * como el prototipo. "Propio" = modo dibujo y distinto del de ejemplo.
   */
  const dibujar = () => {
    const propio = modoLote === "dibujo" && !mismoPoligono(poligono, LOTE_DEMO);
    useDibujo.getState().iniciar(propio ? poligono : null);
  };

  return (
    <div className="lote">
      {/* Decisión del equipo: en vez de "a N km de Río Cuarto" (del prototipo), la zona
          real donde está el lote. Sin respuesta de Esri queda "Lote marcado". */}
      <h2>{zona ?? "Lote marcado"}</h2>
      <p>{coordenadas(c)} · tocá el mapa para moverlo o dibujalo</p>
      <div className="seg2" role="radiogroup" aria-label="Cómo marcar el lote">
        <button type="button" role="radio" aria-checked={modoLote === "demo"} onClick={usarEjemplo} disabled={dibujando}>
          Lote de ejemplo
        </button>
        <button type="button" role="radio" aria-checked={modoLote === "dibujo"} onClick={dibujar} disabled={dibujando}>
          Dibujar mi lote
        </button>
      </div>
      <div className="facts">
        <div>
          <div className="k">Superficie</div>
          <div className="v num">{formatoNumero(areaHa(poligono))} ha</div>
        </div>
        <div>
          <div className="k">Pendiente</div>
          <div className="v num">—</div>
        </div>
        <div>
          <div className="k">Lluvia/año</div>
          <div className="v num">—</div>
        </div>
      </div>
    </div>
  );
}
