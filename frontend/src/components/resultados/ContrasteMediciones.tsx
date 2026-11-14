"use client";

import type { ContrasteMedicion, Salida } from "@/lib/contrato";
import { fmt } from "@/lib/formato";
import { useEntradas } from "@/lib/store";
import PildoraConfianza from "./PildoraConfianza";
import css from "./mediciones.module.css";

/** Diferencia con NASA a partir de la cual baja la confianza del agua (RF15). La decide el back. */
const UMBRAL_DIFERENCIA_PCT = 15;

const NOMBRE_INDICADOR: Record<string, string> = { lluvia_anual: "Lluvia anual" };

/** Una medición contra NASA: el texto del contraste, la confianza que queda y lo corregido (informativo). */
function FilaContraste({ c }: { c: ContrasteMedicion }) {
  const difiere = c.confianza_resultante === "baja";
  // La etiqueta ya dice "solo informativo": se saca la frase repetida del final de la nota
  const nota = c.corregido_al_lado?.nota.replace(/\s*Solo informativo[^.]*\.?\s*$/i, "");
  return (
    <li className={css.fila} data-difiere={difiere}>
      <span className={css.indicador}>{NOMBRE_INDICADOR[c.indicador] ?? c.indicador}</span>
      <div className={css.cuerpo}>
        <p className={css.texto}>{c.texto}</p>
        <p className={css.efecto}>
          {/* Solo si baja: si coincide, la confianza queda la que traía el indicador (no siempre "alta") */}
          {difiere && <PildoraConfianza nivel="baja" />}
          {difiere
            ? `Difieren más de ${UMBRAL_DIFERENCIA_PCT} %: confianza baja en los datos de agua. Queda anotado en "A revisar con el agrónomo" de la actual.`
            : `Difieren ${UMBRAL_DIFERENCIA_PCT} % o menos: la confianza del agua no cambia.`}
        </p>
        {nota && (
          <p className={css.informativo}>
            <span className={css.etiqueta}>solo informativo</span>
            {nota}
          </p>
        )}
      </div>
    </li>
  );
}

/** Materia orgánica cargada por el productor, para la fila Suelo. Nada si no la cargó. */
export function MateriaOrganicaProductor() {
  const pct = useEntradas((s) => s.mediciones.materiaOrganicaPct);
  if (pct == null) return null;
  return (
    <p className={css.datoProductor}>
      <span>
        Materia orgánica <b>{fmt(pct, 1)} %</b>
      </span>
      <span className={css.etiqueta}>dato del productor</span>
    </p>
  );
}

/**
 * Mediciones propias al lado de NASA (RF15, CU4). Va arriba de la tabla, solo si
 * el productor cargó el pluviómetro o la materia orgánica. NASA sigue siendo la
 * base: estas mediciones ajustan la confianza y se muestran al lado, pero no
 * cambian ningún puntaje.
 */
export default function ContrasteMediciones({ salida }: { salida: Salida }) {
  const materiaOrganicaPct = useEntradas((s) => s.mediciones.materiaOrganicaPct);
  const contrastes = salida.contraste_mediciones;
  if (!contrastes.length && materiaOrganicaPct == null) return null;

  return (
    <section className={css.bloque} aria-labelledby="titulo-mediciones">
      <h3 id="titulo-mediciones" className={css.titulo}>
        Tus mediciones, al lado de NASA
        <span className={css.aclaracion}>Ajustan la confianza; no cambian ningún puntaje</span>
      </h3>
      <ul className={css.lista}>
        {contrastes.map((c) => (
          <FilaContraste key={c.indicador} c={c} />
        ))}
        {materiaOrganicaPct != null && (
          <li className={css.fila}>
            <span className={css.indicador}>Materia orgánica</span>
            <div className={css.cuerpo}>
              <p className={css.texto}>
                {fmt(materiaOrganicaPct, 1)} % <span className={css.etiqueta}>dato del productor</span>
              </p>
              <p className={css.efecto}>Se muestra en la fila Suelo. Sin dato de NASA para contrastar.</p>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
