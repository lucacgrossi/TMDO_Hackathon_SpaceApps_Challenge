"use client";

import type { MouseEvent, ReactNode } from "react";
import { cercania, cercaniaPorTipo, esSensibleAlClima, type Pesos } from "@/lib/cercania";
import { TIPOS_DE_ANIO, esDisponible, type Estrategia, type EstrategiaDisponible, type Salida, type TipoAnio } from "@/lib/contrato";
import { metricasTarjeta, rangoTipoAnio, seccionesDetalle, textoProbabilidad } from "@/lib/tarjeta";
import InsigniaEstrategia from "./InsigniaEstrategia";
import LineaCampania from "./LineaCampania";
import NumeroAnimado from "./NumeroAnimado";
import css from "./tarjetas.module.css";

const NOMBRE_TIPO: Record<TipoAnio, string> = { seco: "Seco", normal: "Normal", humedo: "Húmedo" };

/** Barras de las métricas: los colores fijos de DESIGN.md (identidad de cada métrica, no "mejor" o "peor"). */
const COLOR_METRICA = {
  agua: "var(--s-a)",
  suelo: "#8a5c33",
  erosion: "#c0531c",
  ingreso: "var(--s-b)",
} as const;

interface Props {
  salida: Salida;
  estrategia: Estrategia;
  actual: EstrategiaDisponible | null;
  pesos: Pesos;
  seleccionada: boolean;
  onSeleccionar: () => void;
}

/**
 * Tarjeta de una estrategia (vista resumen), la `.card` del prototipo: badge,
 * nombre y especies; línea de la campaña; las 4 métricas con su valor y la
 * diferencia frente a la actual; la cercanía a los objetivos con el trío por
 * tipo de año (se recalcula con las barras, RF13); y la primera probabilidad
 * climatológica con su conteo de años (RF25).
 *
 * Al seleccionarla se despliega el detalle con los 5 puntos y todas las
 * probabilidades. Se selecciona con un clic en cualquier parte de la tarjeta o
 * con el botón "Ver detalle" (teclado, `aria-pressed`). La cercanía va con
 * menos peso que en el prototipo para que no parezca un ranking.
 */
export default function TarjetaEstrategia({ salida, estrategia: e, actual, pesos, seleccionada, onSeleccionar }: Props) {
  const idNombre = `tarjeta-${e.id}`;

  if (!esDisponible(e)) {
    return (
      <article className={`card off ${css.tarjeta}`} aria-labelledby={idNombre}>
        <Cabecera e={e} idNombre={idNombre}>
          <b>Descartada.</b> {e.motivo_descarte}
        </Cabecera>
      </article>
    );
  }

  const idDetalle = `tarjeta-detalle-${e.id}`;
  const metricas = metricasTarjeta(e, actual);
  const total = cercania(e.puntos, pesos);
  const trio = cercaniaPorTipo(e.puntos, pesos);
  const sensible = esSensibleAlClima(trio);
  const prob = e.probabilidades[0];

  // Clic en cualquier parte de la tarjeta, salvo dentro del detalle o al seleccionar texto
  function alClic(ev: MouseEvent<HTMLElement>) {
    if ((ev.target as HTMLElement).closest(`#${idDetalle}, button`)) return;
    if (window.getSelection()?.toString()) return;
    onSeleccionar();
  }

  return (
    <article
      className={`card ${css.tarjeta}`}
      data-seleccionada={seleccionada}
      aria-labelledby={idNombre}
      onClick={alClic}
    >
      <Cabecera e={e} idNombre={idNombre}>
        {e.especies}
      </Cabecera>

      <LineaCampania salida={salida} estrategia={e} />

      <ul className={css.metricas} aria-label="Métricas de la campaña">
        {metricas.map((m) => (
          <li key={m.objetivo} className={css.metrica} title={m.descripcion}>
            <span className={css.oculto}>{m.descripcion}</span>
            <span className={css.etiqueta} aria-hidden="true">
              {m.etiqueta}
            </span>
            <span className={css.valor} aria-hidden="true">
              {m.valor} <small>{m.unidad}</small>
            </span>
            <span className={css.barra} aria-hidden="true">
              <i style={{ width: `${m.puntos}%`, background: COLOR_METRICA[m.objetivo] }} />
            </span>
            <span className={css.diferencia} aria-hidden="true">
              {m.diferencia}
            </span>
          </li>
        ))}
      </ul>

      <div className={css.cercania}>
        <p className={css.cercaniaTotal}>
          <b className="num">
            <NumeroAnimado valor={total} />
          </b>{" "}
          % de cercanía a tus objetivos <span className={css.suave}>(año normal)</span>
        </p>
        <div className="yrs" role="list" aria-label="Cercanía por tipo de año">
          {TIPOS_DE_ANIO.map((t) => (
            <div key={t} role="listitem" title={rangoTipoAnio(salida.tipos_de_anio, t)}>
              <b className="num">
                <NumeroAnimado valor={trio[t]} />
              </b>
              <span>
                <i className="dot" style={{ background: `var(--${t})` }} aria-hidden="true" />
                {NOMBRE_TIPO[t]}
              </span>
            </div>
          ))}
        </div>
        {sensible && <span className="tagw">Sensible al clima</span>}
      </div>

      {prob && <p className="prob">{textoProbabilidad(prob)}</p>}

      <button
        type="button"
        className={`ghost ${css.botonDetalle}`}
        aria-pressed={seleccionada}
        aria-controls={idDetalle}
        aria-label={`Ver detalle de ${e.nombre}`}
        onClick={onSeleccionar}
      >
        Ver detalle
        <span className={css.chevron} aria-hidden="true">
          ▾
        </span>
      </button>

      <div id={idDetalle} className={`more ${css.detalle}`} hidden={!seleccionada}>
        {seleccionada &&
          seccionesDetalle(e, salida.clima_mensual.n_anios).map((s) => (
            <section key={s.id} aria-labelledby={`${idDetalle}-${s.id}`}>
              <h4 id={`${idDetalle}-${s.id}`}>{s.titulo}</h4>
              {s.items.length ? (
                <ul>
                  {s.items.map((t, i) => (
                    <li key={i}>
                      {t}
                      {/* Lo que vio la estación del productor en ese mes: al lado, no cambia la probabilidad */}
                      {s.contrastes?.[i] && <span className={css.contrasteProb}>{s.contrastes[i]}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{s.vacio}</p>
              )}
            </section>
          ))}
        {seleccionada && prob && <p className={css.fuente}>Fuente: {prob.fuente}</p>}
      </div>
    </article>
  );
}

function Cabecera({ e, idNombre, children }: { e: Estrategia; idNombre: string; children: ReactNode }) {
  return (
    <div className="hd">
      <InsigniaEstrategia id={e.id} />
      <div>
        <h3 id={idNombre} className={`nm ${css.nombre}`}>
          {e.nombre}
        </h3>
        <div className="spc">{children}</div>
      </div>
    </div>
  );
}
