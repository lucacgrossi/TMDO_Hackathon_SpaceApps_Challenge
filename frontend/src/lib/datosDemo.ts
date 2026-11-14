/**
 * Datos FIJOS de las capas del mapa, copiados del prototipo final.
 *
 * TODO(auditoría): todo lo de este archivo se reemplaza con datos del backend
 * (`/analizar`, NASA POWER y NASADEM). Hasta entonces, la leyenda dice
 * explícitamente que son valores ilustrativos (principio "nada inventado":
 * nunca se muestran como si fueran del lote).
 */

/**
 * Climatología mensual de la capa "Lluvia y heladas".
 * Índice 0 = enero … 11 = diciembre.
 *
 * Sale de `CLIMA0` del prototipo (prototipo-app.js ~línea 38): son los valores
 * de respaldo que el prototipo usa cuando no responde NASA POWER.
 * Con `real: true` (cuando llegue del backend) la leyenda muestra además los
 * años con helada (`heladas[m]` de `anios`) y el período de las campañas.
 */
export interface ClimaMensual {
  /** false = ilustrativo. La leyenda lo aclara. */
  real: boolean;
  /** Temperatura mínima por mes, °C. */
  tmin: number[];
  /** Temperatura máxima por mes, °C. */
  tmax: number[];
  /** Lluvia media por mes, mm. */
  lluvia: number[];
  /** Años con helada (mínima < 0 °C) en cada mes. null si no hay serie real. */
  heladas: number[] | null;
  /** Cantidad de campañas de la serie (0 si es ilustrativo). */
  anios: number;
  /** Período de la serie, por ejemplo "1994/95 a 2023/24". Vacío si es ilustrativo. */
  periodo: string;
}

export const CLIMA_ILUSTRATIVO: ClimaMensual = {
  real: false,
  tmin: [17, 16, 14, 10, 6, 3, 2, 4, 7, 10, 13, 16],
  tmax: [31, 29, 27, 23, 19, 16, 16, 19, 21, 24, 27, 30],
  lluvia: [110, 100, 105, 60, 30, 12, 10, 12, 35, 80, 100, 115],
  heladas: null,
  anios: 0,
  periodo: "",
};

