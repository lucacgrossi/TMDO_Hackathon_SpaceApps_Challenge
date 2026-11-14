/**
 * Lo que muestra cada tarjeta de estrategia (vista resumen). Lógica pura, sin
 * React: las métricas con su diferencia frente a la actual, el rango de cada
 * tipo de año, el texto de la probabilidad y las secciones del detalle.
 * Describe; no elige ganador ni marca "mejor" o "peor".
 */
import type { EstrategiaDisponible, Objetivo, Probabilidad, TipoAnio, TiposDeAnio } from "./contrato";
import { conSigno, fmt } from "./formato";

export interface Metrica {
  objetivo: Objetivo;
  etiqueta: string;
  /** Ancho de la barra: puntos de 0 a 100 en año normal. */
  puntos: number;
  /** El valor con signo si es un balance ("−224") o tal cual ("53"). */
  valor: string;
  unidad: string;
  /** "+12 pts", "−118 mm", "igual" o "base" en la propia actual. */
  diferencia: string;
  /** Texto completo para el `title` y los lectores de pantalla. */
  descripcion: string;
}

function diferencia(e: EstrategiaDisponible, valor: number, base: number | undefined, unidad: string): string {
  if (e.id === "actual" || base == null) return "base";
  const d = valor - base;
  return d === 0 ? "igual" : `${conSigno(d)} ${unidad}`;
}

/**
 * Las 4 métricas de la tarjeta. El agua va en mm (balance de la campaña en año
 * normal), que es el valor con unidad; suelo, erosión e ingreso, en puntos de 0
 * a 100 porque es la única unidad que tienen. La barra siempre es en puntos.
 * Sin `actual` (no debería pasar: la actual nunca se descarta) no hay diferencia.
 */
export function metricasTarjeta(e: EstrategiaDisponible, actual: EstrategiaDisponible | null): Metrica[] {
  const a = actual ?? undefined;
  const p = e.puntos;
  const frente = (d: string) => (e.id === "actual" ? "base de la comparación" : d === "igual" ? "igual que la actual" : `${d} frente a la actual`);
  const dAgua = diferencia(e, e.valores.agua_mm, a?.valores.agua_mm, "mm");
  const dSuelo = diferencia(e, p.suelo, a?.puntos.suelo, "pts");
  const dErosion = diferencia(e, p.erosion, a?.puntos.erosion, "pts");
  const dIngreso = diferencia(e, p.ingreso, a?.puntos.ingreso, "pts");
  return [
    {
      objetivo: "agua",
      etiqueta: "Agua",
      puntos: p.agua.normal,
      valor: conSigno(e.valores.agua_mm),
      unidad: "mm",
      diferencia: dAgua,
      descripcion: `Agua: balance de la campaña ${conSigno(e.valores.agua_mm)} mm en año normal (${fmt(p.agua.normal)} de 100 pts), ${frente(dAgua)}`,
    },
    {
      objetivo: "suelo",
      etiqueta: "Suelo",
      puntos: p.suelo,
      valor: fmt(p.suelo),
      unidad: "pts",
      diferencia: dSuelo,
      descripcion: `Suelo: ${fmt(p.suelo)} de 100 pts (aporte de N y rastrojo), ${frente(dSuelo)}`,
    },
    {
      objetivo: "erosion",
      etiqueta: "Erosión",
      puntos: p.erosion,
      valor: fmt(p.erosion),
      unidad: "pts",
      diferencia: dErosion,
      descripcion: `Erosión: ${fmt(p.erosion)} de 100 pts, más puntos es menos riesgo; ${frente(dErosion)}`,
    },
    {
      objetivo: "ingreso",
      etiqueta: "Ingreso",
      puntos: p.ingreso,
      valor: fmt(p.ingreso),
      unidad: "pts",
      diferencia: dIngreso,
      descripcion: `Ingreso: ${fmt(p.ingreso)} de 100 pts, sin precios de mercado; ${frente(dIngreso)}`,
    },
  ];
}

const NOMBRE_PLURAL: Record<TipoAnio, string> = { seco: "Años secos", normal: "Años normales", humedo: "Años húmedos" };

/**
 * Rango de cada tercio, para el `title` del trío:
 * "Años secos: balance de la campaña hasta −300 mm (10 campañas)".
 */
export function rangoTipoAnio(t: TiposDeAnio, tipo: TipoAnio): string {
  const que = t.metodo === "terciles_balance" ? "balance de la campaña" : "lluvia de la campaña";
  const mm = (n: number) => `${t.metodo === "terciles_balance" ? conSigno(n) : fmt(n)} mm`;
  const rango =
    tipo === "seco"
      ? `hasta ${mm(t.umbral_seco_mm)}`
      : tipo === "humedo"
        ? `desde ${mm(t.umbral_humedo_mm)}`
        : `entre ${mm(t.umbral_seco_mm)} y ${mm(t.umbral_humedo_mm)}`;
  const n = t[tipo].length;
  return `${NOMBRE_PLURAL[tipo]}: ${que} ${rango} (${n} ${n === 1 ? "campaña" : "campañas"})`;
}

/**
 * Texto de la probabilidad climatológica (RF25), siempre con el conteo de
 * años. El back ya lo manda armado; si algún día llega sin el conteo, se suma.
 */
export function textoProbabilidad(p: Probabilidad): string {
  if (p.texto.includes(`${p.anios} de ${p.de}`)) return p.texto;
  const base = p.texto.trim().replace(/[.:]$/, "");
  return `${base}: ${p.anios} de ${p.de} años (${fmt(p.pct)} %)`;
}

export interface SeccionDetalle {
  id: "por_que" | "evidencia" | "beneficios" | "vacios" | "riesgos" | "probabilidades";
  titulo: string;
  items: string[];
  /**
   * Solo en las probabilidades: lo que vio la estación del productor para el
   * mismo mes y evento, alineado con `items` (null si no hay). Va al lado; no
   * cambia la probabilidad, que sale de NASA.
   */
  contrastes?: (string | null)[];
  /** Qué se muestra si no hay items: nunca queda vacío ni se inventa. */
  vacio: string;
}

/**
 * El detalle de la tarjeta: los 5 puntos de cada columna, siempre los 5 y en
 * este orden (por qué, evidencia, beneficios, información que falta, a revisar
 * con el agrónomo), más todas las probabilidades de las campañas analizadas.
 */
export function seccionesDetalle(e: EstrategiaDisponible, nAnios: number): SeccionDetalle[] {
  return [
    { id: "por_que", titulo: "Por qué aparece", items: e.por_que, vacio: "—" },
    { id: "evidencia", titulo: "Evidencia", items: e.evidencia, vacio: "—" },
    {
      id: "beneficios",
      titulo: "Beneficios frente a la actual",
      items: e.beneficios,
      vacio: e.id === "actual" ? "Es la base de la comparación" : "Sin valores a favor frente a la actual",
    },
    { id: "vacios", titulo: "Información que falta", items: e.vacios, vacio: "Sin faltantes informados" },
    { id: "riesgos", titulo: "A revisar con el agrónomo", items: e.riesgos, vacio: "Sin alertas" },
    {
      id: "probabilidades",
      titulo: `En las últimas ${nAnios} campañas`,
      items: e.probabilidades.map(textoProbabilidad),
      contrastes: e.probabilidades.map((p) => p.contraste ?? null),
      vacio: "Sin eventos para este calendario",
    },
  ];
}
