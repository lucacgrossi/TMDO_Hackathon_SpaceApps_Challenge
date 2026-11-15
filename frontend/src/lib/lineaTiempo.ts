/**
 * Datos de la línea de tiempo del mapa (S4, RF14 y RF17): un mes por barrita,
 * de julio a junio, con el NDVI medio del lote que manda el back en
 * `visto_por_satelite.meses` (índice 0 = enero). Puro, sin React.
 *
 * El front no calcula el NDVI ni elige escenas: lee el mes, su fuente y si cayó
 * al respaldo de MODIS (250 m, mezcla el lote con los vecinos), que se marca
 * con asterisco y nota de confianza baja (`DESIGN.md`, S4).
 */
import { colorEscala } from "./capaRaster";
import type { CapaRaster, Capas, EscalaCapa, MesSatelite, VistoPorSatelite } from "./contrato";
import { fmtNdvi } from "./formato";
import { mesesCampania } from "./ordenCampania";

export const NOTA_MODIS = "MODIS 250 m de respaldo: mezcla el lote con los vecinos, confianza baja.";
const SIN_ESCENA = "Sin escena utilizable ese mes.";

export interface MesLineaTiempo {
  /** Índice del contrato: 0 = enero. Es el que va a `useVista().cambiarMes`. */
  mes: number;
  /** "jul", o "mar*" si el mes es de MODIS. */
  etiqueta: string;
  /** "julio" */
  nombre: string;
  /** NDVI medio del lote; null si el mes no tiene escena. */
  ndvi: number | null;
  /** Alto de la barrita, de 0 a 1 (NDVI recortado a 0–1). 0 sin dato. */
  alto: number;
  /** Debajo del umbral de cobertura baja (`visto_por_satelite.umbral`); null sin dato. */
  bajo: boolean | null;
  /** Color de la clase en la escala del back; null si no hay escala o no hay dato. */
  color: string | null;
  /** Fuente tal como la manda el back ("NASA HLS 30 m", "MODIS 250 m"). */
  fuente: string | null;
  /** Fecha de la escena, "22/07/2025". */
  fecha: string | null;
  /** El mes cayó al respaldo de MODIS. */
  modis: boolean;
  /** Por qué no hay dato (de `faltantes`), o null si lo hay. */
  motivo: string | null;
  /** El back mandó el raster de ese mes para dibujarlo en el mapa. */
  conRaster: boolean;
  /** Texto completo para lectores de pantalla y el `title` de la barrita. */
  texto: string;
}

/** El mes cayó al respaldo de MODIS (por la colección o, si no viene, por la fuente). */
export function esModis(m: Pick<MesSatelite, "coleccion" | "fuente">): boolean {
  if (m.coleccion) return m.coleccion.startsWith("modis");
  return /modis/i.test(m.fuente);
}

/** "2025-07-22" → "22/07/2025". Si no tiene esa forma, la deja como viene. */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

/** Raster de NDVI del mes (0 = enero) que mandó el back, o null. */
export function rasterNdviDelMes(capas: Capas | null | undefined, mes: number): CapaRaster | null {
  return capas?.ndvi_mensual[mes]?.mapa ?? null;
}

/** La escala del NDVI: la del primer mes con raster (el back usa la misma para los 12). */
export function escalaNdvi(capas: Capas | null | undefined): EscalaCapa | null {
  for (const m of capas?.ndvi_mensual ?? []) if (m?.mapa) return m.mapa.escala;
  return null;
}

/** Motivo del mes sin dato: el de `faltantes` (AAAA-MM) si lo trae. */
function motivoFaltante(visto: VistoPorSatelite, mes: number): string {
  const f = visto.faltantes?.find((x) => Number(x.mes.slice(5, 7)) - 1 === mes);
  return f?.motivo ?? SIN_ESCENA;
}

/** Los 12 meses de la línea de tiempo, de julio a junio. */
export function lineaTiempo(visto: VistoPorSatelite, capas?: Capas | null): MesLineaTiempo[] {
  const escala = escalaNdvi(capas);
  return mesesCampania(visto.meses).map(({ mes, corto, nombre, valor: m }) => {
    const conRaster = rasterNdviDelMes(capas, mes) != null;
    if (!m) {
      const motivo = motivoFaltante(visto, mes);
      return {
        mes,
        etiqueta: corto,
        nombre,
        ndvi: null,
        alto: 0,
        bajo: null,
        color: null,
        fuente: null,
        fecha: null,
        modis: false,
        motivo,
        conRaster,
        texto: `${nombre}: sin dato. ${motivo}`,
      };
    }
    const modis = esModis(m);
    const fecha = fechaCorta(m.fecha);
    return {
      mes,
      etiqueta: modis ? `${corto}*` : corto,
      nombre,
      ndvi: m.ndvi_medio,
      alto: Math.min(1, Math.max(0, m.ndvi_medio)),
      bajo: m.ndvi_medio < visto.umbral,
      color: escala ? colorEscala(escala, m.ndvi_medio) : null,
      fuente: m.fuente,
      fecha,
      modis,
      motivo: null,
      conRaster,
      texto: `${nombre}: NDVI ${fmtNdvi(m.ndvi_medio)}, ${m.fuente}, ${fecha}` + (modis ? `. ${NOTA_MODIS}` : ""),
    };
  });
}
