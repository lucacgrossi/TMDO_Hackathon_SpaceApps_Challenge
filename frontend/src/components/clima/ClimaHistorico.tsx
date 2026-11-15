"use client";

import { useMemo, useState } from "react";
import ContrasteMediciones from "@/components/resultados/ContrasteMediciones";
import { campanaInicial, elegirCampana, seleccionCampanas } from "@/lib/campanaClima";
import { datosGrafico, fichaCampana } from "@/lib/climaHistorico";
import type { Salida } from "@/lib/contrato";
import { NOMBRE_TERCIO } from "@/lib/serie";
import css from "./ClimaHistorico.module.css";
import GraficoCampania from "./GraficoCampania";
import HeladasCalor from "./HeladasCalor";
import SelectorCampanias from "./SelectorCampanias";

/**
 * Sección Clima histórico del dashboard (S5, RF24): el selector de las 30
 * campañas, el gráfico de la campaña elegida contra la media de 30 años, su
 * ficha, heladas y calor por mes, y el contraste con las mediciones del
 * productor. Autocontenida: recibe la respuesta de /analizar por props (la
 * monta el `Dashboard` de la persona 5).
 *
 * Si la respuesta no trae `serie_anual.campanas[i].mensual`, el gráfico muestra
 * la media de 30 años (`clima_mensual`) y el selector queda deshabilitado con el motivo.
 */
export default function ClimaHistorico({ salida }: { salida: Salida }) {
  const serie = salida.serie_anual;
  const clima = salida.clima_mensual;
  const [campana, setCampana] = useState<string | null>(() => campanaInicial(serie));

  const seleccion = useMemo(() => seleccionCampanas(serie), [serie]);
  const elegida = seleccion.habilitada ? elegirCampana(serie, campana) : null;
  const filas = useMemo(() => datosGrafico(clima, elegida), [clima, elegida]);
  const ficha = fichaCampana(salida, elegida);
  const conCampania = elegida?.mensual != null;
  const n = serie?.campanas.length ?? clima.n_anios;

  return (
    <div className={css.seccion}>
      <section className={css.panel} aria-labelledby="campanias-titulo">
        <h2 id="campanias-titulo" className={css.h2}>
          {n} campañas de agua
        </h2>
        <p className={css.pie}>
          {serie ? `${serie.fuente}, ${serie.resolucion}, ${serie.periodo}` : `${clima.fuente}, ${clima.resolucion}, ${clima.periodo}`}, de julio a junio.
          Una franja por campaña: más intensa, más lejos de lo común en{" "}
          {salida.tipos_de_anio.metodo === "terciles_balance" ? "balance de agua" : "lluvia"}. La letra es su tercio: S seco, N normal, H
          húmedo.{seleccion.habilitada && " Elegí una campaña para ver sus meses."}
        </p>
        {serie ? (
          <SelectorCampanias
            serie={serie}
            elegida={elegida?.campana ?? null}
            habilitada={seleccion.habilitada}
            motivo={seleccion.motivo}
            onElegir={setCampana}
          />
        ) : (
          <p className={css.aviso}>{seleccion.motivo}</p>
        )}
      </section>

      <div className={css.grilla}>
        <section className={css.panel} aria-labelledby="campania-titulo">
          <h3 id="campania-titulo" className={css.h3}>
            {elegida ? elegida.titulo : `Media de ${clima.n_anios} campañas (${clima.periodo})`}
          </h3>
          <GraficoCampania filas={filas} conCampania={conCampania} />
        </section>
        <aside className={css.panel} aria-labelledby="ficha-campania-titulo">
          <h3 id="ficha-campania-titulo" className={css.h3}>
            {elegida ? `Campaña ${elegida.campana}` : `Media de ${clima.n_anios} campañas`}
          </h3>
          {elegida && (
            <p className={css.tercio} data-tipo={elegida.tipo}>
              <i aria-hidden="true" />
              Tercio {NOMBRE_TERCIO[elegida.tipo]} ({elegida.letra})
            </p>
          )}
          <dl className={css.ficha}>
            {ficha.map((f) => (
              <div key={f.etiqueta} className={css.fila}>
                <dt className={css.etiqueta}>{f.etiqueta}</dt>
                <dd className={f.valor === "sin dato" ? css.sinDato : css.valor}>{f.valor}</dd>
                <dd className={css.pie}>{f.pie}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <HeladasCalor clima={clima} />

      <section className={css.panel} aria-label="Tus mediciones contra NASA">
        {salida.contraste_mediciones.length ? (
          <ContrasteMediciones salida={salida} />
        ) : (
          <>
            <h3 className={css.h3}>Tus mediciones, al lado de NASA</h3>
            <p className={css.pie}>
              Sin mediciones cargadas. Si subís tu planilla de lluvia y temperaturas, tus datos se comparan acá al lado de NASA, en las mismas campañas.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
