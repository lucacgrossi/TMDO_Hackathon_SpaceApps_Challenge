"use client";

import { create } from "zustand";
import type { CapaRaster } from "@/lib/capaRaster";

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

/**
 * Climatología mensual de NASA POWER para la capa "Lluvia y heladas"
 * (`clima_mensual` de `/analizar`). Índice 0 = enero … 11 = diciembre.
 * Llega del backend en la auditoría de conexión; hasta entonces es null y la
 * leyenda dice "sin dato" (no se muestran valores ilustrativos: pedido de
 * Back 2 en el PR #25, principio "nada inventado").
 */
export interface ClimaMensual {
  /** Temperatura mínima por mes, °C. */
  tmin: number[];
  /** Temperatura máxima por mes, °C. */
  tmax: number[];
  /** Lluvia media por mes, mm. */
  lluvia: number[];
  /** Años con helada (mínima < 0 °C) en cada mes (`anios_con_helada`). */
  heladas: number[];
  /** Años con máxima ≥ 35 °C en cada mes (`anios_con_35c`). */
  calor: number[];
  /** Cantidad de campañas de la serie. */
  anios: number;
  /** Período de la serie, por ejemplo "1996/97 a 2025/26". */
  periodo: string;
}

interface EstadoCapas {
  /** null = todavía no se pidió nada para este mes/lote. */
  ndvi: FuenteNdvi | null;
  /**
   * Capa raster de pendiente que manda el backend (NASADEM 30 m).
   * null = todavía no hay dato: hasta la auditoría de conexión siempre es null.
   */
  pendiente: CapaRaster | null;
  /** Climatología del punto (NASA POWER). null = todavía sin dato del backend. */
  clima: ClimaMensual | null;
  cambiarCapas: (parcial: Partial<Omit<EstadoCapas, "cambiarCapas">>) => void;
}

export const useCapas = create<EstadoCapas>()((set) => ({
  ndvi: null,
  pendiente: null,
  clima: null,
  cambiarCapas: (parcial) => set(parcial),
}));
