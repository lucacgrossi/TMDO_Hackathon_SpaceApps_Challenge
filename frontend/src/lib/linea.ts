/**
 * Datos de la línea de la campaña (RF14 visual), puros y sin React: qué mes
 * tiene helada frecuente, dónde choca con un cultivo sensible, dónde hay calor,
 * y el color del NDVI visto por satélite. Todo sale de lo que manda /analizar.
 */
import { ORDEN_CAMPANIA, type EstrategiaDisponible, type Salida } from "./contrato";

/** Posición del mes (0 = enero) en la campaña: julio = 0 … junio = 11. */
export function indiceCampania(mes: number): number {
  return (((mes - 6) % 12) + 12) % 12;
}

export interface MesLinea {
  /** 0 = enero. */
  mes: number;
  /** Mínima < 0 °C en 1 de cada 3 años o más (dato del clima, igual para todas). */
  heladaFrecuente: boolean;
  /** Helada frecuente con un cultivo sensible en el lote. */
  conflictoHelada: boolean;
  /** Cultivo de verano con máxima ≥ 35 °C en la mitad de los años o más. */
  calor: boolean;
  aniosHelada: number;
  anios35: number;
}

/** Los 12 meses de una estrategia, en el orden de la campaña. */
export function mesesLinea(salida: Salida, e: EstrategiaDisponible): MesLinea[] {
  const cm = salida.clima_mensual;
  const c = e.valores.conflictos_helada_calor;
  return ORDEN_CAMPANIA.map((mes) => ({
    mes,
    heladaFrecuente: cm.helada_frecuente[mes] ?? c.meses_helada_frecuente.includes(mes),
    conflictoHelada: c.meses_conflicto_helada.includes(mes),
    calor: c.meses_calor.includes(mes),
    aniosHelada: cm.anios_con_helada[mes],
    anios35: cm.anios_con_35c[mes],
  }));
}

/**
 * Escala clasificada del NDVI (MVP, "Mapa interactivo"), la misma del mapa:
 * de 0 a 0,3 es pelado (arena) y de 0,3 en adelante, vegetación (verdes).
 * Validada con la skill de visualización.
 */
export const NDVI_CORTES = [0, 0.15, 0.3, 0.45, 0.6, 0.75] as const;
export const NDVI_COLORES = ["#E6D8AE", "#CDBA86", "#94AF63", "#689C49", "#3F8139", "#1B5E2E"] as const;

/** Color de la clase del NDVI. Por debajo de 0 cuenta como la primera clase. */
export function colorNdvi(v: number): string {
  let i = 0;
  NDVI_CORTES.forEach((corte, k) => {
    if (v >= corte) i = k;
  });
  return NDVI_COLORES[i];
}
