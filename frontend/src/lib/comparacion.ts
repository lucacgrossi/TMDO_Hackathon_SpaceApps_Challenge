"use client";

import { create } from "zustand";
import { ENTRADAS_INICIALES, type Entradas, type LatLng } from "./entradas";
import { useEntradas } from "./store";
import { useVista } from "./vista";

/**
 * La FOTO de las entradas del último "Comparar" (persona 5).
 *
 * Por qué: la hoja muestra el resultado de UNA comparación. Si el productor
 * cambia algo en el panel con la hoja abierta (el pluviómetro, "No sembrar"…),
 * la tabla no se rearma sola: queda fija y aparece el aviso de que es de la
 * comparación anterior. Con la API real es lo mismo: el resultado se pide al
 * comparar y no cambia hasta volver a comparar.
 *
 * Los objetivos quedan afuera de este juego: mover las barras recalcula la
 * cercanía en el front sin pedir datos (RF13), así que se leen en vivo.
 */
interface Comparacion {
  /** Entradas al momento de comparar. null = todavía no se comparó. */
  foto: Entradas | null;
  /** Saca una foto nueva de las entradas actuales ("Comparar con los datos nuevos"). */
  volverAComparar: () => void;
}

/** Copia solo los datos de las entradas (sin las acciones del store). */
export function fotoDe(estado: Entradas): Entradas {
  const claves = Object.keys(ENTRADAS_INICIALES) as (keyof Entradas)[];
  return Object.fromEntries(claves.map((k) => [k, estado[k]])) as unknown as Entradas;
}

export const useComparacion = create<Comparacion>()((set) => ({
  foto: null,
  volverAComparar: () => set({ foto: fotoDe(useEntradas.getState()) }),
}));

type EstadoVista = ReturnType<typeof useVista.getState>;

/**
 * Único punto de disparo: ¿este cambio de la vista es un "Comparar"?
 * Hoy, la hoja que pasa de cerrada a abierta (lo que hace el botón "Comparar
 * alternativas"). Si la vista suma otra forma de llegar a los resultados (por
 * ejemplo, una `categoria`), se ajusta solo acá.
 */
export function esComparar(actual: EstadoVista, anterior: EstadoVista): boolean {
  return actual.hojaAbierta && !anterior.hojaAbierta;
}

// Se suscribe una sola vez, al cargar el módulo: la foto se toma en el mismo
// momento en que se abre la hoja, antes de que React la dibuje.
useVista.subscribe((actual, anterior) => {
  if (esComparar(actual, anterior)) useComparacion.getState().volverAComparar();
});

/* ------------------------------------------------------------------ */
/* Qué cambió desde la comparación                                     */
/* ------------------------------------------------------------------ */

/** Grupos de entradas que cambian el resultado. Los objetivos no están (RF13). */
export type GrupoCambio = "lote" | "rotacion" | "restricciones" | "datosLote" | "mediciones";

/** Cómo se nombra cada grupo en "Cambiaste {lista}". */
export const NOMBRE_GRUPO: Record<GrupoCambio, string> = {
  lote: "el lote",
  rotacion: "la rotación",
  restricciones: "las restricciones",
  datosLote: "los datos del lote",
  mediciones: "tus mediciones",
};

const mismoPoligono = (a: readonly LatLng[], b: readonly LatLng[]) =>
  a.length === b.length && a.every(([lat, lng], i) => lat === b[i][0] && lng === b[i][1]);

/** "No sembrar" es un conjunto: el orden en que se marcaron no importa. */
const mismoConjunto = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Valores simples, arrays u objetos chicos (como una serie mensual): se comparan por contenido. */
const mismoValor = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Compara TODAS las claves de los dos objetos (la unión), sin una lista fija:
 * así un campo nuevo de las mediciones (años de registro, la serie de la
 * planilla…) también cuenta como cambio sin tocar esta función.
 */
export function mismosCampos(a: object, b: object): boolean {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const claves = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  return [...claves].every((k) => mismoValor(ra[k], rb[k]));
}

/**
 * Qué grupos de entradas cambiaron entre la foto de la comparación y las
 * entradas actuales, siempre en el mismo orden. Vacío = la hoja está al día.
 */
export function cambiosDesdeLaComparacion(foto: Entradas, actuales: Entradas): GrupoCambio[] {
  const cambios: GrupoCambio[] = [];
  if (foto.modoLote !== actuales.modoLote || !mismoPoligono(foto.poligono, actuales.poligono)) cambios.push("lote");
  if (foto.verano !== actuales.verano || foto.invierno !== actuales.invierno || foto.pasada !== actuales.pasada) {
    cambios.push("rotacion");
  }
  const r = foto.restricciones;
  const ra = actuales.restricciones;
  if (
    r.sinRiego !== ra.sinRiego ||
    r.sinHacienda !== ra.sinHacienda ||
    r.maquinariaLimitada !== ra.maquinariaLimitada ||
    !mismoConjunto(foto.noSembrar, actuales.noSembrar)
  ) {
    cambios.push("restricciones");
  }
  if (foto.anegable !== actuales.anegable || foto.textura !== actuales.textura) cambios.push("datosLote");
  if (!mismosCampos(foto.mediciones, actuales.mediciones)) cambios.push("mediciones");
  return cambios;
}

/** "el lote", "el lote y la rotación", "el lote, la rotación y tus mediciones". */
export function listaDeCambios(cambios: readonly GrupoCambio[]): string {
  const nombres = cambios.map((c) => NOMBRE_GRUPO[c]);
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
