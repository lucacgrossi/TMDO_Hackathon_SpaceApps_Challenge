"use client";

import { create } from "zustand";
import { mockAnalizar } from "@/mocks/analizar";
import { entradaDesde } from "./aEntrada";
import { analizar, ErrorDeApi, USAR_MOCK } from "./api";
import { useCapas, type ClimaMensual as ClimaMapa } from "./capas";
import { useComparacion } from "./comparacion";
import type { Salida } from "./contrato";
import type { Entradas } from "./entradas";
import { mismoPoligono } from "./geo";
import { useEntradas } from "./store";

/**
 * El resultado de /analizar que muestra la hoja.
 *
 * Se pide con la FOTO de las entradas del último "Comparar" (`comparacion.ts`),
 * no con las entradas en vivo: lo que cambie el productor después queda en el
 * aviso de "comparación anterior" hasta que vuelva a comparar.
 *
 * Mock o API según `NEXT_PUBLIC_USAR_MOCK` (ver `lib/api.ts`). Con la API, la
 * respuesta también alimenta las capas del mapa (pendiente y clima): el back
 * calcula y el front dibuja.
 */
export type Resultado =
  | { estado: "cargando" }
  | {
      estado: "error";
      mensaje: string;
      reintentable: boolean;
      /** Código HTTP, o null si no hubo respuesta (sin conexión, tiempo agotado). */
      codigo?: number | null;
      /** El back rechazó el pedido por el esquema (422 con `{detail}`): error de la app. */
      deLaApp?: boolean;
    }
  | { estado: "listo"; datos: Salida };

interface EstadoResultado {
  resultado: Resultado;
  /** De dónde salió el último resultado listo. Las capas del mapa solo usan "api". */
  origen: "api" | "mock" | null;
  /** Las entradas con las que se pidió (para saber si sigue siendo el mismo lote). */
  pedidoCon: Entradas | null;
  /** Vuelve a pedir con la misma foto ("Probar de nuevo"). */
  reintentar: () => void;
}

let enCurso: AbortController | null = null;

/** clima_mensual del contrato → lo que lee la leyenda "Lluvia y heladas" del mapa. */
export function climaParaMapa(s: Salida): ClimaMapa {
  const c = s.clima_mensual;
  return {
    tmin: c.minima_media_c,
    tmax: c.maxima_media_c,
    lluvia: c.lluvia_mm,
    heladas: c.anios_con_helada,
    calor: c.anios_con_35c,
    anios: c.n_anios,
    periodo: c.periodo,
  };
}

function pedir(foto: Entradas | null) {
  enCurso?.abort();
  enCurso = null;
  const set = useResultadoStore.setState;
  if (!foto) {
    set({ resultado: { estado: "cargando" }, origen: null, pedidoCon: null });
    return;
  }
  if (USAR_MOCK) {
    const { noSembrar, mediciones } = foto;
    set({ resultado: { estado: "listo", datos: mockAnalizar({ noSembrar, ...mediciones }) }, origen: "mock", pedidoCon: foto });
    return;
  }

  const control = new AbortController();
  enCurso = control;
  set({ resultado: { estado: "cargando" }, pedidoCon: foto });
  analizar(entradaDesde(foto), control.signal)
    .then((datos) => {
      if (control.signal.aborted) return;
      set({ resultado: { estado: "listo", datos }, origen: "api" });
      useCapas.getState().cambiarCapas({
        pendiente: datos.capas.pendiente_mapa ?? null,
        clima: climaParaMapa(datos),
      });
    })
    .catch((e: unknown) => {
      if (control.signal.aborted) return;
      const err =
        e instanceof ErrorDeApi ? e : new ErrorDeApi("Error inesperado al pedir la comparación.", null, true);
      set({
        resultado: {
          estado: "error",
          mensaje: err.message,
          reintentable: err.reintentable,
          codigo: err.estado,
          deLaApp: err.deLaApp,
        },
      });
    })
    .finally(() => {
      if (enCurso === control) enCurso = null;
    });
}

export const useResultadoStore = create<EstadoResultado>()(() => ({
  resultado: { estado: "cargando" },
  origen: null,
  pedidoCon: null,
  reintentar: () => pedir(useComparacion.getState().foto),
}));

// Cada foto nueva (abrir la hoja, "Comparar con los datos nuevos") pide de nuevo.
useComparacion.subscribe((actual, anterior) => {
  if (actual.foto !== anterior.foto) pedir(actual.foto);
});
// Si el productor mueve o redibuja el lote, las capas del back dejan de ser de
// este lote: el mapa vuelve a "sin dato" hasta comparar de nuevo.
useEntradas.subscribe((actual, anterior) => {
  if (actual.poligono === anterior.poligono) return;
  const { pedidoCon, origen } = useResultadoStore.getState();
  if (origen === "api" && pedidoCon && !mismoPoligono(pedidoCon.poligono, actual.poligono)) {
    useCapas.getState().cambiarCapas({ pendiente: null, clima: null });
  }
});

// Por si la foto ya existía al cargar el módulo
if (useComparacion.getState().foto) pedir(useComparacion.getState().foto);

/** El resultado de la última comparación (cargando, error o listo). */
export function useResultado(): Resultado {
  return useResultadoStore((s) => s.resultado);
}

/**
 * La respuesta REAL del back para el lote que se ve ahora, o null: si todavía
 * no se comparó, si es el mock (valores ilustrativos: no van al mapa) o si el
 * productor ya movió o redibujó el lote.
 */
export function useSalidaDelLote(): Salida | null {
  const { resultado, origen, pedidoCon } = useResultadoStore();
  const poligono = useEntradas((s) => s.poligono);
  if (resultado.estado !== "listo" || origen !== "api" || !pedidoCon) return null;
  return mismoPoligono(pedidoCon.poligono, poligono) ? resultado.datos : null;
}
