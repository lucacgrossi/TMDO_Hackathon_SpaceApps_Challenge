/**
 * Tipos de la SALIDA de POST /analizar (MVP 4.2, docs/mvp-alcance.md, "Contrato de la API").
 *
 * Es el único archivo del front que depende del backend: si el contrato cambia,
 * se cambia acá y TypeScript marca todo lo que hay que ajustar. Las entradas
 * del productor viven en `entradas.ts`.
 *
 * Convenciones (a confirmar con la persona 1 en la auditoría):
 * - Todo array de 12 meses usa el índice 0 = enero … 11 = diciembre, igual que
 *   `useVista().mes` y el prototipo. La campaña (julio a junio) se dibuja con
 *   `ORDEN_CAMPANIA`. `backend/PLAN.md` deja esto abierto.
 * - Los campos marcados "PROPUESTO" no figuran en el contrato del MVP y se
 *   agregaron porque la hoja los necesita (los 5 puntos de cada columna, la
 *   línea de la campaña). Hay que pedírselos a la persona 1.
 */
import type { Invierno, Objetivo, Verano } from "./entradas";

/** Meses en el orden de la campaña: julio (6) a junio (5). */
export const ORDEN_CAMPANIA = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5] as const;

export const OBJETIVOS: readonly Objetivo[] = ["agua", "suelo", "erosion", "ingreso"];
export const TIPOS_DE_ANIO = ["seco", "normal", "humedo"] as const;

export type Confianza = "alta" | "media" | "baja";
export type TipoAnio = (typeof TIPOS_DE_ANIO)[number];
export type IdEstrategia = "actual" | "A" | "B" | "C";
/** Cultivo de un mes del calendario. "barbecho" = lote pelado. "soja2" = soja de segunda. */
export type CultivoCalendario = Verano | Invierno | "soja2";
/** Puntaje de 0 a 100 por objetivo: la base de la cercanía (RF9, RF13). */
export type Puntajes = Record<Objetivo, number>;

/** Un valor trazable: siempre con unidad, fuente, años, resolución y confianza (RF11). */
export interface Indicador {
  valor: number | null;
  unidad: string;
  fuente: string;
  /** Período del dato ("1995/96 a 2024/25"). null si no depende de años (tabla de cultivos). */
  anios: string | null;
  resolucion: string;
  confianza: Confianza;
}

export interface MesSatelite {
  /** Fecha de la escena usada (AAAA-MM-DD). */
  fecha: string;
  ndvi_medio: number;
  /** Nubes en la escena, en %. */
  nubes_escena: number;
  /**
   * PROPUESTO. Fuente del mes cuando no es la general: MODIS 250 m es el respaldo
   * si HLS no tiene escena limpia (CLAUDE.md). Si falta, vale `VistoPorSatelite.fuente`.
   */
  fuente?: string;
}

/** Lo que vio el satélite en la última campaña (RF14). */
export interface VistoPorSatelite {
  campana: string;
  fuente: string;
  /** 12 meses; null = sin escena sin nubes ese mes. */
  meses: (MesSatelite | null)[];
  meses_ndvi_bajo: number;
  /** NDVI por debajo del cual el mes cuenta como "pelado" (0,3). */
  umbral: number;
}

/** Pluviómetro (u otra medición) al lado de NASA (RF15). No cambia ningún puntaje. */
export interface ContrasteMedicion {
  indicador: string;
  valor_productor: number;
  valor_nasa: number;
  /** (productor − NASA) / NASA, en %. */
  diferencia_pct: number;
  /** "baja" si la diferencia pasa el 15 %. */
  confianza_resultante: "alta" | "baja";
  /** Valor "corregido con tu pluviómetro", solo informativo. */
  corregido_al_lado: { umbral_seco_mm: number; nota: string } | null;
}

export interface ClimaCelda {
  /** [oeste, sur, este, norte] de la celda de NASA POWER (~50 km). */
  bbox: [number, number, number, number];
  posicion_lote: string;
}

/** Clima de cada mes, promediado en las 30 campañas (índice 0 = enero). */
export interface ClimaMensual {
  lluvia_mm: number[];
  minima_media_c: number[];
  maxima_media_c: number[];
  /** Años (de 30) con mínima < 0 °C en ese mes. */
  anios_con_helada: number[];
  /** Años (de 30) con máxima ≥ 35 °C en ese mes. */
  anios_con_35c: number[];
}

/** Terciles de las 30 campañas (RF10). Los años van como etiqueta de campaña ("2021/22"). */
export interface TiposDeAnio {
  metodo: "terciles";
  /**
   * PROPUESTO. Con qué se ordenaron las campañas. El MVP pide el balance de agua
   * y, si falta la ET, la lluvia "y se dice": este campo es ese "se dice".
   */
  ordenado_por?: "balance_mm" | "lluvia_mm";
  seco: string[];
  normal: string[];
  humedo: string[];
  /** Campañas con hasta este valor son "secas". */
  umbral_seco_mm: number;
  /** Campañas con más de este valor son "húmedas". */
  umbral_humedo_mm: number;
}

export interface CampanaSerie {
  campana: string;
  lluvia_mm: number;
  balance_mm: number | null;
  tipo: TipoAnio;
}

/** Serie de las 30 campañas (RF24). Describe, no proyecta. */
export interface SerieAnual {
  fuente: string;
  resolucion: string;
  periodo: string;
  campanas: CampanaSerie[];
  ultimas_10_mm: number;
  previas_20_mm: number;
  secos_en_ultimas_10: number;
}

/** Capa del mapa (persona 4). La forma exacta la cierra la persona 1. */
export interface CapaMapa {
  url: string;
  fuente: string;
  resolucion: string;
}

export interface Capas {
  erosion: CapaMapa | null;
  ndvi_mensual: (CapaMapa | null)[];
  agua_regional_mensual: (CapaMapa | null)[] | null;
  heladas_regional_mensual: (CapaMapa | null)[] | null;
  /** Nombres de las capas que no se pudieron armar. */
  no_disponibles: string[];
}

/** Valores de una estrategia. Cada uno es trazable (RF11). */
export interface ValoresEstrategia {
  /** Balance de agua de la campaña en año normal. */
  agua_mm: Indicador;
  meses_cobertura_baja: Indicador;
  aporte_n: Indicador;
  rastrojo: Indicador;
  erosion: Indicador;
  ingreso: Indicador;
  conflictos_helada_calor: Indicador;
}

export interface ValoresTipoAnio {
  agua_mm: number;
  /** Puntajes de ese tipo de año: con ellos el front recalcula la cercanía (RF10, RF13). */
  puntajes: Puntajes;
}

export interface ReglaAplicada {
  regla: string;
  /** Texto con signo: "+30 suelo", "−52 erosión", "= 50 ingreso". */
  efecto: string;
  /** El dato que la disparó. */
  dato: string;
}

export interface Probabilidad {
  evento: "helada" | "siembra_seca" | "calor";
  /** Mes del evento (0 = enero). */
  mes: number;
  cultivo: CultivoCalendario;
  /** Años en que pasó… */
  anios: number;
  /** …de cuántos (30). */
  de: number;
  pct: number;
  /** Plantilla fija: "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)". */
  texto: string;
  fuente: string;
}

interface EstrategiaBase {
  id: IdEstrategia;
  nombre: string;
}

/** Alternativa descartada por una restricción: la columna va en gris con el motivo. */
export interface EstrategiaDescartada extends EstrategiaBase {
  disponible: false;
  /** "No sembrar trigo ni cebada". */
  motivo_descarte: string;
}

export interface EstrategiaDisponible extends EstrategiaBase {
  disponible: true;
  motivo_descarte: null;
  /** PROPUESTO. Cultivos en una línea: "Soja + vicia". */
  descripcion: string;
  /** 12 meses (0 = enero). */
  calendario: CultivoCalendario[];
  valores: ValoresEstrategia;
  /**
   * PROPUESTO. Meses (0 = enero) para la línea de la campaña. `helada`: cultivo
   * sensible en un mes de helada frecuente (mínima < 0 °C en 1 de cada 3 años o más).
   * `calor`: cultivo de verano en un mes con máxima ≥ 35 °C en la mitad de los años
   * o más. Umbrales del prototipo, a confirmar con la persona 3.
   */
  conflictos: { helada: number[]; calor: number[] };
  valores_por_tipo_anio: Record<TipoAnio, ValoresTipoAnio>;
  /**
   * Diferencia de puntaje (0 a 100) contra la actual, en año normal. En la actual,
   * todo 0. Las diferencias en unidades físicas (+5 meses, −60 mm) van en `resumen`.
   * A confirmar con la persona 1.
   */
  diferencia_vs_actual: Puntajes;
  /** Puntaje por objetivo en año normal (= valores_por_tipo_anio.normal.puntajes). */
  cercania_objetivos: Puntajes;
  /** Qué le falta por objetivo; null si ya está al máximo. */
  que_le_falta: Record<Objetivo, string | null>;
  sensible_clima: boolean;
  /** PROPUESTO. Fila "Resumen" (plantilla fija): "Cobertura: +5 meses · Agua: −160 mm en años secos · …". */
  resumen: string;
  /** PROPUESTO. "Por qué aparece" (uno de los 5 puntos). */
  por_que: string[];
  /** PROPUESTO. "Beneficios" (uno de los 5 puntos), en números contra la actual. */
  beneficios: string[];
  reglas_aplicadas: ReglaAplicada[];
  probabilidades: Probabilidad[];
  /** "Evidencia" (uno de los 5 puntos). */
  evidencia: string[];
  /** "Información que falta" (uno de los 5 puntos, RF21). */
  vacios: string[];
  /** "A revisar con el agrónomo" (uno de los 5 puntos). */
  riesgos: string[];
}

export type Estrategia = EstrategiaDisponible | EstrategiaDescartada;

export interface Salida {
  lote: { localidad_aprox: string; pendiente_pct: number | null };
  visto_por_satelite: VistoPorSatelite | null;
  indicadores: Record<string, Indicador>;
  /** Vacío si el productor no cargó mediciones. */
  contraste_mediciones: ContrasteMedicion[];
  clima_celda: ClimaCelda;
  clima_mensual: ClimaMensual;
  tipos_de_anio: TiposDeAnio;
  serie_anual: SerieAnual | null;
  capas: Capas;
  /** Siempre 4, en este orden: actual, A, B, C. */
  estrategias: [Estrategia, Estrategia, Estrategia, Estrategia];
}

export const esDisponible = (e: Estrategia): e is EstrategiaDisponible => e.disponible;
