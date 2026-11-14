/**
 * Formato de números y textos fijos de la hoja de resultados. Puro, sin React.
 * Números con coma decimal y punto de miles (es-AR), y el signo menos tipográfico
 * (−), como el prototipo.
 */
import { ORDEN_CAMPANIA, type CultivoMes, type Salida } from "./contrato";

/** Índice 0 = enero, como los arrays del contrato. */
export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

export const NOMBRE_CULTIVO: Record<CultivoMes, string> = {
  soja: "Soja",
  soja2: "Soja 2ª",
  maiz: "Maíz",
  girasol: "Girasol",
  sorgo: "Sorgo",
  mani: "Maní",
  trigo: "Trigo",
  cebada: "Cebada",
  vicia: "Vicia",
  centeno: "Centeno",
  barbecho: "Barbecho (pelado)",
};

export interface Tramo {
  cultivo: CultivoMes;
  /** Primer y último mes del tramo (0 = enero). */
  desde: number;
  hasta: number;
  meses: number;
}

/** Calendario en tramos, en el orden de la campaña (julio a junio). */
export function tramosCalendario(calendario: readonly CultivoMes[]): Tramo[] {
  const tramos: Tramo[] = [];
  for (const m of ORDEN_CAMPANIA) {
    const cultivo = calendario[m];
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.cultivo === cultivo) {
      ultimo.hasta = m;
      ultimo.meses++;
    } else {
      tramos.push({ cultivo, desde: m, hasta: m, meses: 1 });
    }
  }
  return tramos;
}

/** "jul a oct" o "may" si es un solo mes. */
export function rangoMeses(t: Pick<Tramo, "desde" | "hasta">): string {
  return t.desde === t.hasta ? MESES_CORTOS[t.desde] : `${MESES_CORTOS[t.desde]} a ${MESES_CORTOS[t.hasta]}`;
}

/** Meses sueltos en el orden de la campaña: [0, 11] → "dic, ene". */
export function listaMeses(meses: readonly number[]): string {
  return ORDEN_CAMPANIA.filter((m) => meses.includes(m))
    .map((m) => MESES_CORTOS[m])
    .join(", ");
}

/**
 * Meses con su conteo de años, en orden de campaña:
 * "dic (18 de 30 años), ene (20 de 30 años)". Vacío si no hay meses.
 */
export function mesesConAnios(meses: readonly number[], anios: readonly number[], de: number): string {
  return ORDEN_CAMPANIA.filter((m) => meses.includes(m))
    .map((m) => `${MESES_CORTOS[m]} (${anios[m]} de ${de} años)`)
    .join(", ");
}

/** Efecto de una regla, redondeado: { agua: 20.5 } → "agua 21". Las dimensiones van con su nombre. */
export function textoEfecto(efecto: Record<string, number>): string {
  const nombre: Record<string, string> = { erosion: "erosión" };
  return Object.entries(efecto)
    .map(([k, v]) => `${nombre[k] ?? k} ${v < 0 ? "−" : ""}${fmt(Math.abs(Math.round(v)))}`)
    .join(" · ");
}

/** 1234.5 → "1.235"; con decimales: fmt(0.6, 1) → "0,6". */
export function fmt(n: number, decimales = 0): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Diferencia con signo: +5, −60, 0. */
export function conSigno(n: number, decimales = 0): string {
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return s + fmt(Math.abs(n), decimales);
}

/**
 * Metadatos del encabezado de la hoja: lote, período de clima, pendiente y fecha.
 * "a 17 km de Río Cuarto, Córdoba · Clima NASA POWER 1996/97 a 2025/26 · pendiente 0,6 % · 14/11/2026"
 */
export function metadatosHoja(salida: Salida, fecha: Date): string {
  const partes: string[] = [];
  if (salida.lote.localidad_aprox) partes.push(salida.lote.localidad_aprox);
  partes.push(`Clima NASA POWER ${salida.periodo_clima}`);
  const p = salida.lote.pendiente_pct.valor;
  partes.push(`pendiente ${typeof p === "number" ? `${fmt(p, 1)} %` : "—"}`);
  partes.push(fecha.toLocaleDateString("es-AR"));
  return partes.join(" · ");
}

/**
 * Pie cuando `es_mock` es true. Sirve para los dos casos: el mock del front y
 * la respuesta precalculada de Río Cuarto que el back devuelve si NASA POWER
 * no responde (esa sí son datos de NASA, de otro momento). El detalle lo manda
 * el back como primer ítem de `informacion_falta`.
 */
export const AVISO_PRECALCULADO = "Respuesta precalculada: no se pidió a NASA en este momento (ver «Información que falta»).";

/** "2025-08" → "agosto de 2025". */
export function mesAnio(aaaamm: string): string {
  const [anio, mes] = aaaamm.split("-").map(Number);
  return MESES[mes - 1] ? `${MESES[mes - 1]} de ${anio}` : aaaamm;
}

/**
 * Todo lo que falta en el análisis entero: `informacion_falta` del back más los
 * meses sin escena del satélite (`visto_por_satelite.faltantes`), como pide
 * docs/api-frontend.md (4.8). Sin repetir si el back ya lo puso en la lista.
 */
export function informacionQueFalta(salida: Salida): string[] {
  const satelite = (salida.visto_por_satelite.faltantes ?? []).map(
    (f) => `Satélite sin escena en ${mesAnio(f.mes)}: ${f.motivo}`,
  );
  return [...salida.informacion_falta, ...satelite.filter((t) => !salida.informacion_falta.includes(t))];
}
