"use client";

import { create } from "zustand";

/**
 * Lo que las capas del mapa ya cargaron, para que la leyenda lo muestre.
 *
 * Por qué un store aparte: quien carga los datos (CapaNdvi, CapaPendiente)
 * vive DENTRO del mapa y la leyenda (`#legend`) vive FUERA. En el prototipo
 * eran variables sueltas (`NDVI_SRC`, `S.slope`, `S.slopeReal`); acá son el
 * punto de encuentro entre los dos lados.
 */

/** Nombres de los meses, índice 0 = enero (`MES` del prototipo). */
export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** De dónde salió el NDVI que se está viendo (`NDVI_SRC` del prototipo). */
export type FuenteNdvi =
  | {
      tipo: "hls";
      /** "hls2-s30" (Sentinel-2) o "hls2-l30" (Landsat). */
      coleccion: string;
      id: string;
      /** Fecha de la escena, "AAAA-MM-DD". */
      fecha: string;
      /** Nubes en la escena, %. */
      nubes: number;
      /** NDVI medio dentro del lote. null mientras se calcula o si falló. */
      media: number | null;
    }
  | {
      tipo: "modis";
      /** Año de la imagen de MODIS (el de la campaña de ese mes). */
      anio: number;
    };

/** Resultado de la capa de pendiente (`S.slope`, `S.slopeReal` y `slopeOverlay` del prototipo). */
export interface ResultadoPendiente {
  /** Pendiente general del lote, %. */
  media: number;
  /** true = calculada con elevación real; false = valor ilustrativo (falló la descarga). */
  real: boolean;
  /** Imagen coloreada de la pendiente (data URL). null si no hay elevación. */
  imagen: string | null;
  /** Esquinas de la imagen: [[sur, oeste], [norte, este]]. */
  limites: [[number, number], [number, number]] | null;
}

interface EstadoCapas {
  /** null = todavía no se pidió nada para este mes/lote. */
  ndvi: FuenteNdvi | null;
  /** null = calculando (la leyenda muestra el título sin valor). */
  pendiente: ResultadoPendiente | null;
  cambiarCapas: (parcial: Partial<Omit<EstadoCapas, "cambiarCapas">>) => void;
}

export const useCapas = create<EstadoCapas>()((set) => ({
  ndvi: null,
  pendiente: null,
  cambiarCapas: (parcial) => set(parcial),
}));
