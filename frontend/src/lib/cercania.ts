/**
 * Cercanía a los objetivos (RF9, RF13). Lógica pura, sin React: la usan la
 * tabla, las tarjetas y el texto para compartir.
 *
 * La cercanía es el promedio de los puntajes (0 a 100) de cada objetivo,
 * ponderado por las barras del productor (0 a 5). Es el `sc()` del prototipo.
 * Se recalcula al mover las barras con los puntajes que ya mandó /analizar:
 * nunca se vuelve a pedir datos. No elige ganador.
 */
import type { Objetivo } from "./entradas";
import {
  OBJETIVOS,
  TIPOS_DE_ANIO,
  esDisponible,
  type Estrategia,
  type EstrategiaDisponible,
  type IdEstrategia,
  type Puntajes,
  type TipoAnio,
} from "./contrato";

/** Barras de 0 a 5 por objetivo (`useEntradas((s) => s.objetivos)`). */
export type Pesos = Record<Objetivo, number>;

/** Diferencia de cercanía entre tipos de año a partir de la cual es "sensible al clima" (prototipo). */
export const UMBRAL_SENSIBLE_PTS = 15;
/** Peso mínimo del segundo objetivo para avisar que dos objetivos chocan (prototipo, `clash`). */
export const PESO_MINIMO_CHOQUE = 4;

/** Promedio ponderado, redondeado. null si todas las barras están en 0 (no hay nada que comparar). */
export function cercania(puntajes: Puntajes, pesos: Pesos): number | null {
  let peso = 0;
  let total = 0;
  for (const o of OBJETIVOS) {
    peso += pesos[o];
    total += pesos[o] * puntajes[o];
  }
  return peso ? Math.round(total / peso) : null;
}

/** Cercanía de una estrategia en un tipo de año (por defecto, normal). */
export function cercaniaEstrategia(
  e: EstrategiaDisponible,
  pesos: Pesos,
  tipo: TipoAnio = "normal",
): number | null {
  return cercania(e.valores_por_tipo_anio[tipo].puntajes, pesos);
}

/** El trío seco / normal / húmedo de una estrategia. */
export function cercaniaPorTipo(e: EstrategiaDisponible, pesos: Pesos): Record<TipoAnio, number | null> {
  const [seco, normal, humedo] = TIPOS_DE_ANIO.map((t) => cercaniaEstrategia(e, pesos, t));
  return { seco, normal, humedo };
}

/**
 * "Sensible al clima": la cercanía cambia 15 puntos o más entre tipos de año.
 * El prototipo mira húmedo − seco; acá se usa el rango (máximo − mínimo) para
 * no depender de que el año húmedo sea siempre el de mayor cercanía. Con los
 * datos actuales da lo mismo. El mock calcula `sensible_clima` con esta misma regla.
 */
export function esSensibleAlClima(porTipo: Record<TipoAnio, number | null>): boolean {
  const vals = TIPOS_DE_ANIO.map((t) => porTipo[t]).filter((v): v is number => v != null);
  return vals.length > 1 && Math.max(...vals) - Math.min(...vals) >= UMBRAL_SENSIBLE_PTS;
}

export interface Choque {
  /** Los dos objetivos con más peso, en orden. */
  objetivos: [Objetivo, Objetivo];
  /** La alternativa que queda más cerca en cada uno. */
  masCerca: [IdEstrategia, IdEstrategia];
}

/**
 * Dos objetivos importantes (el segundo con 4 o más) que ninguna alternativa
 * cumple a la vez: en cada uno queda más cerca una distinta. Solo mira A, B y C
 * disponibles. Es el `clash()` del prototipo; describe, no elige.
 */
export function choqueObjetivos(estrategias: readonly Estrategia[], pesos: Pesos): Choque | null {
  const alternativas = estrategias.filter((e) => e.id !== "actual").filter(esDisponible);
  if (alternativas.length < 2) return null;
  // sort es estable: con pesos iguales queda el orden agua, suelo, erosión, ingreso
  const [o1, o2] = [...OBJETIVOS].sort((a, b) => pesos[b] - pesos[a]);
  if (pesos[o2] < PESO_MINIMO_CHOQUE) return null;
  const masCercaEn = (o: Objetivo) =>
    alternativas.reduce((a, e) => (e.cercania_objetivos[o] > a.cercania_objetivos[o] ? e : a));
  const e1 = masCercaEn(o1);
  const e2 = masCercaEn(o2);
  if (e1.id === e2.id) return null;
  return { objetivos: [o1, o2], masCerca: [e1.id, e2.id] };
}
