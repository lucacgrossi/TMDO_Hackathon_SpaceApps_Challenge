"use client";

import { cercania, cercaniaPorTipo, esSensibleAlClima, type Pesos } from "@/lib/cercania";
import { esDisponible, type Estrategia, type EstrategiaDisponible } from "@/lib/contrato";
import { NOTA_DESCARTADA, balancePorTipo, celdasCalendario, cincoPuntos, textoPelado } from "@/lib/rotaciones";
import InsigniaEstrategia from "./InsigniaEstrategia";
import NumeroAnimado from "./NumeroAnimado";
import css from "./TarjetaEstrategia.module.css";

interface Props {
  estrategia: Estrategia;
  /** Prioridades actuales (1 a 5): la cercanía se recalcula con ellas (RF13). */
  pesos: Pesos;
}

/**
 * Card de una estrategia (DESIGN.md, "Card de estrategia"): badge, nombre y
 * especies; calendario de julio a junio con los meses pelados; cercanía con
 * tus prioridades; balance de agua por tipo de año (S, N, H); "Sensible al
 * clima"; una probabilidad climatológica con su conteo de años; y los 5 puntos
 * plegables. Una descartada queda en gris con el motivo, sin datos.
 * Describe: no marca ganador.
 */
export default function TarjetaEstrategia({ estrategia: e, pesos }: Props) {
  const idNombre = `card-${e.id}`;
  const disponible = esDisponible(e);

  return (
    <article className={css.card} data-id={e.id} data-disponible={disponible} aria-labelledby={idNombre}>
      <header className={css.cabecera}>
        <InsigniaEstrategia id={e.id} descartada={!disponible} />
        <div className={css.titulos}>
          <h3 id={idNombre} className={css.nombre}>
            {e.nombre}
          </h3>
          <p className={css.especies}>{e.especies}</p>
        </div>
      </header>

      {disponible ? (
        <Datos e={e} pesos={pesos} />
      ) : (
        <p className={css.descartada}>
          <b>Descartada.</b> {e.motivo_descarte} {NOTA_DESCARTADA}
        </p>
      )}

      <div className={css.puntos}>
        {cincoPuntos(e).map((p) => (
          <details key={p.id} className={css.punto}>
            <summary className={css.resumen}>
              <span className={css.tituloPunto}>
                {p.titulo}
                <span className={css.cuenta}>{p.items.length}</span>
              </span>
            </summary>
            {p.items.length ? (
              <ul className={css.lista}>
                {p.items.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className={css.vacio}>{p.vacio}</p>
            )}
          </details>
        ))}
      </div>
    </article>
  );
}

function Datos({ e, pesos }: { e: EstrategiaDisponible; pesos: Pesos }) {
  const celdas = celdasCalendario(e.calendario);
  const trio = cercaniaPorTipo(e.puntos, pesos);
  const sensible = esSensibleAlClima(trio);
  const prob = e.probabilidades[0];

  return (
    <>
      <div className={css.bloque}>
        <ol className={css.calendario} aria-label="Calendario de la campaña, de julio a junio">
          {celdas.map((c) => (
            <li key={c.mes} className={css.mes} title={`${c.nombreMes}: ${c.nombreCultivo}`}>
              <span className={css.celda} data-grupo={c.grupo} aria-hidden="true" />
              <span className={css.inicial} aria-hidden="true">
                {c.inicial}
              </span>
              <span className={css.oculto}>
                {c.nombreMes}: {c.nombreCultivo}
              </span>
            </li>
          ))}
        </ol>
        <p className={css.pelado}>{textoPelado(e.valores.meses_cobertura_baja)}</p>
      </div>

      <p className={css.cercania}>
        <span className={css.numeroGrande}>
          <NumeroAnimado valor={cercania(e.puntos, pesos)} /> %
        </span>
        <span className={css.pie}>cercanía con tus prioridades, año normal</span>
      </p>

      <div className={css.bloque}>
        <p className={css.etiqueta}>Balance de agua de la rotación</p>
        <dl className={css.balance}>
          {balancePorTipo(e).map((b) => (
            <div key={b.tipo} className={css.filaBalance}>
              <dt>
                <span className={css.cuadro} data-tipo={b.tipo} aria-hidden="true" />
                {b.letra} · {b.nombre}
              </dt>
              <dd>{b.valor}</dd>
            </div>
          ))}
        </dl>
        {sensible && <p className={css.sensible}>Sensible al clima</p>}
      </div>

      {prob ? (
        <div className={css.probabilidad}>
          <p>{prob.texto}</p>
          {prob.contraste && <p className={css.contraste}>{prob.contraste}</p>}
          <p className={css.pie}>{prob.fuente}</p>
        </div>
      ) : (
        <p className={css.vacio}>Sin eventos climáticos para este calendario</p>
      )}
    </>
  );
}
