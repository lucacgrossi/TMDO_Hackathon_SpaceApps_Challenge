/**
 * Planilla CSV del productor (RF26, `docs/plan-planilla-lluvia.md` 4.1 y 4.2).
 *
 * El productor sube un CSV con lluvia y temperaturas de su estación; el
 * backend lo lee (`POST /mediciones/planilla`, parser de Back 2) y devuelve la
 * serie mensual con avisos y errores por fila. El front muestra la vista
 * previa y, al comparar, manda `serie.meses` en
 * `mediciones_propias.serie_mensual` de `/analizar`.
 *
 * Con la API conectada (`NEXT_PUBLIC_USAR_MOCK=false`) el archivo lo lee el back.
 * Con el mock, `leerPlanilla()` NO lee el archivo: devuelve una respuesta de
 * EJEMPLO marcada con `ejemplo: true`, y la vista previa lo dice en grande. Así nada se muestra como si fuera dato
 * del productor (principio "nada inventado").
 *
 * Los tipos copian `backend/app/api/contrato.py` (AvisoFila, MedicionMes,
 * SeriePlanilla, ResultadoPlanilla).
 */

import { subirPlanilla, USAR_MOCK } from "./api";

export type VariablePlanilla = "lluvia_mm" | "t_min_c" | "t_max_c";

export interface AvisoFila {
  /** Fila del archivo (1 = encabezado). null = aviso general. */
  fila: number | null;
  motivo: string;
}

export interface MedicionMes {
  /** "AAAA-MM" */
  mes: string;
  /** El back manda null cuando el mes no tiene esa medición. */
  lluvia_mm?: number | null;
  t_min_c?: number | null;
  t_max_c?: number | null;
}

export interface SeriePlanilla {
  meses: MedicionMes[];
  variables: VariablePlanilla[];
  granularidad: "diaria" | "mensual";
  periodo: { desde: string; hasta: string };
  campanas_completas: Partial<Record<VariablePlanilla, string[]>>;
  lluvia_media_campana_mm: number | null;
  filas_leidas: number;
  filas_usadas: number;
  avisos: AvisoFila[];
  formato: { codificacion: string; separador: string; decimal: string };
}

export interface ResultadoPlanilla {
  ok: boolean;
  serie: SeriePlanilla | null;
  errores: AvisoFila[];
  /** Solo en el front: true = respuesta de ejemplo, no se leyó el archivo. */
  ejemplo?: boolean;
}

/** Límite del backend: más de 1 MB responde 413. Se avisa antes de mandar. */
export const LIMITE_BYTES = 1024 * 1024;

/** Dónde está la plantilla para descargar (`public/plantillas/mediciones.csv`). */
export const URL_PLANTILLA = "/plantillas/mediciones.csv";

/** "2018/19 a 2023/24" (o la única campaña). */
export function rangoCampanas(c: string[] | undefined): string {
  if (!c || c.length === 0) return "";
  return c.length === 1 ? c[0] : `${c[0]} a ${c[c.length - 1]}`;
}

const n = (x: number) => x.toLocaleString("es-AR");
const plural = (k: number, uno: string, varios: string) => `${n(k)} ${k === 1 ? uno : varios}`;

/**
 * Líneas de la vista previa (4.2 del plan):
 * "Lluvia: 6 campañas completas (2018/19 a 2023/24)" · "Temperatura: 4 campañas"
 * · "1.248 registros diarios" · "3 filas descartadas".
 */
export function resumenPlanilla(s: SeriePlanilla): string[] {
  const lineas: string[] = [];
  const lluvia = s.campanas_completas.lluvia_mm;
  if (s.variables.includes("lluvia_mm")) {
    lineas.push(
      lluvia && lluvia.length
        ? `Lluvia: ${plural(lluvia.length, "campaña completa", "campañas completas")} (${rangoCampanas(lluvia)})`
        : "Lluvia: ninguna campaña completa (julio a junio)",
    );
  }
  if (s.variables.includes("t_min_c") || s.variables.includes("t_max_c")) {
    // Temperatura: las campañas completas de mínima o de máxima, la que tenga más.
    const tmin = s.campanas_completas.t_min_c ?? [];
    const tmax = s.campanas_completas.t_max_c ?? [];
    const t = tmin.length >= tmax.length ? tmin : tmax;
    lineas.push(
      t.length
        ? `Temperatura: ${plural(t.length, "campaña completa", "campañas completas")} (${rangoCampanas(t)})`
        : "Temperatura: ninguna campaña completa",
    );
  }
  lineas.push(
    `${plural(s.filas_usadas, s.granularidad === "diaria" ? "registro diario" : "registro mensual", s.granularidad === "diaria" ? "registros diarios" : "registros mensuales")}`,
  );
  const descartadas = s.filas_leidas - s.filas_usadas;
  if (descartadas > 0) lineas.push(plural(descartadas, "fila descartada", "filas descartadas"));
  return lineas;
}

/** ¿La planilla trae lluvia? Si es así, el campo manual de lluvia se deshabilita (4.2). */
export function traeLluvia(r: ResultadoPlanilla | null): boolean {
  return !!r?.ok && !!r.serie?.variables.includes("lluvia_mm");
}

/** Respuesta de EJEMPLO, con la forma de `ResultadoPlanilla`. Solo hasta la auditoría. */
export const RESULTADO_EJEMPLO: ResultadoPlanilla = {
  ok: true,
  ejemplo: true,
  errores: [],
  serie: {
    meses: [
      { mes: "2023-01", lluvia_mm: 120.5, t_min_c: 12.1, t_max_c: 37.4 },
      { mes: "2023-02", lluvia_mm: 98, t_min_c: 11.8, t_max_c: 35 },
    ],
    variables: ["lluvia_mm", "t_min_c", "t_max_c"],
    granularidad: "diaria",
    periodo: { desde: "2018-07", hasta: "2024-06" },
    campanas_completas: {
      lluvia_mm: ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24"],
      t_min_c: ["2020/21", "2021/22", "2022/23", "2023/24"],
      t_max_c: ["2020/21", "2021/22", "2022/23", "2023/24"],
    },
    lluvia_media_campana_mm: 702,
    filas_leidas: 1251,
    filas_usadas: 1248,
    avisos: [
      { fila: 14, motivo: "fecha 31/02/2019 no existe: fila descartada" },
      { fila: 233, motivo: "lluvia de -3 mm: fila descartada" },
      { fila: 902, motivo: "fecha repetida (12/05/2022): se usa la primera" },
    ],
    formato: { codificacion: "utf-8", separador: ";", decimal: "," },
  },
};

/**
 * Lee la planilla. Primero valida tamaño y tipo en el navegador (sin gastar un
 * pedido). Con la API (`NEXT_PUBLIC_USAR_MOCK=false`) la manda a
 * `POST /mediciones/planilla`: 200 → ResultadoPlanilla, 422 → ResultadoPlanilla
 * con errores, 413 → "La planilla supera 1 MB". Con el mock devuelve la
 * respuesta de ejemplo (marcada `ejemplo`: no se manda a /analizar).
 */
export async function leerPlanilla(archivo: File): Promise<ResultadoPlanilla> {
  if (archivo.size > LIMITE_BYTES) {
    return { ok: false, serie: null, errores: [{ fila: null, motivo: "La planilla supera 1 MB." }] };
  }
  if (!/\.(csv|txt)$/i.test(archivo.name)) {
    return {
      ok: false,
      serie: null,
      errores: [{ fila: null, motivo: "El archivo tiene que ser CSV (Excel y Google Sheets lo exportan con «Guardar como CSV»)." }],
    };
  }
  return USAR_MOCK ? RESULTADO_EJEMPLO : subirPlanilla(archivo);
}
