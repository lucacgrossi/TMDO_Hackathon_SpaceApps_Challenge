/**
 * Formato de números y textos fijos de la hoja de resultados. Puro, sin React.
 * Números con coma decimal y punto de miles (es-AR), y el signo menos tipográfico
 * (−), como el prototipo.
 */
import type { Salida } from "./contrato";

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
 * "a 17 km de Río Cuarto, Córdoba · Clima NASA POWER 1995/96–2024/25 · pendiente 0,6 % · 14/11/2026"
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
