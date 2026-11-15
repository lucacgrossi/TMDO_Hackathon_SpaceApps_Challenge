"use client";

import type { Pesos } from "@/lib/cercania";
import type { Salida } from "@/lib/contrato";
import { textoBandaChoque } from "@/lib/rotaciones";
import css from "./ChoqueObjetivos.module.css";

/**
 * Banda de choque de objetivos (RF13, api-frontend §4.11): los dos objetivos
 * con más peso quedan más cerca en alternativas distintas. Muestra el `texto`
 * del back tal cual; si las prioridades se movieron y el choque cambió, el
 * recálculo del cliente (`textoBandaChoque`). Describe; no dice cuál elegir.
 *
 * La región `status` queda siempre montada para que el lector de pantalla
 * anuncie la banda cuando aparece al mover una prioridad.
 */
export default function ChoqueObjetivos({ salida, pesos }: { salida: Salida; pesos: Pesos }) {
  const texto = textoBandaChoque(salida, pesos);
  return (
    <div role="status" className={css.region}>
      {texto && (
        <p className={css.banda}>
          <b className={css.etiqueta}>Objetivos en choque</b> {texto}
        </p>
      )}
    </div>
  );
}
