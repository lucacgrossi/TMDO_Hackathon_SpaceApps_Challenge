/**
 * Cercanía a los objetivos (RF9, RF13). Lógica pura, sin React: la usan la
 * tabla, las tarjetas y el texto para compartir.
 *
 * Fórmula del contrato (`Puntos` en contrato.py, la del motor `app/motor/reglas.py`):
 *   cercania(tipo) = round(Σ prioridad[o]² · valor[o] / Σ prioridad[o]²)
 * Las prioridades van de 1 a 5 y pesan al cuadrado: una 5 pesa 25 veces una 1
 * (MVP 4.3, RF4). El prototipo (`sc()`) pesaba lineal; ya no.
 * con valor.agua = puntos.agua[tipo]; suelo, erosión e ingreso no cambian con
 * el tipo de año. Se recalcula al mover las barras con los puntos que ya mandó
 * /analizar: nunca se vuelve a pedir datos. No elige ganador.
 */
import {
  OBJETIVOS,
  TIPOS_DE_ANIO,
  esDisponible,
  type Estrategia,
  type IdEstrategia,
  type Objetivo,
  type Prioridades,
  type Puntos,
  type TipoAnio,
} from "./contrato";

/** Barras de 1 a 5 por objetivo (`useEntradas((s) => s.objetivos)`). */
export type Pesos = Prioridades;

/** Diferencia de cercanía entre tipos de año a partir de la cual es "sensible al clima" (prototipo). */
export const UMBRAL_SENSIBLE_PTS = 15;
/** Peso mínimo del segundo objetivo para avisar que dos objetivos chocan (prototipo, `clash`). */
export const PESO_MINIMO_CHOQUE = 4;

/**
 * Redondeo igual al `round()` de Python del backend: los ,5 exactos van al par
 * (50,5 → 50; 51,5 → 52). Con `Math.round` la hoja mostraría 51 donde el back
 * dice 50.
 */
export function redondearComoBackend(x: number): number {
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto > 0.5) return piso + 1;
  if (resto < 0.5) return piso;
  return piso % 2 === 0 ? piso : piso + 1;
}

/** Valor de 0 a 100 de cada objetivo en un tipo de año. */
export function valoresDe(puntos: Puntos, tipo: TipoAnio = "normal"): Record<Objetivo, number> {
  return { agua: puntos.agua[tipo], suelo: puntos.suelo, erosion: puntos.erosion, ingreso: puntos.ingreso };
}

/** Cuánto pesa una prioridad en la cercanía (`EXPONENTE_PRIORIDAD` del motor). */
export const EXPONENTE_PRIORIDAD = 2;

/**
 * Promedio ponderado por las prioridades al cuadrado, redondeado como el back.
 * null si todas las barras están en 0: ya no pasa (van de 1 a 5), queda por las dudas.
 */
export function cercania(puntos: Puntos, pesos: Pesos, tipo: TipoAnio = "normal"): number | null {
  const v = valoresDe(puntos, tipo);
  let peso = 0;
  let total = 0;
  for (const o of OBJETIVOS) {
    const p = pesos[o] ** EXPONENTE_PRIORIDAD;
    peso += p;
    total += p * v[o];
  }
  return peso ? redondearComoBackend(total / peso) : null;
}

/** El trío seco / normal / húmedo. */
export function cercaniaPorTipo(puntos: Puntos, pesos: Pesos): Record<TipoAnio, number | null> {
  const [seco, normal, humedo] = TIPOS_DE_ANIO.map((t) => cercania(puntos, pesos, t));
  return { seco, normal, humedo };
}

/**
 * "Sensible al clima": la cercanía cambia 15 puntos o más entre tipos de año.
 * El prototipo mira húmedo − seco; acá se usa el rango (máximo − mínimo) para
 * no depender de que el año húmedo sea siempre el de mayor cercanía.
 */
export function esSensibleAlClima(porTipo: Record<TipoAnio, number | null>): boolean {
  const vals = TIPOS_DE_ANIO.map((t) => porTipo[t]).filter((v): v is number => v != null);
  return vals.length > 1 && Math.max(...vals) - Math.min(...vals) >= UMBRAL_SENSIBLE_PTS;
}

export interface ChoqueObjetivos {
  /** Los dos objetivos con más peso, en orden. */
  objetivos: [Objetivo, Objetivo];
  /** La alternativa que queda más cerca en cada uno. */
  masCerca: [IdEstrategia, IdEstrategia];
}

/**
 * Dos objetivos importantes (el segundo con 4 o más) que ninguna alternativa
 * cumple a la vez: en cada uno queda más cerca una distinta. Solo mira A, B y C
 * disponibles, en año normal. Es el `clash()` del prototipo; describe, no elige.
 * El backend manda `choque` para las prioridades que recibió; esto lo recalcula
 * al mover las barras.
 */
export function choqueObjetivos(estrategias: readonly Estrategia[], pesos: Pesos): ChoqueObjetivos | null {
  const alternativas = estrategias.filter((e) => e.id !== "actual").filter(esDisponible);
  if (alternativas.length < 2) return null;
  // sort es estable: con pesos iguales queda el orden agua, suelo, erosión, ingreso
  const [o1, o2] = [...OBJETIVOS].sort((a, b) => pesos[b] - pesos[a]);
  if (pesos[o2] < PESO_MINIMO_CHOQUE) return null;
  const masCercaEn = (o: Objetivo) =>
    alternativas.reduce((a, e) => (valoresDe(e.puntos)[o] > valoresDe(a.puntos)[o] ? e : a));
  const e1 = masCercaEn(o1);
  const e2 = masCercaEn(o2);
  if (e1.id === e2.id) return null;
  return { objetivos: [o1, o2], masCerca: [e1.id, e2.id] };
}

/** Nombre de cada objetivo en minúscula, para armar frases. */
const NOMBRE_OBJETIVO: Record<Objetivo, string> = { agua: "agua", suelo: "suelo", erosion: "erosión", ingreso: "ingreso" };

/** "y" o "e": antes de una palabra que suena /i/ ("ingreso", "hidrología") va "e". */
function conjuncion(siguiente: string): string {
  return /^h?i(?![aeiouáéó])/i.test(siguiente) ? "e" : "y";
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Texto fijo del aviso de choque, como el `clash()` del prototipo. Describe
 * qué alternativa queda más cerca en cada objetivo; no dice cuál elegir.
 *   titulo:  "Agua e ingreso chocan en este lote."
 *   detalle: "En agua queda más cerca C; en ingreso, B. Ninguna cumple las dos."
 */
export function textoChoque({ objetivos: [o1, o2], masCerca: [e1, e2] }: ChoqueObjetivos): {
  titulo: string;
  detalle: string;
} {
  const n1 = NOMBRE_OBJETIVO[o1];
  const n2 = NOMBRE_OBJETIVO[o2];
  return {
    titulo: `${mayuscula(n1)} ${conjuncion(n2)} ${n2} chocan en este lote.`,
    detalle: `En ${n1} queda más cerca ${e1}; en ${n2}, ${e2}. Ninguna cumple las dos.`,
  };
}
