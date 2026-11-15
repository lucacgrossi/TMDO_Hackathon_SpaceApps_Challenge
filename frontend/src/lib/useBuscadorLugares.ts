"use client";

/**
 * Hook compartido por los DOS buscadores de lugares del prototipo final:
 *   - el del paso 1, "¿Dónde está tu lote?" (BuscadorLote · `#q` en el prototipo),
 *   - el del mapa, la caja flotante del paso 2 (BuscadorMapa · `#mq`).
 *
 * Los dos hacen lo mismo: escribir → esperar 280 ms → pedir sugerencias a Esri
 * → elegir una → pedir sus coordenadas. En el prototipo ese código está
 * repetido (`showSug`/`pickSug` y `mSug`/`mPick`); acá vive una sola vez y cada
 * componente solo decide qué hacer con el lugar elegido y cómo se ve.
 *
 * Diferencias que se configuran con las opciones:
 *   - `coordenadasAlEscribir`: en el paso 1 pegar coordenadas ubica al toque;
 *     en el mapa solo cierra la lista y se confirma con Enter (como `mGo`).
 *   - `mensajes`: el mapa usa textos más cortos.
 *   - `centro`: el punto que sesga la búsqueda (Córdoba o el lote actual).
 *
 * La lógica sin React (regex y llamadas a Esri) sigue en `src/lib/buscador.ts`.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  buscarSugerencias,
  limpiarTexto,
  parsearCoordenadas,
  ubicarSugerencia,
  type MensajesBusqueda,
  type Sugerencia,
} from "./buscador";
import type { UbicacionElegida } from "./entradas";

/** Espera entre teclas antes de pedir sugerencias (igual que el prototipo). */
const DEBOUNCE_MS = 280;

export interface OpcionesBuscador {
  /** Qué hacer con el lugar elegido (guardar en el store, avisar, etc.). */
  alElegir: (punto: UbicacionElegida) => void;
  mensajes: MensajesBusqueda;
  /** true = coordenadas o link pegados se eligen sin esperar Enter. */
  coordenadasAlEscribir: boolean;
  /**
   * Punto de sesgo para Esri. Es una función (no un valor) para leerlo en el
   * momento del pedido: así el mapa usa el lote actual aunque haya cambiado
   * después del último render.
   */
  centro?: () => { lat: number; lng: number };
}

export function useBuscadorLugares({
  alElegir,
  mensajes,
  coordenadasAlEscribir,
  centro,
}: OpcionesBuscador) {
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  /** Mensaje que reemplaza a la lista ("No encontré ese lugar…"). */
  const [mensaje, setMensaje] = useState("");
  /** La lista se esconde al elegir un punto, como `$("#sug").hidden=true`. */
  const [abierta, setAbierta] = useState(false);
  /** Sugerencia resaltada con las flechas (-1 = ninguna). */
  const [activa, setActiva] = useState(-1);

  /*
   * Por qué un contador (`sugTok` / `msTok` en el prototipo): si el productor
   * escribe "Río" y después "Río Cuarto", la respuesta de "Río" puede llegar
   * DESPUÉS. Cada pedido se lleva su número y, si al volver ya no es el último,
   * se tira. Además se aborta el fetch viejo para no gastar red.
   */
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Las opciones pueden cambiar en cada render (funciones nuevas). Se guardan
   * en un ref para que el temporizador use siempre las últimas sin tener que
   * reiniciarlo.
   */
  const opcionesRef = useRef({ alElegir, mensajes, centro });
  opcionesRef.current = { alElegir, mensajes, centro };

  // Al desmontar el componente, cortamos el pedido pendiente (no queremos un setState huérfano).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  /** Igual que `showSug(list, msg)` / `mSug`: muestra la lista o, si está vacía, el mensaje. */
  function mostrar(lista: Sugerencia[], msg = "") {
    setSugerencias(lista);
    setMensaje(msg);
    setActiva(-1);
    setAbierta(lista.length > 0 || msg !== "");
  }

  /** Cierra la lista sin borrar lo escrito (clic afuera, Escape). */
  function cerrar() {
    setAbierta(false);
  }

  /** Cancela el pedido a Esri en curso o en espera. */
  function cancelarPendiente() {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    tokenRef.current++;
  }

  /** Cierra la lista y le pasa el punto al componente. */
  function elegir(p: UbicacionElegida) {
    setAbierta(false);
    opcionesRef.current.alElegir(p);
  }

  function alEscribir(valor: string) {
    setTexto(valor);
    cancelarPendiente();

    // Coordenadas o link pegado: no hace falta llamar a Esri.
    const punto = parsearCoordenadas(valor);
    if (punto) {
      mostrar([]);
      if (coordenadasAlEscribir) elegir(punto);
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
      const { mensajes: m, centro: c } = opcionesRef.current;
      try {
        const lista = await buscarSugerencias(valor, ctrl.signal, c?.());
        if (tok !== tokenRef.current) return; // llegó tarde: ya hay un pedido más nuevo
        mostrar(lista, m.sinResultados);
      } catch {
        if (tok !== tokenRef.current) return; // abortado a propósito, no es un error
        mostrar([], m.sinRed);
      }
    }, DEBOUNCE_MS);
  }

  /** Igual que `pickSug(i)` / `mPick(i)`: pone el texto en el input y pide las coordenadas. */
  async function elegirSugerencia(i: number) {
    const s = sugerencias[i];
    if (!s) return;
    cancelarPendiente();
    setTexto(limpiarTexto(s.text));
    try {
      const punto = await ubicarSugerencia(s);
      if (punto) elegir(punto);
    } catch {
      mostrar([], opcionesRef.current.mensajes.noUbico);
    }
  }

  /*
   * Teclado en el input: flechas recorren la lista, Enter elige y Escape
   * cierra. Enter primero mira si lo escrito son coordenadas (como el keydown
   * de `#mq`); si no, elige la sugerencia resaltada o la primera (como `#q`).
   * El foco queda siempre en el input; la opción activa se anuncia con
   * aria-activedescendant.
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
      const punto = parsearCoordenadas(texto);
      if (punto) elegir(punto);
      else if (sugerencias.length)
        void elegirSugerencia(activa >= 0 ? activa : 0);
    } else if (e.key === "Escape" && abierta) {
      e.preventDefault();
      cerrar();
    }
  }

  return {
    texto,
    sugerencias,
    mensaje,
    activa,
    setActiva,
    /** true si hay algo que mostrar debajo del input (lista o mensaje). */
    listaVisible: abierta && (sugerencias.length > 0 || mensaje !== ""),
    alEscribir,
    alTeclear,
    elegirSugerencia,
    /** Para que el componente muestre errores propios (por ejemplo, del GPS). */
    mostrarMensaje: (msg: string) => mostrar([], msg),
    /** Para elegir un punto que no vino de Esri (por ejemplo, el GPS). */
    elegir,
    cerrar,
  };
}

export type BuscadorLugares = ReturnType<typeof useBuscadorLugares>;
