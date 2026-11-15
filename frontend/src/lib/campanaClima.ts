/**
 * Selección de una campaña de `serie_anual` para Clima histórico (S5, RF24).
 * Puro, sin React.
 *
 * El tercio de cada campaña es el `tipo` que manda el back (mismo corte que
 * `tipos_de_anio`); el front no lo recalcula. Los 12 meses de la campaña vienen
 * en `serie_anual.campanas[i].mensual` (índice 0 = enero). Si la respuesta no
 * los trae, la selección queda deshabilitada con el motivo y el gráfico muestra
 * la media de 30 años.
 */
import type { CampanaSerie, MesesCampana, SerieAnual, TipoAnio } from "./contrato";
import { fmt } from "./formato";

export const LETRA_TERCIO: Record<TipoAnio, "S" | "N" | "H"> = { seco: "S", normal: "N", humedo: "H" };
/** Adjetivo para "Campaña 2021/22: seca, 546 mm". */
export const ADJETIVO_TERCIO: Record<TipoAnio, string> = { seco: "seca", normal: "normal", humedo: "húmeda" };

export const MOTIVO_SIN_MENSUAL =
  "Esta respuesta no trae los 12 meses de cada campaña. Se muestra la media de 30 años.";
const MOTIVO_SIN_SERIE = "La respuesta no trae la serie de campañas de NASA POWER.";

export interface CampanaElegida {
  campana: string;
  /** Posición en `serie_anual.campanas` (orden cronológico). */
  indice: number;
  lluvia_mm: number;
  balance_mm: number | null;
  tipo: TipoAnio;
  letra: "S" | "N" | "H";
  /** "seca", "normal", "húmeda" */
  adjetivo: string;
  /** "Campaña 2021/22: seca, 546 mm" */
  titulo: string;
  /** Sus 12 meses (índice 0 = enero), o null si la API no los manda. */
  mensual: MesesCampana | null;
}

/** La campaña por defecto: la última de la serie (la más reciente completa de POWER). */
export function campanaInicial(serie: SerieAnual | null | undefined): string | null {
  return serie?.campanas[serie.campanas.length - 1]?.campana ?? null;
}

/** La campaña pedida con su tercio, o null si no está en la serie. */
export function elegirCampana(serie: SerieAnual | null | undefined, campana: string | null): CampanaElegida | null {
  if (!serie || !campana) return null;
  const indice = serie.campanas.findIndex((c) => c.campana === campana);
  if (indice < 0) return null;
  const c = serie.campanas[indice];
  return {
    campana: c.campana,
    indice,
    lluvia_mm: c.lluvia_mm,
    balance_mm: c.balance_mm,
    tipo: c.tipo,
    letra: LETRA_TERCIO[c.tipo],
    adjetivo: ADJETIVO_TERCIO[c.tipo],
    titulo: `Campaña ${c.campana}: ${ADJETIVO_TERCIO[c.tipo]}, ${fmt(c.lluvia_mm)} mm`,
    mensual: tieneMensual(c) ? c.mensual : null,
  };
}

/** La campaña trae sus 12 meses completos (lluvia y temperaturas). */
export function tieneMensual(c: CampanaSerie): c is CampanaSerie & { mensual: MesesCampana } {
  const m = c.mensual;
  return m != null && m.lluvia_mm.length === 12 && m.t_min_c.length === 12 && m.t_max_c.length === 12;
}

/**
 * Si el selector de campañas se puede usar: hace falta que todas las campañas
 * traigan sus 12 meses. Si no, va deshabilitado con el motivo.
 */
export function seleccionCampanas(serie: SerieAnual | null | undefined): { habilitada: boolean; motivo: string | null } {
  if (!serie || serie.campanas.length === 0) return { habilitada: false, motivo: MOTIVO_SIN_SERIE };
  const todas = serie.campanas.every(tieneMensual);
  return todas ? { habilitada: true, motivo: null } : { habilitada: false, motivo: MOTIVO_SIN_MENSUAL };
}
