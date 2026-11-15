"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ETIQUETA_TMAX, ETIQUETA_TMIN, type FilaGrafico } from "@/lib/climaHistorico";
import { conSigno, fmt } from "@/lib/formato";
import css from "./GraficoCampania.module.css";

/**
 * Gráfico de la campaña elegida, de julio a junio (S5): lluvia en barras contra
 * la media de 30 años; la máxima más alta y la mínima más baja del mes (extremos
 * de POWER) contra sus medias de 30 años (`maxima_media_c` y `minima_media_c`);
 * el balance de agua aparte. Sin los meses de la campaña, solo la media.
 *
 * Los colores van en hex porque recharts los escribe como atributos SVG, donde
 * `var()` no anda; son los de DESIGN.md. La campaña va en trazo lleno y la
 * media en claro o punteada: el color no es la única señal.
 */
const COLOR = {
  lluvia: "#2C7FB8", // --humedo
  lluviaMedia: "#B9D3E6",
  tmax: "#B42318", // --bad
  tmin: "#1C7C93", // --cielo
  balance: "#8A5A34", // --suelo
  balanceMedia: "#D9C3AE",
  eje: "#5A6560", // --muted
  grilla: "#DCE2D6", // --line
};

type Serie = keyof Omit<FilaGrafico, "mes" | "corto" | "nombre">;

const NOMBRE: Record<Serie, string> = {
  lluvia: "Lluvia de la campaña",
  lluviaMedia: "Lluvia, media de 30 años",
  tmax: ETIQUETA_TMAX,
  tmaxMedia: `${ETIQUETA_TMAX}, media de 30 años`,
  tmin: ETIQUETA_TMIN,
  tminMedia: `${ETIQUETA_TMIN}, media de 30 años`,
  balance: "Balance de la campaña",
  balanceMedia: "Balance, media de 30 años",
};

const UNIDAD: Record<Serie, string> = {
  lluvia: "mm",
  lluviaMedia: "mm",
  tmax: "°C",
  tmaxMedia: "°C",
  tmin: "°C",
  tminMedia: "°C",
  balance: "mm",
  balanceMedia: "mm",
};

/** Tooltip propio: cada valor con su unidad; null dice "sin dato", nunca 0. */
function TooltipMes({ active, payload, series }: { active?: boolean; payload?: { payload?: FilaGrafico }[]; series: Serie[] }) {
  const fila = payload?.[0]?.payload;
  if (!active || !fila) return null;
  return (
    <div className={css.tooltip}>
      <b>{fila.nombre}</b>
      <ul>
        {series.map((s) => {
          const v = fila[s];
          const texto = v == null ? "sin dato" : `${s.startsWith("balance") ? conSigno(v, 1) : fmt(v, 1)} ${UNIDAD[s]}`;
          return (
            <li key={s}>
              {NOMBRE[s]}: {texto}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ejeX = { dataKey: "corto", tick: { fill: COLOR.eje, fontSize: 12 }, stroke: COLOR.grilla };

export default function GraficoCampania({ filas, conCampania }: { filas: FilaGrafico[]; conCampania: boolean }) {
  const seriesArriba: Serie[] = conCampania
    ? ["lluvia", "lluviaMedia", "tmax", "tmaxMedia", "tmin", "tminMedia"]
    : ["lluviaMedia", "tmaxMedia", "tminMedia"];
  const seriesBalance: Serie[] = conCampania ? ["balance", "balanceMedia"] : ["balanceMedia"];

  return (
    <div className={css.grafico}>
      <figure className={css.figura}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLOR.grilla} vertical={false} />
            <XAxis {...ejeX} />
            <YAxis yAxisId="mm" tick={{ fill: COLOR.eje, fontSize: 12 }} stroke={COLOR.grilla} width={60} unit=" mm" />
            <YAxis yAxisId="c" orientation="right" tick={{ fill: COLOR.eje, fontSize: 12 }} stroke={COLOR.grilla} width={44} unit=" °C" />
            <Tooltip content={<TooltipMes series={seriesArriba} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="mm" dataKey="lluviaMedia" name={NOMBRE.lluviaMedia} fill={COLOR.lluviaMedia} isAnimationActive={false} />
            {conCampania && <Bar yAxisId="mm" dataKey="lluvia" name={NOMBRE.lluvia} fill={COLOR.lluvia} isAnimationActive={false} />}
            <Line yAxisId="c" dataKey="tmaxMedia" name={NOMBRE.tmaxMedia} stroke={COLOR.tmax} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            {conCampania && <Line yAxisId="c" dataKey="tmax" name={NOMBRE.tmax} stroke={COLOR.tmax} strokeWidth={2} isAnimationActive={false} />}
            <Line yAxisId="c" dataKey="tminMedia" name={NOMBRE.tminMedia} stroke={COLOR.tmin} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            {conCampania && <Line yAxisId="c" dataKey="tmin" name={NOMBRE.tmin} stroke={COLOR.tmin} strokeWidth={2} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
        <figcaption className={css.pie}>
          {conCampania
            ? "Barras: lluvia del mes de la campaña (oscuro) contra la media de 30 años (claro). Líneas: la máxima más alta y la mínima más baja del mes (llenas) contra su media de 30 años (punteadas)."
            : "Media de 30 años: lluvia en barras; la máxima más alta y la mínima más baja del mes en líneas punteadas."}
        </figcaption>
      </figure>

      <figure className={css.figura}>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={filas} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLOR.grilla} vertical={false} />
            <XAxis {...ejeX} />
            <YAxis tick={{ fill: COLOR.eje, fontSize: 12 }} stroke={COLOR.grilla} width={60} unit=" mm" />
            <ReferenceLine y={0} stroke={COLOR.eje} />
            <Tooltip content={<TooltipMes series={seriesBalance} />} />
            <Bar dataKey="balanceMedia" name={NOMBRE.balanceMedia} fill={COLOR.balanceMedia} isAnimationActive={false} />
            {conCampania && <Bar dataKey="balance" name={NOMBRE.balance} fill={COLOR.balance} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
        <figcaption className={css.pie}>
          Balance de agua del mes (lluvia − ET0 de Hargreaves){conCampania ? ": la campaña (oscuro) contra la media de 30 años (claro)." : ", media de 30 años."}
        </figcaption>
      </figure>
    </div>
  );
}
