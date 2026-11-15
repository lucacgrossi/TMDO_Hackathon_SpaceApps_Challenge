import PildoraConfianza from "@/components/resultados/PildoraConfianza";
import type { FilaFicha } from "@/lib/capasLote";
import css from "./FichaLote.module.css";

/**
 * Ficha técnica del lote (S4): 6 filas (no tarjetas) con valor, confianza,
 * fuente y resolución. Los textos del back van tal cual; lo que falta dice
 * "sin dato", nunca cero.
 */
export default function FichaLote({ filas }: { filas: FilaFicha[] }) {
  return (
    <aside className={css.ficha} aria-labelledby="ficha-lote-titulo">
      <h3 id="ficha-lote-titulo" className={css.titulo}>
        Ficha técnica del lote
      </h3>
      <p className={css.pie}>Cada valor con su fuente, resolución y confianza.</p>
      <dl className={css.filas}>
        {filas.map((f) => (
          <div key={f.etiqueta} className={css.fila}>
            <dt className={css.etiqueta}>{f.etiqueta}</dt>
            <dd className={css.dato}>
              <span className={f.confianza === "sin_dato" ? css.sinDato : css.valor}>{f.valor}</span>
              <PildoraConfianza nivel={f.confianza} motivo={f.nota} />
            </dd>
            {f.fuente && <dd className={css.pie}>{f.fuente}.</dd>}
            {f.nota && <dd className={css.pie}>{f.nota}</dd>}
          </div>
        ))}
      </dl>
    </aside>
  );
}
