/**
 * Sección Mapa del dashboard (S4): qué capas hay, cuál se dibuja en cada mes,
 * qué dice el inspector de píxel, la leyenda y las 6 filas de la ficha técnica.
 * Puro, sin React: todo sale de la respuesta de /analizar; el front no calcula
 * datos de NASA ni la campaña.
 *
 * Convenciones del contrato (docs/api-frontend.md):
 * - `CapaRaster.bounds` = [[sur, oeste], [norte, este]] (listo para Leaflet);
 *   `clima_celda.bbox` = [oeste, sur, este, norte] (otro orden).
 * - `null` es "sin dato", nunca 0. Los textos del back se muestran tal cual.
 * - `capas.no_disponibles` → esa capa va deshabilitada en el selector.
 */
import { centroPixel, claseEscala, colorEscala, valorPixel } from "./capaRaster";
import type { Bounds, CapaRaster, Confianza, Indicador, Salida } from "./contrato";
import { fmtHasta, fmtNdvi, MESES } from "./formato";
import { fechaCorta, rasterNdviDelMes } from "./lineaTiempo";
import { HLS_EXPR, urlTeselasHls } from "./ndvi";
import { anioDelMes, mesesCampania } from "./ordenCampania";

export type IdCapaLote = "satelite" | "ndvi" | "pendiente" | "cultivo" | "erosion" | "celda";

export interface DefCapaLote {
  id: IdCapaLote;
  nombre: string;
  /** Una línea para el `title` del chip. */
  ayuda: string;
}

/** Orden del selector (DESIGN.md, S4). */
export const CAPAS_LOTE: readonly DefCapaLote[] = [
  { id: "satelite", nombre: "Satélite", ayuda: "Solo la imagen satelital de fondo (Esri)" },
  { id: "ndvi", nombre: "NDVI", ayuda: "Vegetación del lote mes a mes (NASA HLS 30 m; MODIS 250 m de respaldo)" },
  { id: "pendiente", nombre: "Pendiente", ayuda: "Inclinación de cada píxel del lote (NASADEM 30 m)" },
  { id: "cultivo", nombre: "Cultivo", ayuda: "Píxeles con uso agrícola (ESA WorldCover 10 m)" },
  { id: "erosion", nombre: "Erosión", ayuda: "Índice de riesgo de erosión: pendiente por meses con cobertura baja" },
  { id: "celda", nombre: "Celda NASA POWER", ayuda: "Zona de ~50 km que comparte el mismo dato de clima" },
];

export const CAPA_INICIAL: IdCapaLote = "ndvi";

/** Claves de `capas.no_disponibles` que apagan cada capa. */
const CLAVES_NO_DISPONIBLE: Partial<Record<IdCapaLote, string[]>> = {
  ndvi: ["ndvi_mapa", "ndvi_mensual"],
  pendiente: ["pendiente_mapa", "pendiente"],
  cultivo: ["cultivo_mapa", "cultivo"],
  erosion: ["erosion_mapa", "erosion"],
};

export interface EstadoCapaLote extends DefCapaLote {
  disponible: boolean;
  /** Por qué está deshabilitada; null si está disponible. */
  motivo: string | null;
}

/** Las 6 capas con su disponibilidad en esta respuesta. */
export function estadoCapas(salida: Salida): EstadoCapaLote[] {
  const { capas, visto_por_satelite: visto } = salida;
  return CAPAS_LOTE.map((def) => {
    const apagada = (CLAVES_NO_DISPONIBLE[def.id] ?? []).some((k) => capas.no_disponibles.includes(k));
    let hay = true;
    if (def.id === "pendiente") hay = capas.pendiente_mapa != null;
    if (def.id === "cultivo") hay = capas.cultivo_mapa != null;
    if (def.id === "erosion") hay = capas.erosion_mapa != null;
    if (def.id === "ndvi") hay = visto.meses.some((m) => m != null) || capas.ndvi_mensual.some((m) => m != null);
    // El NDVI tiene respaldo por teselas aunque falte el raster: solo se apaga si no hay ningún mes.
    const disponible = def.id === "ndvi" ? hay : hay && !apagada;
    return { ...def, disponible, motivo: disponible ? null : "Esta respuesta no trae la capa." };
  });
}

/** La capa raster que se dibuja con esa capa y ese mes (0 = enero), o null. */
export function rasterDeCapa(salida: Salida, id: IdCapaLote, mes: number): CapaRaster | null {
  const c = salida.capas;
  if (id === "ndvi") return rasterNdviDelMes(c, mes);
  if (id === "pendiente") return c.pendiente_mapa ?? null;
  if (id === "cultivo") return c.cultivo_mapa ?? null;
  if (id === "erosion") return c.erosion_mapa ?? null;
  return null;
}

/** Imagen del NDVI de un mes: el raster del back o, si no vino, teselas. */
export type DibujoNdvi =
  | { tipo: "raster"; capa: CapaRaster }
  | { tipo: "hls"; url: string; coleccion: string; fecha: string }
  | { tipo: "gibs"; url: string; fecha: string }
  | { tipo: "nada"; motivo: string };

/** URL de GIBS (MODIS NDVI, 16 días, nivel 9) para el día 15 del mes en la campaña del back. */
export function urlGibs(campana: string | null, mes: number): string | null {
  const anio = anioDelMes(campana, mes);
  if (anio == null) return null;
  const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-15`;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/${fecha}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
}

/**
 * Qué dibujar con NDVI en ese mes (frontend/CLAUDE.md): el raster del back; si
 * no vino, la escena HLS del back por teselas de Planetary Computer; si no hay
 * escena HLS (o el mock trae ids que no existen), MODIS de NASA GIBS.
 */
export function dibujoNdvi(salida: Salida, mes: number): DibujoNdvi {
  const raster = rasterNdviDelMes(salida.capas, mes);
  if (raster) return { tipo: "raster", capa: raster };
  const escena = salida.capas.ndvi_mensual[mes];
  if (escena && escena.coleccion in HLS_EXPR && !salida.es_mock) {
    return { tipo: "hls", url: urlTeselasHls({ coleccion: escena.coleccion, id: escena.item }), coleccion: escena.coleccion, fecha: escena.fecha };
  }
  const campana = salida.visto_por_satelite.campana;
  const url = urlGibs(campana, mes);
  if (url && (escena || salida.visto_por_satelite.meses[mes])) {
    return { tipo: "gibs", url, fecha: `15/${String(mes + 1).padStart(2, "0")}/${anioDelMes(campana, mes)}` };
  }
  return { tipo: "nada", motivo: `Sin imagen de NDVI para ${MESES[mes]}.` };
}

/** `clima_celda.bbox` [oeste, sur, este, norte] → bounds de Leaflet [[sur, oeste], [norte, este]]. */
export function boundsCelda(bbox: [number, number, number, number]): Bounds {
  const [oeste, sur, este, norte] = bbox;
  return [
    [sur, oeste],
    [norte, este],
  ];
}

/** Límites del píxel (para el recuadro del inspector). */
export function boundsPixel(capa: CapaRaster, fila: number, columna: number): Bounds {
  const [[sur, oeste], [norte, este]] = capa.bounds;
  const alto = (norte - sur) / capa.alto;
  const ancho = (este - oeste) / capa.ancho;
  const n = norte - fila * alto;
  const o = oeste + columna * ancho;
  return [
    [n - alto, o],
    [n, o + ancho],
  ];
}

/** Número con coma decimal: hasta 2 decimales debajo de 1 y hasta 1 por encima. */
export function numero(v: number): string {
  return fmtHasta(v, Math.abs(v) < 1 ? 2 : 1);
}

/** Capas por clase (cultivo): el valor se lee con la etiqueta de su clase. */
function esCategorica(capa: CapaRaster): boolean {
  return capa.unidad === "clase";
}

/** "NDVI 0,41", "0,8 %", "Cultivo (clase 40)". */
export function textoValor(capa: CapaRaster, valor: number): string {
  if (esCategorica(capa)) {
    const i = claseEscala(capa.escala, valor);
    return (i == null ? null : capa.escala.etiquetas[i]) ?? numero(valor);
  }
  if (capa.unidad === "NDVI") return `NDVI ${fmtNdvi(valor)}`;
  return `${numero(valor)} ${capa.unidad}`;
}

export interface LecturaPixel {
  fila: number;
  columna: number;
  /** null = píxel sin dato (fuera del lote o nodata). */
  valor: number | null;
  /** "NDVI 0,41" o "sin dato". */
  texto: string;
  color: string | null;
  /** "Este píxel (1″ (~30 m)): fila 12, columna 20" (fila y columna desde 1). */
  pixel: string;
  /** "NASA HLS L30 (Landsat 8/9) · 30 m, 22/01/2026, confianza alta" */
  fuente: string;
  /** Centro del píxel [lat, lng]. */
  centro: [number, number];
}

const TEXTO_CONFIANZA: Record<Confianza, string> = {
  alta: "confianza alta",
  media: "confianza media",
  baja: "confianza baja",
  sin_dato: "sin dato",
};

/** Lo que muestra el inspector para el píxel (fila, columna) de la capa (RF18). */
export function lecturaPixel(capa: CapaRaster, fila: number, columna: number): LecturaPixel {
  const valor = valorPixel(capa, fila, columna);
  const fecha = capa.fecha && /^\d{4}-\d{2}-\d{2}/.test(capa.fecha) ? fechaCorta(capa.fecha) : capa.fecha;
  return {
    fila,
    columna,
    valor,
    texto: valor == null ? "sin dato" : textoValor(capa, valor),
    color: valor == null ? null : colorEscala(capa.escala, valor),
    pixel: `Este píxel (${capa.resolucion_grilla}): fila ${fila + 1}, columna ${columna + 1}`,
    fuente: [capa.fuente, fecha, TEXTO_CONFIANZA[capa.confianza]].filter(Boolean).join(", "),
    centro: centroPixel(capa, fila, columna),
  };
}

/**
 * Píxel al mover con las flechas: se queda dentro de la grilla.
 * Sin píxel previo arranca en el centro.
 */
export function moverPixel(
  capa: Pick<CapaRaster, "ancho" | "alto">,
  actual: { fila: number; columna: number } | null,
  tecla: string,
): { fila: number; columna: number } | null {
  const d: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const paso = d[tecla];
  if (!paso) return null;
  if (!actual) return { fila: Math.floor(capa.alto / 2), columna: Math.floor(capa.ancho / 2) };
  return {
    fila: Math.min(capa.alto - 1, Math.max(0, actual.fila + paso[0])),
    columna: Math.min(capa.ancho - 1, Math.max(0, actual.columna + paso[1])),
  };
}

export interface ClaseLeyenda {
  color: string;
  etiqueta: string;
}

/** Clases de la leyenda, desde `capa.escala` (colores, cortes y etiquetas del back). */
export function clasesLeyenda(capa: Pick<CapaRaster, "escala">): ClaseLeyenda[] {
  const { colores, etiquetas } = capa.escala;
  return colores.map((color, i) => ({ color, etiqueta: etiquetas[i] ?? "" }));
}

// --- Ficha técnica del lote -------------------------------------------------

export interface FilaFicha {
  etiqueta: string;
  /** "0,6 %" o "sin dato". */
  valor: string;
  confianza: Confianza;
  /** Fuente, resolución y años, tal como vienen. */
  fuente: string;
  /** Nota o motivo del back (texto tal cual), o null. */
  nota: string | null;
}

/** Un indicador del contrato como fila; sin indicador o sin valor, "sin dato". */
function filaIndicador(etiqueta: string, ind: Indicador | null | undefined, sinDato: string): FilaFicha {
  if (!ind) return { etiqueta, valor: "sin dato", confianza: "sin_dato", fuente: "", nota: sinDato };
  const valor =
    ind.valor == null ? "sin dato" : typeof ind.valor === "number" ? `${numero(ind.valor)} ${ind.unidad}` : `${ind.valor} ${ind.unidad}`;
  const fuente = [ind.fuente, ind.resolucion, ind.anios].filter(Boolean).join(", ");
  return { etiqueta, valor, confianza: ind.valor == null ? "sin_dato" : ind.confianza, fuente, nota: ind.motivo ?? ind.nota ?? null };
}

/** `capas.erosion` llega como objeto suelto: se lee como indicador solo si tiene la forma. */
function erosionComoIndicador(e: Record<string, unknown> | null): Indicador | null {
  if (!e || typeof e.unidad !== "string" || typeof e.fuente !== "string") return null;
  const valor = typeof e.valor === "number" ? e.valor : null;
  const conf = e.confianza;
  const confianza: Confianza = conf === "alta" || conf === "media" || conf === "baja" ? conf : "sin_dato";
  return {
    valor,
    unidad: e.unidad,
    fuente: e.fuente,
    anios: typeof e.anios === "string" ? e.anios : null,
    resolucion: typeof e.resolucion === "string" ? e.resolucion : "",
    confianza,
    motivo: typeof e.motivo === "string" ? e.motivo : null,
    nota: typeof e.nota === "string" ? e.nota : null,
  };
}

/** Meses con NDVI bajo, en orden de campaña: "julio, septiembre y octubre". */
export function mesesBajos(salida: Salida): string {
  const v = salida.visto_por_satelite;
  const nombres = mesesCampania(v.meses)
    .filter((m) => m.valor != null && m.valor.ndvi_medio < v.umbral)
    .map((m) => m.nombre);
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Las 6 filas de la ficha técnica del lote (DESIGN.md, S4). */
export function filasFicha(salida: Salida): FilaFicha[] {
  const { lote, indicadores, visto_por_satelite: v, capas } = salida;
  const umbral = numero(v.umbral);

  let ndviBajo = filaIndicador(`Meses con NDVI bajo (< ${umbral})`, indicadores.meses_cobertura_baja, "Sin dato de NDVI del lote.");
  if (!indicadores.meses_cobertura_baja) {
    ndviBajo = {
      etiqueta: `Meses con NDVI bajo (< ${umbral})`,
      valor: v.meses_ndvi_bajo == null ? "sin dato" : `${v.meses_ndvi_bajo} meses`,
      confianza: v.meses_ndvi_bajo == null ? "sin_dato" : v.confianza,
      fuente: [v.fuente, v.campana].filter(Boolean).join(", "),
      nota: v.motivo,
    };
  }
  const lista = mesesBajos(salida);
  if (lista) ndviBajo = { ...ndviBajo, nota: [`Meses: ${lista}.`, ndviBajo.nota].filter(Boolean).join(" ") };

  const erosionInd = erosionComoIndicador(capas.erosion);
  const erosion = erosionInd
    ? filaIndicador("Riesgo de erosión", erosionInd, "")
    : capas.erosion_mapa
      ? {
          etiqueta: "Riesgo de erosión",
          valor:
            capas.erosion_mapa.resumen.valor_lote == null
              ? "sin dato"
              : `${numero(capas.erosion_mapa.resumen.valor_lote)} ${capas.erosion_mapa.unidad}`,
          confianza: capas.erosion_mapa.confianza,
          fuente: [capas.erosion_mapa.fuente, capas.erosion_mapa.resolucion_nativa].join(", "),
          nota: capas.erosion_mapa.nota,
        }
      : { etiqueta: "Riesgo de erosión", valor: "sin dato", confianza: "sin_dato" as const, fuente: "", nota: "Esta respuesta no trae el índice de erosión." };

  return [
    filaIndicador("Pendiente general", lote.pendiente_pct, "Sin dato de pendiente."),
    filaIndicador("Pendiente máxima", lote.pendiente_maxima_pct, "Esta respuesta no trae la pendiente máxima."),
    filaIndicador("Cobertura agrícola", lote.cobertura_agricola_pct, "Sin dato de cobertura."),
    ndviBajo,
    erosion,
    filaIndicador("ET real anual, contexto regional", indicadores.et_real_anual, "Esta respuesta no trae la ET real."),
  ];
}
