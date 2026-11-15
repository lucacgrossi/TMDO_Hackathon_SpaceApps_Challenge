/**
 * Singular o plural de una unidad según el valor (H-017): "1 mes", "2 meses",
 * "−1 mes". Lógica pura, sin React. `null` (sin dato) va en plural.
 */
export function plural(n: number | null | undefined, singular: string, plural: string): string {
  return n != null && Math.abs(n) === 1 ? singular : plural;
}

/** "mes" con 1 o −1; "meses" con cualquier otro valor. */
export const meses = (n: number | null | undefined): string => plural(n, "mes", "meses");
