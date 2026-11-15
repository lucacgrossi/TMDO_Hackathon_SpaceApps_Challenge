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

/** Signo menos tipográfico (−) en vez del guion que pone `toLocaleString`; "-0" queda "0". */
function conMenos(texto: string): string {
  if (!texto.startsWith("-")) return texto;
  const resto = texto.slice(1);
  return /^[0,]+$/.test(resto) ? resto : `−${resto}`;
}

/** 1234.5 → "1.235"; con decimales: fmt(0.6, 1) → "0,6"; fmt(-15) → "−15". */
export function fmt(n: number, decimales = 0): string {
  return conMenos(n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
}

/** Hasta `decimales`, sin ceros de relleno: fmtHasta(0.6, 2) → "0,6"; fmtHasta(-1.25, 1) → "−1,3". */
export function fmtHasta(n: number, decimales: number): string {
  return conMenos(n.toLocaleString("es-AR", { maximumFractionDigits: decimales }));
}

/** NDVI siempre con 2 decimales, igual en la leyenda, la línea de tiempo y el inspector: 0.2 → "0,20". */
export function fmtNdvi(n: number): string {
  return fmt(n, 2);
}

/**
 * Resolución de una capa para el pie de la leyenda, sin repetir la de la fuente
 * ni anidar paréntesis. La grilla viene como "1″ (~30 m)":
 * - ("NASA HLS L30 · 30 m", "30 m", "1″ (~30 m)") → "grilla de 1″" (la fuente ya dice 30 m)
 * - ("NASADEM", "30 m", "1″ (~30 m)") → "30 m, grilla de 1″"
 * - ("ESA WorldCover", "10 m (moda a 30 m)", "1″ (~30 m)") → "10 m (moda a 30 m), grilla de 1″ (~30 m)"
 */
export function textoResolucion(fuente: string, nativa: string, grilla: string): string {
  const m = /^(.*?)\s*\(~\s*(.+?)\)\s*$/.exec(grilla);
  const base = m ? m[1] : grilla;
  const aprox = m ? m[2] : null;
  const partes: string[] = [];
  if (nativa && !fuente.includes(nativa)) partes.push(nativa);
  if (base) partes.push(aprox && aprox !== nativa ? `grilla de ${base} (~${aprox})` : `grilla de ${base}`);
  return partes.join(", ");
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

