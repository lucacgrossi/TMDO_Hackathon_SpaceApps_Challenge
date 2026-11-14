/**
 * Serie de lluvia por campaña (RF24, Could). Puro, sin React.
 *
 * Describe la serie que manda el back: no proyecta ni interpreta. El tercio de
 * cada campaña es el `tipo` que trae el contrato (el mismo corte que
 * `tipos_de_anio`); el front no lo recalcula.
 */
import type { CampanaSerie, SerieAnual, TiposDeAnio, TipoAnio } from "./contrato";
import { conSigno, fmt } from "./formato";

/** Cuántas campañas forman el grupo "últimas" (el contrato manda `ultimas_10_mm`). */
export const ULTIMAS = 10;

export const NOMBRE_TERCIO: Record<TipoAnio, string> = { seco: "seco", normal: "normal", humedo: "húmedo" };

export interface BarraSerie extends CampanaSerie {
  /** Está entre las últimas 10 campañas. */
  reciente: boolean;
  /** Alto de la barra, de 0 a 1, proporcional a la lluvia (base en 0 mm). */
  alto: number;
  /** "2021/22 · 546 mm · balance −952 mm · tercio seco" */
  texto: string;
}

/** Texto de una campaña: el valor exacto, con el balance si llega y el tercio en palabras. */
export function textoCampana(c: CampanaSerie): string {
  const partes = [c.campana, `${fmt(c.lluvia_mm)} mm`];
  if (c.balance_mm != null) partes.push(`balance ${conSigno(c.balance_mm)} mm`);
  partes.push(`tercio ${NOMBRE_TERCIO[c.tipo]}`);
  return partes.join(" · ");
}

/** Las barras en orden cronológico, con las últimas 10 marcadas. */
export function barrasSerie(serie: SerieAnual): BarraSerie[] {
  const max = Math.max(...serie.campanas.map((c) => c.lluvia_mm), 0);
  const desde = serie.campanas.length - Math.min(ULTIMAS, serie.campanas.length);
  return serie.campanas.map((c, i) => ({
    ...c,
    reciente: i >= desde,
    alto: max > 0 ? Math.max(c.lluvia_mm, 0) / max : 0,
    texto: textoCampana(c),
  }));
}

/** Campañas en cada tercio. */
export function conteoTercios(serie: SerieAnual): Record<TipoAnio, number> {
  const n: Record<TipoAnio, number> = { seco: 0, normal: 0, humedo: 0 };
  for (const c of serie.campanas) n[c.tipo]++;
  return n;
}

export interface TextosSerie {
  /** "Lluvia por campaña · 30 campañas" */
  titulo: string;
  /** "Últimas 10: 734 mm · 20 previas: 862 mm (−15 %)" */
  promedios: string;
  /** "6 de las últimas 10 en el tercio seco (10 de 30 en toda la serie)" */
  secos: string;
  /** "Color: tercio de balance de agua (lluvia − evapotranspiración)" */
  criterio: string;
  /** "NASA POWER mensual (comunidad AG) · ~50 km (0,5° × 0,625°) · 1996/97 a 2025/26 · campaña de julio a junio" */
  fuente: string;
}

/** Textos fijos de la serie, a partir de los números que manda el back. */
export function textosSerie(serie: SerieAnual, metodo: TiposDeAnio["metodo"]): TextosSerie {
  const n = serie.campanas.length;
  const k = Math.min(ULTIMAS, n);
  const previas = n - k;
  const ultimas = `Últimas ${k}: ${fmt(serie.ultimas_10_mm)} mm`;
  // Sin campañas previas no hay contra qué comparar: no se muestra un promedio de 0
  const pct = serie.previas_20_mm > 0 ? ((serie.ultimas_10_mm - serie.previas_20_mm) / serie.previas_20_mm) * 100 : null;
  const promedios =
    previas === 0
      ? ultimas
      : `${ultimas} · ${previas} previas: ${fmt(serie.previas_20_mm)} mm` +
        (pct == null ? "" : ` (${conSigno(Math.round(pct))} %)`);
  return {
    titulo: `Lluvia por campaña · ${n} campañas`,
    promedios,
    secos: `${serie.secos_en_ultimas_10} de las últimas ${k} en el tercio seco (${conteoTercios(serie).seco} de ${n} en toda la serie)`,
    criterio:
      metodo === "terciles_balance"
        ? "Color: tercio de balance de agua de la campaña"
        : "Color: tercio de lluvia de la campaña",
    fuente: `${serie.fuente} · ${serie.resolucion} · ${serie.periodo} · campaña de julio a junio`,
  };
}
