"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  tmax: `${ETIQUETA_TMAX}, de la campaña`,
  tmaxMedia: `${ETIQUETA_TMAX}, media de 30 años`,
  tmin: `${ETIQUETA_TMIN}, de la campaña`,
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

/** Muestra de la leyenda: barra (cuadrado), línea llena con punto (la campaña) o punteada (la media). */
function Muestra({ tipo, color }: { tipo: "barra" | "llena" | "punteada"; color: string }) {
  return (
    <svg className={css.muestra} width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
      {tipo === "barra" && <rect x="8" y="0" width="12" height="12" fill={color} />}
      {tipo === "llena" && (
        <>
          <line x1="0" y1="6" x2="28" y2="6" stroke={color} strokeWidth="2" />
          <circle cx="14" cy="6" r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
        </>
      )}
      {tipo === "punteada" && <line x1="0" y1="6" x2="28" y2="6" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />}
    </svg>
  );
}

/**
 * Leyenda propia, en dos filas: "Esta campaña" (barra oscura y líneas llenas
 * con punto) y "Media de 30 años" (barra clara y líneas punteadas). La de
 * recharts dibujaba igual la línea de la campaña y la de su media, y no se
 * distinguían.
 */
function Leyenda({ conCampania }: { conCampania: boolean }) {
  // Cada ítem dice de qué es: la campaña (barra oscura, línea llena con punto)
  // o la media de 30 años (barra clara, punteada). Sin títulos de fila.
  const items = (lluvia: string, linea: "llena" | "punteada", de: string) => (
    <>
      <li>
        <Muestra tipo="barra" color={lluvia} />
        Lluvia{de}
      </li>
      <li>
        <Muestra tipo={linea} color={COLOR.tmax} />
        Máxima{de}
      </li>
      <li>
        <Muestra tipo={linea} color={COLOR.tmin} />
        Mínima{de}
      </li>
    </>
  );
  return (
    <div className={css.leyenda}>
      {conCampania && (
        <div className={css.filaLeyenda}>
          <ul>{items(COLOR.lluvia, "llena", " de la campaña")}</ul>
        </div>
      )}
      <div className={css.filaLeyenda}>
        <ul>{items(COLOR.lluviaMedia, "punteada", ", media de 30 años")}</ul>
      </div>
    </div>
  );
}

/** Leyenda del balance: color de la campaña y de la media de 30 años. */
function LeyendaBalance({ conCampania }: { conCampania: boolean }) {
  return (
    <div className={css.leyenda}>
      <div className={css.filaLeyenda}>
        <ul>
          {conCampania && (
            <li>
              <Muestra tipo="barra" color={COLOR.balance} />
              Esta campaña
            </li>
          )}
          <li>
            <Muestra tipo="barra" color={COLOR.balanceMedia} />
            Media de 30 años
          </li>
        </ul>
      </div>
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
            <Bar yAxisId="mm" dataKey="lluviaMedia" name={NOMBRE.lluviaMedia} fill={COLOR.lluviaMedia} isAnimationActive={false} />
            {conCampania && <Bar yAxisId="mm" dataKey="lluvia" name={NOMBRE.lluvia} fill={COLOR.lluvia} isAnimationActive={false} />}
            <Line yAxisId="c" dataKey="tmaxMedia" name={NOMBRE.tmaxMedia} stroke={COLOR.tmax} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            {conCampania && <Line yAxisId="c" dataKey="tmax" name={NOMBRE.tmax} stroke={COLOR.tmax} strokeWidth={2} isAnimationActive={false} />}
            <Line yAxisId="c" dataKey="tminMedia" name={NOMBRE.tminMedia} stroke={COLOR.tmin} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            {conCampania && <Line yAxisId="c" dataKey="tmin" name={NOMBRE.tmin} stroke={COLOR.tmin} strokeWidth={2} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
        <Leyenda conCampania={conCampania} />
        <figcaption className={css.pie}>
          Lluvia del mes en barras; la máxima más alta y la mínima más baja del mes en líneas.
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
        <p className={css.tituloLeyenda}>Balance de agua del mes</p>
        <LeyendaBalance conCampania={conCampania} />
      </figure>
    </div>
  );
}
