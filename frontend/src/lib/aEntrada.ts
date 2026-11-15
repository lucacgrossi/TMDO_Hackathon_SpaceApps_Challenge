import type { Entrada, MedicionMes, Restriccion } from "./contrato";
import type { Entradas, LatLng } from "./entradas";
import { areaHa, centro } from "./geo";

/**
 * Pasa las entradas del panel (`useEntradas`) al cuerpo de `POST /analizar`
 * (docs/api-frontend.md, 4.1). Función pura: es lo único que conoce la
 * diferencia de nombres y de orden de coordenadas entre el store y el contrato.
 */

/** Polígono del store ([lat, lng], abierto) → anillo GeoJSON ([lon, lat], cerrado). */
export function anilloGeoJSON(poligono: readonly LatLng[]): [number, number][] {
  const anillo = poligono.map(([lat, lng]) => [lng, lat] as [number, number]);
  const [primero] = anillo;
  const ultimo = anillo[anillo.length - 1];
  if (primero && (primero[0] !== ultimo[0] || primero[1] !== ultimo[1])) anillo.push([...primero]);
  return anillo;
}

/** Barras de 1 a 5 (el contrato rechaza 0 o decimales con 422). */
const prioridad = (v: number) => Math.min(5, Math.max(1, Math.round(v)));

/** Número positivo o null (el back rechaza 0 o negativos en la lluvia). */
const positivo = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 ? v : null);

export function entradaDesde(e: Entradas): Entrada {
  const [lat, lon] = centro(e.poligono);

  const restricciones: Restriccion[] = [];
  if (e.restricciones.sinRiego) restricciones.push("sin_riego");
  if (e.restricciones.sinHacienda) restricciones.push("sin_hacienda");
  if (e.restricciones.maquinariaLimitada) restricciones.push("maquinaria_limitada");

  const m = e.mediciones;
  const planilla = m.planilla?.resultado;
  // La planilla de ejemplo (sin back) no es del productor: no se manda como medición
  const serie: MedicionMes[] | null =
    planilla?.ok && planilla.serie && !planilla.ejemplo
      ? planilla.serie.meses.map((x) => ({
          mes: x.mes,
          lluvia_mm: x.lluvia_mm ?? null,
          t_min_c: x.t_min_c ?? null,
          t_max_c: x.t_max_c ?? null,
        }))
      : null;
  const anios = m.aniosRegistro != null && m.aniosRegistro >= 1 ? Math.round(m.aniosRegistro) : null;
  const mo = m.materiaOrganicaPct != null && m.materiaOrganicaPct >= 0 && m.materiaOrganicaPct <= 100 ? m.materiaOrganicaPct : null;

  return {
    lote: {
      // Siempre lo marca el productor: la app no ofrece el lote de ejemplo.
      tipo: "dibujado",
      poligono: { type: "Polygon", coordinates: [anilloGeoJSON(e.poligono)] },
      centro: [lat, lon],
      area_ha: Math.round(areaHa(e.poligono) * 100) / 100,
    },
    lat,
    lon,
    cultivo_verano: e.verano,
    invierno: e.invierno,
    campana_pasada: e.pasada,
    calendario: null,
    prioridades: {
      agua: prioridad(e.objetivos.agua),
      suelo: prioridad(e.objetivos.suelo),
      erosion: prioridad(e.objetivos.erosion),
      ingreso: prioridad(e.objetivos.ingreso),
    },
    restricciones,
    no_sembrar: [...e.noSembrar],
    anegable: e.anegable,
    textura_suelo: e.textura,
    mediciones_propias: {
      lluvia_anual_mm: positivo(m.lluviaAnualMm),
      anios_registro: anios,
      materia_organica_pct: mo,
      serie_mensual: serie && serie.length ? serie : null,
    },
  };
}
