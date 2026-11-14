import type { Salida } from "@/lib/contrato";
import InsigniaEstrategia from "./InsigniaEstrategia";
import css from "./resultados.module.css";

/**
 * Provisorio: las 4 columnas con su nombre y su resumen, mientras llegan las
 * tarjetas (feature 7). Se borra cuando estén.
 */
export default function VistaPreviaColumnas({ salida }: { salida: Salida }) {
  return (
    <>
      <div className={css.columnas}>
        {salida.estrategias.map((e) => (
          <article key={e.id} className={css.columna} data-disponible={e.disponible}>
            <div className={css.cabecera}>
              <InsigniaEstrategia id={e.id} />
              <div>
                <div className={css.nombre}>{e.nombre}</div>
                <div className={css.detalle}>
                  {e.disponible ? e.especies : `Descartada · ${e.motivo_descarte}`}
                </div>
              </div>
            </div>
            <p className={css.resumen}>{e.resumen}</p>
          </article>
        ))}
      </div>
      <p className={css.aviso}>Las tarjetas resumen se suman en una próxima entrega.</p>
    </>
  );
}
