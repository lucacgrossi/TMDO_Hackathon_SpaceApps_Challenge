"use client";

import { efectoContraste, nombreIndicador } from "@/lib/contraste";
import type { ContrasteMedicion, Salida } from "@/lib/contrato";
import { fmt } from "@/lib/formato";
import PildoraConfianza from "./PildoraConfianza";
import css from "./mediciones.module.css";

/** Sin valor de NASA la fila es "dato del productor" (contrato, `ContrasteMedicion`). */
const esDatoDelProductor = (c: ContrasteMedicion) => c.valor_nasa == null;

/** La fila de la materia orgánica que manda el back, si el productor la cargó. */
export function filaMateriaOrganica(salida: Salida): ContrasteMedicion | undefined {
  return salida.contraste_mediciones.find((c) => c.indicador === "materia_organica");
}

/** Una medición contra NASA: el texto del contraste, la confianza que queda y lo corregido (informativo). */
function FilaContraste({ c }: { c: ContrasteMedicion }) {
  const difiere = c.confianza_resultante === "baja";
  // La etiqueta ya dice "solo informativo": se saca la frase repetida del final de la nota
  const nota = c.corregido_al_lado?.nota.replace(/\s*Solo informativo[^.]*\.?\s*$/i, "");
  return (
    <li className={css.fila} data-difiere={difiere}>
      <span className={css.indicador}>{nombreIndicador(c.indicador)}</span>
      <div className={css.cuerpo}>
        <p className={css.texto}>{c.texto}</p>
        <p className={css.efecto}>
          {/* Solo si baja: si coincide, la confianza queda la que traía el indicador (no siempre "alta") */}
          {difiere && <PildoraConfianza nivel="baja" />}
          {efectoContraste(c)}
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

/** Un dato del productor sin fuente NASA para contrastar (hoy, la materia orgánica). */
function FilaDatoProductor({ c }: { c: ContrasteMedicion }) {
  return (
    <li className={css.fila}>
      <span className={css.indicador}>{nombreIndicador(c.indicador)}</span>
      <div className={css.cuerpo}>
        <p className={css.texto}>
          {fmt(c.valor_productor, 1)} {c.unidad} <span className={css.etiqueta}>dato del productor</span>
        </p>
        <p className={css.efecto}>
          {c.indicador === "materia_organica"
            ? "Se muestra en la fila Suelo. Sin dato de NASA para contrastar y no entra en los puntajes."
            : "Sin dato de NASA para contrastar."}
        </p>
      </div>
    </li>
  );
}

/** Materia orgánica del productor, para la fila Suelo. Sale de la respuesta; nada si no la cargó. */
export function MateriaOrganicaProductor({ salida }: { salida: Salida }) {
  const mo = filaMateriaOrganica(salida);
  if (!mo) return null;
  return (
    <p className={css.datoProductor}>
      <span>
        Materia orgánica <b>{fmt(mo.valor_productor, 1)} %</b>
      </span>
      <span className={css.etiqueta}>dato del productor</span>
    </p>
  );
}

/**
 * Mediciones propias al lado de NASA (RF15, CU4). Va arriba de la tabla, solo si
 * la respuesta trae contrastes. Todo sale de `contraste_mediciones`, así coincide
 * con la comparación que se está mostrando.
 *
 * Desde el MVP 4.3, el contraste ajusta la confianza y, además, el motor mezcla
 * la lluvia y las temperaturas del productor con NASA en los puntajes, con un
 * peso que crece con los años de registro (lo cuenta la evidencia de cada
 * columna). La materia orgánica no puntúa.
 */
export default function ContrasteMediciones({ salida }: { salida: Salida }) {
  const contrastes = salida.contraste_mediciones;
  if (!contrastes.length) return null;
  const hayMedicionesQuePuntuan = contrastes.some((c) => !esDatoDelProductor(c));

  return (
    <section className={css.bloque} aria-labelledby="titulo-mediciones">
      <h3 id="titulo-mediciones" className={css.titulo}>
        Tus mediciones, al lado de NASA
        <span className={css.aclaracion}>
          {hayMedicionesQuePuntuan
            ? "El contraste ajusta la confianza. Tu lluvia, además, se mezcla con NASA en los puntajes según tus años de registro: lo dice la evidencia de cada columna"
            : "Se muestran al lado; no entran en los puntajes"}
        </span>
      </h3>
      <ul className={css.lista}>
        {contrastes.map((c) =>
          esDatoDelProductor(c) ? <FilaDatoProductor key={c.indicador} c={c} /> : <FilaContraste key={c.indicador} c={c} />,
        )}
      </ul>
    </section>
  );
}
