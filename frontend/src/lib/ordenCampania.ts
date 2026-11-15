/**
 * Orden de campaña (julio a junio) para los arrays de 12 meses del contrato,
 * que vienen con índice 0 = enero. Puro, sin React.
 *
 * Lo usan la línea de tiempo del mapa, el gráfico de la campaña y la tabla de
 * heladas y calor: todos muestran julio primero y junio al final, pero leen el
 * dato con el índice del contrato (`mes`), que también es el de `useVista().mes`.
 */
import { ORDEN_CAMPANIA } from "./contrato";
import { MESES, MESES_CORTOS } from "./formato";

export interface MesCampania<T> {
  /** Índice del contrato: 0 = enero … 11 = diciembre. */
  mes: number;
  /** Posición en la campaña: 0 = julio … 11 = junio. */
  posicion: number;
  /** "jul" */
  corto: string;
  /** "julio" */
  nombre: string;
  /** El valor de ese mes, o null si el array no lo trae. */
  valor: T | null;
}

/**
 * Los 12 meses de un array del contrato en orden de campaña.
 * Si el array es más corto, los meses que faltan quedan con `valor: null`
 * (nunca con un cero inventado).
 */
export function mesesCampania<T>(porMes: readonly (T | null | undefined)[]): MesCampania<T>[] {
  return ORDEN_CAMPANIA.map((mes, posicion) => ({
    mes,
    posicion,
    corto: MESES_CORTOS[mes],
    nombre: MESES[mes],
    valor: porMes[mes] ?? null,
  }));
}

/** Solo los valores, en orden de campaña: [ene … dic] → [jul … jun]. */
export function enOrdenCampania<T>(porMes: readonly (T | null | undefined)[]): (T | null)[] {
  return ORDEN_CAMPANIA.map((mes) => porMes[mes] ?? null);
}
