/**
 * Tipos y valores iniciales de las ENTRADAS del productor (persona 4).
 *
 * Por qué un solo archivo: las entradas son lo que después viaja a
 * /analizar y lo que lee la persona 5 para armar la hoja. Si cada
 * componente guardara lo suyo, habría que juntarlo a mano al final.
 * Los nombres siguen el contrato propuesto en docs/mvp-alcance.md; la
 * conexión real con el backend se ajusta en la auditoría, no antes.
 *
 * Valores por defecto = los del prototipo final (const S y DEMO).
 */

/** [lat, lng] en grados decimales, como usa Leaflet. */
export type LatLng = [number, number];

export const VERANOS = ["soja", "maiz", "girasol", "sorgo", "mani"] as const;
export const INVIERNOS = ["barbecho", "trigo", "cebada", "vicia", "centeno"] as const;
/** Cultivos que se pueden marcar en "No sembrar" (NOS del prototipo). */
export const NO_SEMBRAR = ["vicia", "centeno", "trigo", "cebada", "sorgo", "girasol"] as const;

export type Verano = (typeof VERANOS)[number];
export type Invierno = (typeof INVIERNOS)[number];
export type CultivoNoSembrar = (typeof NO_SEMBRAR)[number];
export type Objetivo = "agua" | "suelo" | "erosion" | "ingreso";
export type Anegable = "no" | "a_veces" | "si" | "no_se";
export type Textura = "franco" | "arenoso" | "arcilloso" | "no_se";

/** Paso del flujo: "inicio" = paso 1 (formulario centrado), "mapa" = paso 2. */
export type Paso = "inicio" | "mapa";

/** "demo" = lote de ejemplo de Río Cuarto · "dibujo" = el productor marca el suyo. */
export type ModoLote = "demo" | "dibujo";

/** Lugar que eligió el productor con el buscador, el GPS o coordenadas (F4). */
export interface UbicacionElegida {
  lat: number;
  lng: number;
  /** Texto a mostrar: "Alcira Gigena, Córdoba", "tu ubicación actual"… */
  etiqueta: string;
  /** Precisión del GPS en metros, si vino del GPS. */
  precisionM?: number;
}

export interface Entradas {
  paso: Paso;
  modoLote: ModoLote;
  /** Esquinas del lote. Con el modo "demo" es el rectángulo de ejemplo. */
  poligono: LatLng[];
  /** Dónde está el lote según el buscador (F4). El mapa lo usa para centrarse. */
  ubicacion: UbicacionElegida | null;
  verano: Verano;
  invierno: Invierno;
  pasada: Verano;
  /** Barras de 1 a 5 (RF4 del MVP 4.3: el contrato rechaza un 0). */
  objetivos: Record<Objetivo, number>;
  restricciones: { sinRiego: boolean; sinHacienda: boolean; maquinariaLimitada: boolean };
  noSembrar: CultivoNoSembrar[];
  anegable: Anegable;
  textura: Textura;
  /** Mediciones propias (RF15). null = no cargó. */
  mediciones: {
    lluviaAnualMm: number | null;
    /** Años de registro del pluviómetro (entero ≥ 1): el back decide con esto cuánto pesa la lluvia del productor. */
    aniosRegistro: number | null;
    materiaOrganicaPct: number | null;
  };
}

/** Lote de ejemplo: campo real cerca de Río Cuarto, ~95 ha (DEMO del prototipo). */
export const LOTE_DEMO: LatLng[] = [
  [-33.2436, -64.2381],
  [-33.2436, -64.2268],
  [-33.2517, -64.2268],
  [-33.2517, -64.2381],
];

/** Río Cuarto, para "Lote a 17 km de Río Cuarto" (CITY del prototipo). */
export const CIUDAD_REFERENCIA: { nombre: string; punto: LatLng } = {
  nombre: "Río Cuarto",
  punto: [-33.1307, -64.3499],
};

export const ENTRADAS_INICIALES: Entradas = {
  paso: "inicio",
  modoLote: "demo",
  poligono: LOTE_DEMO.map((p) => [...p] as LatLng),
  ubicacion: null,
  verano: "soja",
  invierno: "barbecho",
  pasada: "soja",
  objetivos: { agua: 3, suelo: 3, erosion: 3, ingreso: 3 },
  restricciones: { sinRiego: true, sinHacienda: false, maquinariaLimitada: false },
  noSembrar: [],
  anegable: "no",
  textura: "franco",
  mediciones: { lluviaAnualMm: null, aniosRegistro: null, materiaOrganicaPct: null },
};
