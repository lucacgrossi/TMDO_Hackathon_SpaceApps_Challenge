import type { ReactNode } from "react";
import { TEXTO_PRECALCULADO, type ParFicha } from "@/lib/dashboard";
import css from "./Encabezado.module.css";

interface Props {
  /** Id del H1, para que la sección se rotule con él. */
  id: string;
  titulo: string;
  /** Superficie, Campaña satelital, Clima y Tus mediciones (`fichaDelLote`). */
  ficha: readonly ParFicha[];
  /** `Salida.es_mock`: la respuesta es la demo precalculada. */
  esMock: boolean;
  /** Acción a la derecha del título (por ejemplo, "Exportar PDF" en Rotaciones). */
  accion?: ReactNode;
}

/**
 * Encabezado del dashboard: título de la sección y la ficha del lote como
 * pares etiqueta/valor, leídos de la respuesta sin calcular nada.
 */
export default function Encabezado({ id, titulo, ficha, esMock, accion }: Props) {
  return (
    <header className={css.encabezado}>
      <div className={css.texto}>
        <h1 id={id} className={css.titulo}>
          {titulo}
        </h1>
        <dl className={css.ficha}>
          {ficha.map((p) => (
            <div key={p.etiqueta} className={css.par}>
              <dt className={css.etiqueta}>{p.etiqueta}</dt>
              <dd className={css.valor}>{p.valor}</dd>
            </div>
          ))}
        </dl>
        {esMock && <p className={css.precalculado}>{TEXTO_PRECALCULADO}</p>}
      </div>
      {accion && <div className={css.accion}>{accion}</div>}
    </header>
  );
}
