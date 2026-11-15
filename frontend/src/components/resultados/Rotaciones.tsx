"use client";

import SeccionObjetivos from "@/components/entradas/SeccionObjetivos";
import type { Salida } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import ChoqueObjetivos from "./ChoqueObjetivos";
import TablaTecnica from "./TablaTecnica";
import TarjetaEstrategia from "./TarjetaEstrategia";
import css from "./Rotaciones.module.css";

/**
 * S6 · Rotaciones (persona 5): las prioridades en línea (el mismo
 * `SeccionObjetivos` del panel, con el mismo estado `useEntradas`), la banda
 * de choque, las 4 cards (actual, A, B, C) y la tabla técnica de 4 columnas.
 * Mover una prioridad recalcula la cercanía en el navegador (RF13): no vuelve
 * a llamar a la API.
 */
export default function Rotaciones({ salida }: { salida: Salida }) {
  const pesos = useEntradas((s) => s.objetivos);

  return (
    <div className={css.rotaciones}>
      <section className={css.prioridades} aria-labelledby="titulo-prioridades">
        <h2 id="titulo-prioridades" className={css.tituloPrioridades}>
          Tus prioridades
        </h2>
        <div className={css.sliders}>
          <SeccionObjetivos />
        </div>
        <p className={css.nota}>
          Mover una prioridad recalcula la cercanía en el navegador (Σ p²·v / Σ p²); no vuelve a consultar a NASA.
        </p>
      </section>

      <ChoqueObjetivos salida={salida} pesos={pesos} />

      <div className={css.cards}>
        {salida.estrategias.map((e) => (
          <TarjetaEstrategia key={e.id} estrategia={e} pesos={pesos} />
        ))}
      </div>

      <section className={css.tabla} aria-labelledby="titulo-tabla-comparativa">
        <h2 id="titulo-tabla-comparativa" className={css.tituloTabla}>
          Tabla comparativa
        </h2>
        <div className={css.desplazable}>
          <TablaTecnica salida={salida} />
        </div>
      </section>
    </div>
  );
}
