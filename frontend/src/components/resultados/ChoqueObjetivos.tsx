"use client";

import { choqueObjetivos, textoChoque } from "@/lib/cercania";
import type { Estrategia } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import css from "./resultados.module.css";

/**
 * Aviso de que los dos objetivos con más peso chocan (RF13): en cada uno queda
 * más cerca una alternativa distinta. Es el `clash()` del prototipo, con su
 * clase `.clash`. Se recalcula al mover las barras, con los puntos que ya
 * llegaron: no pide datos. Describe; no dice cuál elegir.
 *
 * La región `status` queda siempre montada para que el lector de pantalla
 * anuncie el aviso cuando aparece al mover una barra.
 */
export default function ChoqueObjetivos({ estrategias }: { estrategias: readonly Estrategia[] }) {
  const pesos = useEntradas((s) => s.objetivos);
  const choque = choqueObjetivos(estrategias, pesos);
  const texto = choque && textoChoque(choque);

  return (
    <div role="status">
      {texto && (
        <p className={`clash ${css.choque}`}>
          <b>{texto.titulo}</b> {texto.detalle}
        </p>
      )}
    </div>
  );
}
