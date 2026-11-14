/**
 * Contrato de POST /analizar: copia en TypeScript de `backend/app/api/contrato.py`
 * (Back 1, PR #27). Es el único archivo del front que depende del backend: si
 * `contrato.py` cambia, se cambia acá en el mismo sentido y TypeScript marca
 * todo lo que hay que ajustar. No agregar campos que el back no mande.
 *
 * Decisiones del contrato (contrato.py):
 * - Todo array de 12 meses va con índice 0 = enero, igual que `useVista().mes`.
 *   La campaña (julio a junio) se dibuja con `ORDEN_CAMPANIA`.
 * - La entrada va en snake_case y el polígono en GeoJSON [lon, lat]; el front
 *   convierte desde su store (`entradas.ts`).
 * - Cada valor de NASA viaja como `Indicador` (unidad, fuente, años, resolución,
 *   confianza y motivo).
 */

// --- Tipos básicos -----------------------------------------------------------

export type Confianza = "alta" | "media" | "baja" | "sin_dato";
export type TipoAnio = "seco" | "normal" | "humedo";
export type Objetivo = "agua" | "suelo" | "erosion" | "ingreso";
export type IdEstrategia = "actual" | "A" | "B" | "C";
export type CultivoVerano = "soja" | "maiz" | "girasol" | "sorgo" | "mani";
export type CultivoInvierno = "barbecho" | "trigo" | "cebada" | "vicia" | "centeno";
export type CultivoNoSembrar = "vicia" | "centeno" | "trigo" | "cebada" | "sorgo" | "girasol";
/** Lo que puede ocupar un mes del calendario. "barbecho" = lote pelado; "soja2" = soja de 2ª. */
export type CultivoMes = CultivoVerano | CultivoInvierno | "soja2";
export type Restriccion = "sin_riego" | "sin_hacienda" | "maquinaria_limitada";

/** Meses en el orden de la campaña: julio (6) a junio (5). */
export const ORDEN_CAMPANIA = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5] as const;
export const OBJETIVOS: readonly Objetivo[] = ["agua", "suelo", "erosion", "ingreso"];
export const TIPOS_DE_ANIO: readonly TipoAnio[] = ["seco", "normal", "humedo"];

/** Un valor con todo lo que hace falta para rastrearlo hasta el dato. */
export interface Indicador {
  valor: number | string | null;
  unidad: string;
  fuente: string;
  /** Período del dato, ej. "1995/96–2024/25". */
  anios: string | null;
  resolucion: string;
  confianza: Confianza;
  /** Por qué falta o por qué la confianza es baja. */
  motivo: string | null;
}

// --- Entrada -----------------------------------------------------------------

export interface PoligonoGeoJSON {
  type: "Polygon";
  /** Coordenadas en [lon, lat]; el primer anillo es el borde del lote y cierra en el primer punto. */
  coordinates: [number, number][][];
}

export interface LoteEntrada {
  tipo: "ejemplo" | "dibujado";
  poligono: PoligonoGeoJSON;
  /** Centroide en [lat, lon]. */
  centro: [number, number];
  /** De 1 a 20.000 ha. */
  area_ha: number;
}

/** Barritas de 0 (nada) a 5 (mucho). Por defecto 3 (RF4). */
export type Prioridades = Record<Objetivo, number>;

export interface MedicionesPropias {
  lluvia_anual_mm: number | null;
  anios_registro: number | null;
  materia_organica_pct: number | null;
}

export interface Entrada {
  lote: LoteEntrada;
  /** = lote.centro[0], por compatibilidad. */
  lat: number;
  /** = lote.centro[1], por compatibilidad. */
  lon: number;
  cultivo_verano: CultivoVerano;
  invierno: CultivoInvierno;
  campana_pasada: CultivoVerano;
  /** Opcional (RF3): pisa al calendario automático. Índice 0 = enero. */
  calendario: CultivoMes[] | null;
  prioridades: Prioridades;
  restricciones: Restriccion[];
  no_sembrar: CultivoNoSembrar[];
  anegable: "si" | "a_veces" | "no" | "no_se";
  textura_suelo: "arenoso" | "franco" | "arcilloso" | "no_se";
  mediciones_propias: MedicionesPropias;
}

// --- Salida: lote, satélite y clima -----------------------------------------

export interface LoteSalida {
  localidad_aprox: string | null;
  area_ha: number;
  pendiente_pct: Indicador;
  cobertura_agricola_pct: Indicador;
}

export interface MesSatelite {
  /** Fecha de la escena, AAAA-MM-DD. */
  fecha: string;
  ndvi_medio: number;
  /** % de nubes de la escena. */
  nubes_escena: number;
  /** "NASA HLS 30 m" o "MODIS 250 m" si cayó al respaldo. */
  fuente: string;
}

/** RF14: NDVI medio del lote en cada mes de la última campaña. */
export interface VistoPorSatelite {
  campana: string | null;
  fuente: string;
  /** 12 meses; null = sin escena ese mes. */
  meses: (MesSatelite | null)[];
  meses_ndvi_bajo: number | null;
  meses_con_dato: number;
  /** NDVI por debajo del cual el mes cuenta como "pelado" (0,3). */
  umbral: number;
  confianza: Confianza;
  motivo: string | null;
}

export interface CorregidoAlLado {
  umbral_seco_mm: number | null;
  nota: string;
}

/** RF15: medición del productor al lado de NASA. No cambia ningún puntaje. */
export interface ContrasteMedicion {
  indicador: string;
  valor_productor: number;
  valor_nasa: number;
  unidad: string;
  diferencia_pct: number;
  confianza_resultante: "alta" | "baja";
  corregido_al_lado: CorregidoAlLado | null;
  texto: string;
}

/** Celda de NASA POWER (0,5° × 0,625°), para dibujarla a la escala real del dato. */
export interface ClimaCelda {
  /** [oeste, sur, este, norte]. */
  bbox: [number, number, number, number];
  posicion_lote: string;
  resolucion: string;
}

/** Climatología de las 30 campañas. Índice 0 = enero. */
export interface ClimaMensual {
  lluvia_mm: number[];
  minima_media_c: number[];
  maxima_media_c: number[];
  et0_mm: (number | null)[];
  balance_mm: (number | null)[];
  anios_con_helada: number[];
  anios_con_35c: number[];
  helada_frecuente: boolean[];
  n_anios: number;
  periodo: string;
  fuente: string;
  resolucion: string;
}

export interface TiposDeAnio {
  metodo: "terciles_balance" | "terciles_lluvia";
  /** Campañas, ej. "2008/09". */
  seco: string[];
  normal: string[];
  humedo: string[];
  /** Valor máximo del tercio seco (de balance o de lluvia, según el método). */
  umbral_seco_mm: number;
  /** Valor mínimo del tercio húmedo. */
  umbral_humedo_mm: number;
}

export interface CampanaSerie {
  campana: string;
  lluvia_mm: number;
  balance_mm: number | null;
  tipo: TipoAnio;
}

/** RF24 (Could): describe, no proyecta. */
export interface SerieAnual {
  fuente: string;
  resolucion: string;
  periodo: string;
  campanas: CampanaSerie[];
  ultimas_10_mm: number;
  previas_20_mm: number;
  secos_en_ultimas_10: number;
}

/** Escena HLS del mes, para armar las teselas sin repetir la búsqueda. */
export interface CapaNdviMes {
  coleccion: string;
  item: string;
  fecha: string;
}

export interface Capas {
  /** Formato a acordar entre Back 2 y Front 1. */
  erosion: Record<string, unknown> | null;
  ndvi_mensual: (CapaNdviMes | null)[];
  agua_regional_mensual: number[] | null;
  heladas_regional_mensual: number[] | null;
  no_disponibles: string[];
}

// --- Salida: las 4 estrategias ----------------------------------------------

export type PorTipo = Record<TipoAnio, number>;

/**
 * Puntos de 0 a 100 por dimensión (RF13). Con esto el front recalcula la
 * cercanía al mover las barritas, sin volver a llamar a la API:
 *   cercania(tipo) = Σ prioridad[o] · valor[o] / Σ prioridad[o]
 * donde valor.agua = agua[tipo] y el resto no cambia con el tipo de año.
 */
export interface Puntos {
  agua: PorTipo;
  suelo: number;
  erosion: number;
  ingreso: number;
}

export interface ConflictosHeladaCalor {
  /** Índices de mes (0 = enero). */
  meses_helada_frecuente: number[];
  /** Helada frecuente con cultivo sensible. */
  meses_conflicto_helada: number[];
  /** Cultivo de verano con ≥ 35 °C en la mitad de los años. */
  meses_calor: number[];
}

export interface Valores {
  /** Balance de agua de la campaña en años normales (mm). */
  agua_mm: number;
  meses_cobertura_baja: number;
  aporte_n: number;
  rastrojo: number;
  erosion: number;
  ingreso: number;
  conflictos_helada_calor: ConflictosHeladaCalor;
}

export interface ValoresTipoAnio {
  /** Balance de agua en ese tipo de año (mm). */
  agua_mm: number;
  lluvia_mm: number;
  uso_mm: number;
  cercania: number | null;
}

export type Diferencia = Record<Objetivo, number>;

export interface ReglaAplicada {
  regla: string;
  /** Cuánto movió cada dimensión, ej. { suelo: 30 }. */
  efecto: Record<string, number>;
  dato: string;
}

/** RF25: frecuencia observada en las 30 campañas. Siempre con el conteo de años. */
export interface Probabilidad {
  evento: "helada" | "siembra_seca" | "calor";
  /** 0 = enero. */
  mes: number;
  cultivo: string;
  anios: number;
  de: number;
  pct: number;
  texto: string;
  fuente: string;
}

export interface Estrategia {
  id: IdEstrategia;
  nombre: string;
  especies: string;
  disponible: boolean;
  motivo_descarte: string | null;
  /** 12 meses, índice 0 = enero. */
  calendario: CultivoMes[] | null;
  resumen: string;
  // Lo siguiente es null cuando la estrategia está descartada (columna en gris).
  valores: Valores | null;
  puntos: Puntos | null;
  valores_por_tipo_anio: Record<TipoAnio, ValoresTipoAnio> | null;
  diferencia_vs_actual: Diferencia | null;
  /** Cercanía en años normales con las prioridades enviadas. */
  cercania: number | null;
  cercania_objetivos: Record<Objetivo, number> | null;
  que_le_falta: string[];
  sensible_clima: boolean;
  reglas_aplicadas: ReglaAplicada[];
  probabilidades: Probabilidad[];
  // Los 5 puntos de cada columna.
  por_que: string[];
  evidencia: string[];
  beneficios: string[];
  /** Información que falta. */
  vacios: string[];
  /** A revisar con el agrónomo. */
  riesgos: string[];
}

/** Una estrategia disponible: todo lo que es null en las descartadas viene con datos. */
export type EstrategiaDisponible = Estrategia & {
  disponible: true;
  calendario: CultivoMes[];
  valores: Valores;
  puntos: Puntos;
  valores_por_tipo_anio: Record<TipoAnio, ValoresTipoAnio>;
  diferencia_vs_actual: Diferencia;
  cercania_objetivos: Record<Objetivo, number>;
};

export const esDisponible = (e: Estrategia): e is EstrategiaDisponible =>
  e.disponible && e.puntos != null && e.valores != null && e.calendario != null;

export interface Choque {
  hay: boolean;
  objetivos: Objetivo[];
  texto: string;
}

export interface Salida {
  lote: LoteSalida;
  visto_por_satelite: VistoPorSatelite;
  indicadores: Record<string, Indicador>;
  contraste_mediciones: ContrasteMedicion[];
  clima_celda: ClimaCelda;
  clima_mensual: ClimaMensual;
  tipos_de_anio: TiposDeAnio;
  serie_anual: SerieAnual | null;
  capas: Capas;
  /** Siempre 4, en este orden: actual, A, B, C. */
  estrategias: [Estrategia, Estrategia, Estrategia, Estrategia];
  choque: Choque;
  periodo_clima: string;
  informacion_falta: string[];
  aviso: string;
  /** true si la respuesta es el mock fijo. */
  es_mock: boolean;
}

/** Respuesta de error con texto para mostrar (422 lote no agrícola, 503 POWER caído). */
export interface ErrorApi {
  mensaje: string;
}
