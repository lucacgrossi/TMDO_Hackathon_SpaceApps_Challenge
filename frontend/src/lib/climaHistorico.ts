/**
 * Datos de la sección Clima histórico (S5, RF24). Puro, sin React.
 *
 * Todo sale de la respuesta de /analizar: `clima_mensual` (media de las 30
 * campañas) y, si viene, `serie_anual.campanas[i].mensual` (los 12 meses de
 * una campaña). Los arrays vienen con índice 0 = enero y se muestran de julio
 * a junio.
 *
 * `mensual.t_min_c` y `t_max_c` son EXTREMOS del mes (mínima más baja y máxima
 * más alta, T2M_MIN/T2M_MAX de POWER): se comparan con
 * `clima_mensual.minima_media_c` y `maxima_media_c`, nunca con `t_media_c`.
 */
import type { CampanaElegida } from "./campanaClima";
import type { ClimaMensual, Indicador, Salida } from "./contrato";
import { conSigno, fmt, listaMeses } from "./formato";
import { mesesCampania } from "./ordenCampania";

export const ETIQUETA_TMAX = "Máxima más alta del mes";
export const ETIQUETA_TMIN = "Mínima más baja del mes";

/** Un mes del gráfico, en orden de campaña. null = sin dato (nunca 0). */
export interface FilaGrafico {
  /** 0 = enero. */
  mes: number;
  /** "jul" */
  corto: string;
  /** "julio de 2021", o "julio" sin campaña elegida. */
  nombre: string;
  /** Lluvia de la campaña elegida, mm. */
  lluvia: number | null;
  /** Lluvia media de 30 años, mm. */
  lluviaMedia: number | null;
  tmin: number | null;
  tminMedia: number | null;
  tmax: number | null;
  tmaxMedia: number | null;
  balance: number | null;
  balanceMedia: number | null;
}

/** Las 12 filas del gráfico. Sin `mensual`, solo la media de 30 años. */
export function datosGrafico(clima: ClimaMensual, elegida: CampanaElegida | null): FilaGrafico[] {
  const m = elegida?.mensual ?? null;
  return mesesCampania(clima.lluvia_mm, m ? elegida?.campana : null).map(({ mes, corto, nombre, anio }) => ({
    mes,
    corto,
    nombre: anio == null ? nombre : `${nombre} de ${anio}`,
    lluvia: m?.lluvia_mm[mes] ?? null,
    lluviaMedia: clima.lluvia_mm[mes] ?? null,
    tmin: m?.t_min_c[mes] ?? null,
    tminMedia: clima.minima_media_c[mes] ?? null,
    tmax: m?.t_max_c[mes] ?? null,
    tmaxMedia: clima.maxima_media_c[mes] ?? null,
    balance: m?.balance_mm?.[mes] ?? null,
    balanceMedia: clima.balance_mm[mes] ?? null,
  }));
}

export interface FilaFichaCampana {
  etiqueta: string;
  /** "546 mm" o "sin dato". */
  valor: string;
  /** Contra qué comparar, en una línea. */
  pie: string;
}

function valorIndicador(ind: Indicador | undefined): string {
  if (!ind || typeof ind.valor !== "number") return "sin dato";
  // Negativos con el signo menos tipográfico (−), como el resto de la app.
  return `${ind.valor < 0 ? conSigno(ind.valor) : fmt(ind.valor)} ${ind.unidad}`;
}

/**
 * Ficha de la campaña (al costado del gráfico): lluvia, ET0, balance y meses
 * con helada. Sin campaña con sus meses, la ficha muestra la media de 30 años.
 * La ET0 de la campaña es la suma de los 12 meses que manda el back.
 */
export function fichaCampana(salida: Salida, elegida: CampanaElegida | null): FilaFichaCampana[] {
  const { indicadores: ind, clima_mensual: clima, tipos_de_anio: tipos } = salida;
  const frecuentes = clima.helada_frecuente.flatMap((f, mes) => (f ? [mes] : []));
  const pieHelada = frecuentes.length
    ? `Con helada frecuente en ${clima.n_anios} campañas: ${listaMeses(frecuentes)}.`
    : `Ningún mes con helada frecuente en ${clima.n_anios} campañas.`;
  const media = (i: Indicador | undefined) => `Media de ${clima.n_anios} años: ${valorIndicador(i)}.`;
  const umbral =
    tipos.metodo === "terciles_balance"
      ? `Umbral del tercio seco: ${conSigno(tipos.umbral_seco_mm)} mm.`
      : `Media de ${clima.n_anios} años: ${valorIndicador(ind.balance_anual)}.`;

  if (!elegida) {
    return [
      { etiqueta: "Lluvia", valor: valorIndicador(ind.lluvia_anual), pie: `Media de ${clima.n_anios} campañas (${clima.periodo}).` },
      { etiqueta: "ET0 (Hargreaves)", valor: valorIndicador(ind.et0_anual), pie: `Media de ${clima.n_anios} campañas.` },
      { etiqueta: "Balance de agua", valor: valorIndicador(ind.balance_anual), pie: `Media de ${clima.n_anios} campañas.` },
      { etiqueta: "Meses con helada frecuente", valor: String(frecuentes.length), pie: pieHelada },
    ];
  }

  const m = elegida.mensual;
  const et0 = m?.et0_mm && m.et0_mm.length === 12 ? m.et0_mm.reduce((a, b) => a + b, 0) : null;
  const conHelada = m ? m.t_min_c.flatMap((t, mes) => (t < 0 ? [mes] : [])) : null;
  return [
    { etiqueta: "Lluvia", valor: `${fmt(elegida.lluvia_mm)} mm`, pie: media(ind.lluvia_anual) },
    {
      etiqueta: "ET0 (Hargreaves)",
      valor: et0 == null ? "sin dato" : `${fmt(et0)} mm`,
      pie: et0 == null ? "Esta respuesta no trae la ET0 de la campaña." : media(ind.et0_anual),
    },
    {
      etiqueta: "Balance de agua",
      valor: elegida.balance_mm == null ? "sin dato" : `${conSigno(elegida.balance_mm)} mm`,
      pie: umbral,
    },
    {
      etiqueta: "Meses con mínima bajo 0 °C",
      valor: conHelada == null ? "sin dato" : String(conHelada.length),
      pie: (conHelada?.length ? `En la campaña: ${listaMeses(conHelada)}. ` : "") + pieHelada,
    },
  ];
}

export interface MesHeladasCalor {
  mes: number;
  corto: string;
  heladas: number | null;
  calor: number | null;
  /** "26 de 30 años con mínima bajo 0 °C en julio" */
  textoHeladas: string;
  textoCalor: string;
}

/** Frecuencia de heladas y calor por mes, de julio a junio, siempre como "N de 30 años". */
export function heladasCalor(clima: ClimaMensual): MesHeladasCalor[] {
  const n = clima.n_anios;
  return mesesCampania(clima.anios_con_helada).map(({ mes, corto, nombre, valor }) => {
    const calor = clima.anios_con_35c[mes] ?? null;
    return {
      mes,
      corto,
      heladas: valor,
      calor,
      textoHeladas: valor == null ? `${nombre}: sin dato` : `${valor} de ${n} años con mínima bajo 0 °C en ${nombre}`,
      textoCalor: calor == null ? `${nombre}: sin dato` : `${calor} de ${n} años con máxima de 35 °C o más en ${nombre}`,
    };
  });
}
