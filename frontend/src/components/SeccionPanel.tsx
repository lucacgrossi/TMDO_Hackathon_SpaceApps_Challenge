import type { ReactNode } from "react";

/** Bloque del panel izquierdo con su etiqueta de sección (DESIGN.md: 11 / 700, mayúsculas). */
export default function SeccionPanel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3 first:border-t-0">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-muted">{titulo}</h2>
      {children}
    </section>
  );
}
