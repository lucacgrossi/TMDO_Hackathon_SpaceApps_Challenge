"use client";

import { useState, type KeyboardEvent } from "react";
import { TIPOS_DE_ANIO, type Salida } from "@/lib/contrato";
import { fmt, conSigno } from "@/lib/formato";
import { barrasSerie, conteoTercios, NOMBRE_TERCIO, textosSerie, type BarraSerie } from "@/lib/serie";
import css from "./serie.module.css";

/**
 * Serie de lluvia por campaña (RF24, Could), arriba de la tabla y de las
 * tarjetas, como en el prototipo (`serieHTML`).
 *
 * A la izquierda, el texto: promedio de las últimas 10 contra las previas,
 * cuántas de las últimas 10 cayeron en el tercio seco y la fuente. A la
 * derecha, una barra por campaña: el alto es la lluvia (base en 0 mm) y el
 * color, el tercio que manda el back. Las últimas 10 van recuadradas.
 *
 * El tercio no queda solo en el color: va en la etiqueta de cada barra (mouse,
 * foco y lector de pantalla), en la leyenda con su conteo y en la tabla.
 * Si el back no manda la serie (`serie_anual: null`), no se dibuja nada: lo
 * que falte lo dice "Información que falta", si el back lo manda.
 */
export default function SerieCampanias({ salida }: { salida: Salida }) {
  const serie = salida.serie_anual;
  const [activa, setActiva] = useState<number | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  if (!serie || serie.campanas.length === 0) return null;

  const barras = barrasSerie(serie);
  const textos = textosSerie(serie, salida.tipos_de_anio.metodo);
  const conteo = conteoTercios(serie);
  const n = barras.length;
  const previas = barras.filter((b) => !b.reciente);
  const recientes = barras.filter((b) => b.reciente);
  // Una sola parada de tabulación: la barra con foco, o la última campaña
  const tabulable = foco ?? n - 1;

  function mover(e: KeyboardEvent<HTMLDivElement>) {
    const desde = foco ?? n - 1;
    const destino =
      e.key === "ArrowRight" ? Math.min(desde + 1, n - 1)
      : e.key === "ArrowLeft" ? Math.max(desde - 1, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (destino == null) return;
    e.preventDefault();
    setFoco(destino);
    setActiva(destino);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-i="${destino}"]`)?.focus();
  }

  const barra = (b: BarraSerie, i: number) => (
    <button
      key={b.campana}
      type="button"
      data-i={i}
      data-tipo={b.tipo}
      className={`${css.barra}${activa === i ? ` ${css.activa}` : ""}`}
      tabIndex={i === tabulable ? 0 : -1}
      aria-label={b.texto}
      title={b.texto}
      onMouseEnter={() => setActiva(i)}
      onFocus={() => {
        setFoco(i);
        setActiva(i);
      }}
      onClick={() => setActiva(i)}
    >
      <i style={{ height: `${Math.max(b.alto * 100, 4)}%`, background: `var(--${b.tipo})` }} />
    </button>
  );

  const lectura = activa == null ? null : barras[activa];

  return (
    <section className={css.serie} aria-labelledby="serie-titulo">
      <div className={css.textos}>
        <b id="serie-titulo">{textos.titulo}</b>
        <span className={css.dato}>{textos.promedios}</span>
        <span>{textos.secos}</span>
        <span className={css.fuente}>{textos.fuente}</span>
      </div>

      <div className={css.grafico}>
        <div
          className={css.barras}
          role="group"
          aria-label={`${textos.titulo}, de ${barras[0].campana} a ${barras[n - 1].campana}. Flechas para recorrer las campañas.`}
          onKeyDown={mover}
          onMouseLeave={() => setActiva(foco)}
        >
          <div className={css.grupo} style={{ flex: previas.length }}>
            {previas.map((b, j) => barra(b, j))}
          </div>
          {recientes.length > 0 && (
            <div className={`${css.grupo} ${css.recientes}`} style={{ flex: recientes.length }}>
              {recientes.map((b, j) => barra(b, previas.length + j))}
            </div>
          )}
        </div>
        <div className={css.eje} aria-hidden="true">
          {previas.length > 0 && <span style={{ flex: previas.length }}>{barras[0].campana}</span>}
          <span style={{ flex: recientes.length }}>
            últimas {recientes.length} · {barras[n - 1].campana}
          </span>
        </div>

        {/* Valor exacto de la barra con el mouse o el foco. El lector de pantalla ya lo lee en la barra. */}
        <p className={css.lectura} aria-hidden="true">
          {lectura ? lectura.texto : "Pasá el mouse o usá las flechas para ver cada campaña."}
        </p>

        <div className={css.leyenda}>
          {TIPOS_DE_ANIO.map((t) => (
            <span key={t}>
              <i className={css.muestra} data-tipo={t} style={{ background: `var(--${t})` }} aria-hidden="true" />
              Tercio {NOMBRE_TERCIO[t]} ({conteo[t]})
            </span>
          ))}
          <span>
            <i className={css.muestraRecuadro} aria-hidden="true" />
            Recuadro: últimas {recientes.length}
          </span>
          <span>{textos.criterio}</span>
        </div>

        <details className={css.detalle}>
          <summary>Ver las {n} campañas en una tabla</summary>
          <table className={css.tabla}>
            <thead>
              <tr>
                <th scope="col">Campaña</th>
                <th scope="col">Lluvia (mm)</th>
                <th scope="col">Balance (mm)</th>
                <th scope="col">Tercio</th>
              </tr>
            </thead>
            <tbody>
              {barras.map((b) => (
                <tr key={b.campana} data-reciente={b.reciente || undefined}>
                  <th scope="row">{b.campana}</th>
                  <td>{fmt(b.lluvia_mm)}</td>
                  <td>{b.balance_mm == null ? "—" : conSigno(b.balance_mm)}</td>
                  <td>{NOMBRE_TERCIO[b.tipo]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
