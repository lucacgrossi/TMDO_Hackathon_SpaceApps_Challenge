"use client";

import { create } from "zustand";
import { useEncuadre } from "./encuadre";
import type { LatLng } from "./entradas";
import { areaHa, formatoNumero, seCruza } from "./geo";
import { useMapa } from "./mapa";
import { useEntradas } from "./store";
import { useToast } from "./toast";

/**
 * F5 · Dibujar el lote por puntos: el estado mientras se marcan las esquinas
 * y las reglas para aceptarlo.
 *
 * Sale de `DRAW`, `drawUI`, `startDraw`, `endDraw` y `finishDraw` del
 * prototipo (prototipo-app.js ~líneas 73-107). La parte del mapa (marcas,
 * línea punteada, clicks) está en `components/mapa/CapaDibujo.tsx` y la barra
 * de botones en `components/mapa/BarraDibujo.tsx`; las dos leen este store.
 *
 * Por qué un store aparte y no `useEntradas`: los puntos a medio marcar no son
 * todavía una entrada del productor. Recién al tocar "Listo" (y si el lote es
 * válido) pasan a `useEntradas.poligono`.
 */

/** Límites de superficie del lote dibujado (MIN_HA / MAX_HA del prototipo y del MVP: 1 a 20.000 ha). */
export const AREA_MIN_HA = 1;
export const AREA_MAX_HA = 20000;

/** Cómo está el dibujo ahora: cuántos puntos, cuántas ha, si se cruza y si se puede cerrar. */
export interface Evaluacion {
  n: number;
  ha: number;
  cruza: boolean;
  valido: boolean;
}

/** Reglas para cerrar el lote: 3 esquinas o más, entre 1 y 20.000 ha y sin líneas cruzadas. */
export function evaluar(puntos: LatLng[]): Evaluacion {
  const n = puntos.length;
  const ha = n >= 3 ? areaHa(puntos) : 0;
  const cruza = n >= 3 && seCruza(puntos, true);
  const valido = n >= 3 && ha >= AREA_MIN_HA && ha <= AREA_MAX_HA && !cruza;
  return { n, ha, cruza, valido };
}

/** "1 esquina" / "4 esquinas". */
const esquinas = (n: number) => `${n} esquina${n === 1 ? "" : "s"}`;

/**
 * Textos de la barra de dibujo (S1): la línea en negrita dice cuánto va
 * marcado y la de abajo qué hacer o qué está mal (`error` la pinta en rojo).
 * Sin puntos medios entre datos (DESIGN.md, "Lenguaje de la interfaz").
 */
export function textosBarra(puntos: LatLng[]): { titulo: string; ayuda: string; error: boolean } {
  const { n, ha, cruza, valido } = evaluar(puntos);
  let titulo: string;
  if (n < 3) titulo = `Marcá las esquinas del lote: ${esquinas(n)}`;
  else if (cruza) titulo = esquinas(n); // con las líneas cruzadas la superficie no tiene sentido
  // Un decimal debajo de 100 ha, igual que el panel (`superficie` de resumenEntradas; QA H-027).
  else titulo = `Lote de ${formatoNumero(ha, ha < 100 ? 1 : 0)} ha, ${esquinas(n)}`;

  let ayuda: string;
  if (n === 0) ayuda = "Hacé clic en el mapa para marcar la primera esquina.";
  else if (n < 3) ayuda = "Seguí marcando: hacen falta 3 esquinas o más. Podés arrastrar cada una para acomodarla.";
  else if (cruza) ayuda = "Las líneas se cruzan: arrastrá o deshacé una esquina.";
  else if (ha < AREA_MIN_HA) ayuda = `Muy chico: el mínimo es ${AREA_MIN_HA} ha.`;
  else if (ha > AREA_MAX_HA)
    ayuda = `Muy grande: el máximo es ${formatoNumero(AREA_MAX_HA)} ha. Acercá el mapa y marcá el lote.`;
  else ayuda = "Arrastrá las esquinas para ajustar. Tocá la primera o «Listo» para cerrar.";

  return { titulo, ayuda, error: n >= 3 && !valido };
}

interface EstadoDibujo {
  dibujando: boolean;
  /** Esquinas marcadas, en orden. */
  puntos: LatLng[];
  /**
   * true mientras se arrastra una esquina. Hace falta porque al soltar la
   * primera esquina el navegador también manda un "click", y ese click
   * cerraría el lote sin querer.
   */
  arrastrando: boolean;
  /**
   * Sube en 1 cada vez que un lote se cierra bien (con «Listo», tocando la
   * primera esquina o con Enter). La pantalla de marcar lo escucha para pasar
   * al panel de entradas, venga de donde venga el cierre.
   */
  cierres: number;
  /** startDraw: arranca vacío o con un lote ya dibujado para editarlo. */
  iniciar: (previo?: LatLng[] | null) => void;
  agregar: (punto: LatLng) => void;
  deshacer: () => void;
  mover: (i: number, punto: LatLng) => void;
  setArrastrando: (si: boolean) => void;
  /** Cancelar: sale sin guardar (el lote anterior, si había, queda como estaba). */
  cancelar: () => void;
  /** finishDraw: si el lote es válido lo guarda y sale; devuelve si pudo. */
  terminar: () => boolean;
}

export const useDibujo = create<EstadoDibujo>()((set, get) => {
  /** endDraw: sale del modo dibujo; vuelve el lote normal y se va la marca del lugar. */
  const salir = () => {
    set({ dibujando: false, puntos: [], arrastrando: false });
    useMapa.getState().cambiarMapa({ marcaVisible: false, loteVisible: true });
  };

  return {
    dibujando: false,
    puntos: [],
    arrastrando: false,
    cierres: 0,

    iniciar: (previo) => {
      if (get().dibujando) return;
      // Copia de cada punto: así editar no toca el polígono guardado hasta "Listo".
      set({ dibujando: true, puntos: (previo ?? []).map((p) => [...p] as LatLng) });
      useEntradas.getState().cambiar({ modoLote: "dibujo" }); // setEntry("draw")
    },
    agregar: (punto) => set({ puntos: [...get().puntos, punto] }),
    deshacer: () => set({ puntos: get().puntos.slice(0, -1) }),
    mover: (i, punto) => set({ puntos: get().puntos.map((p, j) => (j === i ? punto : p)) }),
    setArrastrando: (si) => set({ arrastrando: si }),

    cancelar: () => salir(),

    terminar: () => {
      const { puntos } = get();
      const { valido, ha } = evaluar(puntos);
      if (!valido) return false;
      useEntradas.getState().cambiar({ poligono: puntos, modoLote: "dibujo" });
      salir();
      set({ cierres: get().cierres + 1 });
      // Encuadra el lote nuevo con 30 % de aire y lo confirma con un aviso.
      useEncuadre.getState().pedirEncuadre(0.3);
      useToast.getState().mostrar(`Lote dibujado: ${formatoNumero(ha, 1)} ha`);
      return true;
    },
  };
});
