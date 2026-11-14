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
 * En el prototipo final este bloque está SIEMPRE visible en el paso 1, dentro
 * de ElegirLote, arriba del "o · Probar con el lote de ejemplo".
 *
 * La lógica sin React (regex, llamadas a Esri, mensajes) está en
 * `src/lib/buscador.ts`.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  MENSAJES,
  buscarSugerencias,
  fmt,
  limpiarTexto,
  parsearCoordenadas,
  ubicarSugerencia,
  type Sugerencia,
} from "@/lib/buscador";
import type { UbicacionElegida } from "@/lib/entradas";
import { useEntradas } from "@/lib/store";

/** Espera entre teclas antes de pedir sugerencias (igual que el prototipo). */
const DEBOUNCE_MS = 280;

export default function BuscadorLote() {
  const ubicacion = useEntradas((s) => s.ubicacion);
  const cambiar = useEntradas((s) => s.cambiar);

  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  /** Mensaje que reemplaza a la lista ("No encontré ese lugar…"). */
  const [mensaje, setMensaje] = useState("");
  /** La lista se esconde al elegir un punto, como `$("#sug").hidden=true`. */
  const [abierta, setAbierta] = useState(false);
  /** Sugerencia resaltada con las flechas (-1 = ninguna). */
  const [activa, setActiva] = useState(-1);
  const [buscandoGps, setBuscandoGps] = useState(false);

  /*
   * Por qué un contador (`sugTok` en el prototipo): si el productor escribe
   * "Río" y después "Río Cuarto", la respuesta de "Río" puede llegar DESPUÉS.
   * Cada pedido se lleva su número y, si al volver ya no es el último, se tira.
   * Además se aborta el fetch viejo para no gastar red.
   */
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ids para unir el input con la lista (accesibilidad: aria-controls y aria-activedescendant).
  const idBase = useId();
  const idLista = `${idBase}-sug`;
  const idOpcion = (i: number) => `${idBase}-op-${i}`;

  // Al desmontar el componente, cortamos el pedido pendiente (no queremos un setState huérfano).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  /** Igual que `showSug(list, msg)`: muestra la lista o, si está vacía, el mensaje. */
  function mostrar(lista: Sugerencia[], msg = "") {
    setSugerencias(lista);
    setMensaje(msg);
    setActiva(-1);
    setAbierta(lista.length > 0 || msg !== "");
  }

  /**
   * Igual que `setTarget`: guarda el punto y cierra la lista. Elegir un lugar
   * implica que el productor va a marcar SU lote, así que el modo pasa a
   * "dibujo" (el prototipo hace `S.entry="draw"` y apaga el radio del ejemplo).
   * Se escribe todo en un solo `cambiar` para que nadie lea un estado a medias.
   */
  function elegir(u: UbicacionElegida) {
    setAbierta(false);
    cambiar({ ubicacion: u, modoLote: "dibujo" });
  }

  /** Cancela el pedido a Esri en curso o en espera. */
  function cancelarPendiente() {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    tokenRef.current++;
  }

  function alEscribir(valor: string) {
    setTexto(valor);
    cancelarPendiente();

    // Coordenadas o link pegado: se ubica al toque, sin llamar a la API.
    const punto = parsearCoordenadas(valor);
    if (punto) {
      mostrar([]);
      elegir(punto);
      return;
    }
    // Con menos de 3 letras Esri devuelve cualquier cosa: no buscamos.
    if (valor.trim().length < 3) {
      mostrar([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const tok = ++tokenRef.current;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const lista = await buscarSugerencias(valor, ctrl.signal);
        if (tok !== tokenRef.current) return; // llegó tarde: ya hay un pedido más nuevo
        mostrar(lista, MENSAJES.sinResultados);
      } catch {
        if (tok !== tokenRef.current) return; // abortado a propósito, no es un error
        mostrar([], MENSAJES.sinRed);
      }
    }, DEBOUNCE_MS);
  }

  /** Igual que `pickSug(i)`: pone el texto en el input y pide las coordenadas. */
  async function elegirSugerencia(i: number) {
    const s = sugerencias[i];
    if (!s) return;
    cancelarPendiente();
    setTexto(limpiarTexto(s.text));
    try {
      const punto = await ubicarSugerencia(s);
      if (punto) elegir(punto);
    } catch {
      mostrar([], MENSAJES.noUbico);
    }
  }

  /*
   * Teclado en el input: flechas recorren la lista, Enter elige la resaltada
   * (o la primera, como el prototipo) y Escape cierra la lista. El foco queda
   * siempre en el input; la opción activa se anuncia con aria-activedescendant.
   */
  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    const hayLista = abierta && sugerencias.length > 0;
    if (e.key === "ArrowDown" && hayLista) {
      e.preventDefault();
      setActiva((a) => (a + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp" && hayLista) {
      e.preventDefault();
      setActiva((a) => (a <= 0 ? sugerencias.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Sin preventDefault el Enter podría mandar un formulario que lo contenga.
      e.preventDefault();
      if (sugerencias.length) void elegirSugerencia(activa >= 0 ? activa : 0);
    } else if (e.key === "Escape" && abierta) {
      e.preventDefault();
      setAbierta(false);
    }
  }

  /** Listener de `#geo`: pide el GPS del navegador. */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      mostrar([], MENSAJES.sinGeo);
      return;
    }
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBuscandoGps(false);
        elegir({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          etiqueta: "tu ubicación actual",
          precisionM: p.coords.accuracy,
        });
      },
      () => {
        setBuscandoGps(false);
        mostrar([], MENSAJES.gpsFallo);
      },
      // Alta precisión: en el campo importa la del GPS, no la de la antena. 12 s y se rinde.
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  const listaVisible = abierta && (sugerencias.length > 0 || mensaje !== "");

  return (
    <div className="where">
      <label htmlFor={`${idBase}-q`}>¿Dónde está tu lote?</label>
      <div className="qrow">
        {/* Lupa decorativa: aria-hidden para que el lector de pantalla no lea "⌕". */}
        <span className="qic" aria-hidden="true">
          ⌕
        </span>
        <input
          id={`${idBase}-q`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscá la localidad, paraje o ruta · o pegá coordenadas o un link de Google Maps"
          value={texto}
          onChange={(e) => alEscribir(e.target.value)}
          onKeyDown={alTeclear}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listaVisible && sugerencias.length > 0}
          aria-controls={idLista}
          aria-activedescendant={activa >= 0 && listaVisible ? idOpcion(activa) : undefined}
        />
        <button type="button" className="sm" onClick={usarMiUbicacion} disabled={buscandoGps}>
          {buscandoGps ? "Buscando…" : "◉ Usar mi ubicación"}
        </button>
      </div>

      <div className="sug" id={idLista} role="listbox" hidden={!listaVisible}>
        {sugerencias.length > 0
          ? sugerencias.map((s, i) => (
              <button
                key={s.magicKey}
                id={idOpcion(i)}
                type="button"
                role="option"
                aria-selected={i === activa}
                className={i === activa ? "on" : undefined}
                // tabIndex -1: se recorren con las flechas desde el input, no con Tab.
                tabIndex={-1}
                onMouseEnter={() => setActiva(i)}
                onClick={() => void elegirSugerencia(i)}
              >
                {limpiarTexto(s.text)}
              </button>
            ))
          : mensaje && (
              <div className="msg" role="status">
                {mensaje}
              </div>
            )}
      </div>

      {ubicacion && (
        <div className="picked">
          <span>
            <b>Tu lote está acá:</b> {ubicacion.etiqueta}
            {ubicacion.precisionM ? <small> (± {fmt(ubicacion.precisionM)} m)</small> : null}
          </span>
        </div>
      )}

      <small className="wsrc">
        Si estás en el campo, «Usar mi ubicación» toma el GPS del celu. Después marcás las
        esquinas en el mapa. Búsqueda de lugares: Esri.
      </small>
    </div>
  );
}
