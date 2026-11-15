"use client";

/**
 * F8 · Datos del lote: ¿se encharca? y textura (RF6, RF7).
 *
 * Sale del prototipo final: el acordeón `details data-a="dl"` con dos
 * selects en `.sel3`. Son datos opcionales que afinan las reglas (por
 * ejemplo, vicia en un lote que se encharca va a "Revisar con el
 * agrónomo") y "No sé" manda el dato a "Información que falta".
 * `details`/`summary` es el acordeón nativo del navegador: abre y cierra
 * solo, con teclado, sin estado en React.
 */
import { useEntradas } from "@/lib/store";
import type { Anegable, Textura } from "@/lib/entradas";
import estilos from "./Campos.module.css";

const ANEGABLE: { v: Anegable; n: string }[] = [
  { v: "no", n: "No" },
  { v: "a_veces", n: "A veces" },
  { v: "si", n: "Sí" },
  { v: "no_se", n: "No sé" },
];

const TEXTURA: { v: Textura; n: string }[] = [
  { v: "franco", n: "Franco" },
  { v: "arenoso", n: "Arenoso" },
  { v: "arcilloso", n: "Arcilloso" },
  { v: "no_se", n: "No sé" },
];

export default function SeccionDatosLote() {
  const anegable = useEntradas((s) => s.anegable);
  const textura = useEntradas((s) => s.textura);
  const cambiar = useEntradas((s) => s.cambiar);

  return (
    <div className={estilos.grilla}>
        <label className={estilos.campo}>
          ¿Se encharca?
          <select
            className={estilos.control}
            id="anegable"
            value={anegable}
            onChange={(e) => cambiar({ anegable: e.target.value as Anegable })}
          >
            {ANEGABLE.map((o) => (
              <option key={o.v} value={o.v}>
                {o.n}
              </option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          Textura
          <select
            className={estilos.control}
            id="textura"
            value={textura}
            onChange={(e) => cambiar({ textura: e.target.value as Textura })}
          >
            {TEXTURA.map((o) => (
              <option key={o.v} value={o.v}>
                {o.n}
              </option>
            ))}
          </select>
        </label>
    </div>
  );
}
