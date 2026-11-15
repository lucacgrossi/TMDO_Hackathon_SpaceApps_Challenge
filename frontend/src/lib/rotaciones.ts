/**
 * Lógica pura de la sección Rotaciones (persona 5): lo que muestra cada card
 * de estrategia y la banda de choque. Sin React.
 *
 * No calcula datos de NASA: ordena el calendario de julio a junio con el helper
 * común (`mesesCampania`), lee los valores del back y arma textos fijos. Lo
 * único que se recalcula es la cercanía y el choque al mover las prioridades
 * (RF13), con la misma regla que el motor (`cercania.ts`).
 */
import { C, INICIALES_MES, type GrupoCultivo } from "./calendario";
import { choqueObjetivos, textoChoque, type Pesos } from "./cercania";
import { TIPOS_DE_ANIO, type CultivoMes, type Estrategia, type EstrategiaDisponible, type IdEstrategia, type Salida, type TipoAnio } from "./contrato";
import { conSigno, fmt, NOMBRE_CULTIVO } from "./formato";
import { mesesCampania } from "./ordenCampania";

/** Texto del badge de cada columna (DESIGN.md, "Card de estrategia"). */
export const BADGE: Record<IdEstrategia, string> = { actual: "Hoy", A: "A", B: "B", C: "C" };

/* ------------------------------------------------------------------ */
/* Calendario de la card                                               */
/* ------------------------------------------------------------------ */

export interface CeldaCalendario {
  /** Índice del contrato (0 = enero). */
  mes: number;
  /** "J", "A", "S"… */
  inicial: string;
  /** "julio" */
  nombreMes: string;
  cultivo: CultivoMes;
  /** "Soja", "Barbecho"… */
  nombreCultivo: string;
  /** Decide el color (--verano, --invierno, --cobertura, --barbecho). */
  grupo: GrupoCultivo;
}

/** Los 12 meses del calendario en orden de campaña (julio a junio). */
export function celdasCalendario(calendario: readonly CultivoMes[]): CeldaCalendario[] {
  return mesesCampania(calendario).map((m) => {
    const cultivo = m.valor ?? "barbecho";
    return {
      mes: m.mes,
      inicial: INICIALES_MES[m.mes],
      nombreMes: m.nombre,
      cultivo,
      // Mismo nombre que el title de los tramos de la tabla ("Barbecho (pelado)").
      nombreCultivo: NOMBRE_CULTIVO[cultivo],
      grupo: C[cultivo].g,
    };
  });
}

/** "6 meses con el lote pelado" a partir de `valores.meses_cobertura_baja` (lo calcula el back). */
export function textoPelado(meses: number | null | undefined): string {
  if (meses == null) return "Meses con el lote pelado: sin dato";
  return `${fmt(meses)} ${meses === 1 ? "mes" : "meses"} con el lote pelado`;
}

/* ------------------------------------------------------------------ */
/* Balance por tipo de año                                             */
/* ------------------------------------------------------------------ */

export const LETRA_TIPO: Record<TipoAnio, string> = { seco: "S", normal: "N", humedo: "H" };
export const NOMBRE_TIPO: Record<TipoAnio, string> = { seco: "Seco", normal: "Normal", humedo: "Húmedo" };

export interface BalanceTipo {
  tipo: TipoAnio;
  letra: string;
  nombre: string;
  /** "−332 mm" o "sin dato". */
  valor: string;
}

/** Balance de agua de la rotación en cada tipo de año (S, N, H), tal como viene del back. */
export function balancePorTipo(e: EstrategiaDisponible): BalanceTipo[] {
  return TIPOS_DE_ANIO.map((tipo) => {
    const mm = e.valores_por_tipo_anio[tipo]?.agua_mm;
    return {
      tipo,
      letra: LETRA_TIPO[tipo],
      nombre: NOMBRE_TIPO[tipo],
      valor: mm == null ? "sin dato" : `${conSigno(mm)} mm`,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Los 5 puntos                                                        */
/* ------------------------------------------------------------------ */

export interface Punto {
  id: "por_que" | "evidencia" | "beneficios" | "vacios" | "riesgos";
  titulo: string;
  items: string[];
  /** Qué se muestra si el back no manda items: nunca queda vacío ni se inventa. */
  vacio: string;
}

/** Los 5 puntos de cada columna, siempre los 5 y en este orden. */
export function cincoPuntos(e: Estrategia): Punto[] {
  return [
    { id: "por_que", titulo: "Por qué", items: e.por_que, vacio: "Sin detalle" },
    { id: "evidencia", titulo: "Evidencia", items: e.evidencia, vacio: "Sin detalle" },
    {
      id: "beneficios",
      titulo: "Beneficios",
      items: e.beneficios,
      vacio: e.id === "actual" ? "Es la base de la comparación" : "Sin valores a favor frente a la actual",
    },
    { id: "vacios", titulo: "Información que falta", items: e.vacios, vacio: "Sin faltantes informados" },
    { id: "riesgos", titulo: "A revisar con el agrónomo", items: e.riesgos, vacio: "Sin alertas" },
  ];
}

/** Texto fijo que acompaña al motivo de una columna descartada. */
export const NOTA_DESCARTADA = "Se muestra para mantener las 4 columnas.";

/* ------------------------------------------------------------------ */
/* Banda de choque                                                     */
/* ------------------------------------------------------------------ */

/**
 * Texto de la banda de choque de objetivos, o null si no hay choque.
 *
 * El back manda `choque` para las prioridades con que se analizó. Si con las
 * prioridades actuales chocan los mismos objetivos, se muestra su `texto` tal
 * cual; si el usuario movió las prioridades y el choque cambió, se usa el
 * recálculo del cliente (misma regla que el motor, `choqueObjetivos`).
 */
export function textoBandaChoque(salida: Salida, pesos: Pesos): string | null {
  const local = choqueObjetivos(salida.estrategias, pesos);
  if (!local) return null;
  const back = salida.choque;
  const mismos =
    back.hay && back.texto && back.objetivos.length === 2 && back.objetivos.every((o) => local.objetivos.includes(o));
  if (mismos) return back.texto;
  const t = textoChoque(local);
  return `${t.titulo} ${t.detalle}`;
}
