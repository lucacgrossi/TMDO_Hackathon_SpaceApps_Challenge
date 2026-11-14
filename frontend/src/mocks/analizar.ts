/**
 * Mock de POST /analizar: imita lo que haría el backend con las entradas que
 * le importan a la hoja, a partir de la salida fija del lote de Río Cuarto
 * (`rio-cuarto.ts`, copia del mock del backend).
 *
 * Qué simula:
 * - Restricción "No sembrar": la alternativa queda descartada (en gris con el
 *   motivo) cuando se excluyen los dos cultivos que puede usar, como en el
 *   prototipo. Si se excluye uno solo, el backend elegiría el otro; el mock no
 *   lo simula y sigue mostrando el cultivo de la salida fija.
 * - Pluviómetro (RF15): arma `contraste_mediciones` contra la lluvia de NASA.
 *   Si la diferencia pasa el 15 %, baja la confianza del agua y suma la nota a
 *   "Revisar con el agrónomo". NO cambia ningún puntaje.
 * - Materia orgánica: si está cargada, deja de figurar en "Información que falta".
 *
 * Qué NO simula: el cambio de cultivo de verano o de invierno (el mock es
 * siempre soja + barbecho) ni las prioridades (la cercanía la recalcula el
 * front con `cercania.ts`, RF13).
 */
import type { CultivoNoSembrar, Estrategia, IdEstrategia, Salida } from "@/lib/contrato";
import { RIO_CUARTO } from "./rio-cuarto";

/** Milímetros sin decimales, con punto de miles (es-AR). */
const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

export interface OpcionesMock {
  noSembrar?: readonly CultivoNoSembrar[];
  lluviaAnualMm?: number | null;
  materiaOrganicaPct?: number | null;
}

/** Diferencia (en %) a partir de la cual el pluviómetro "no coincide" con NASA (RF15). */
export const UMBRAL_DIFERENCIA_PCT = 15;

/** Los dos cultivos que puede usar cada alternativa (prototipo, `strategies`). */
const OPCIONES_ALTERNATIVA: Record<Exclude<IdEstrategia, "actual">, [CultivoNoSembrar, CultivoNoSembrar]> = {
  A: ["vicia", "centeno"],
  B: ["trigo", "cebada"],
  C: ["sorgo", "girasol"],
};

/** Indicadores de agua cuya confianza baja si el pluviómetro no coincide. */
const INDICADORES_AGUA = ["lluvia_anual", "balance_anual"];

function descartar(e: Estrategia, noSembrar: readonly CultivoNoSembrar[]): Estrategia {
  if (e.id === "actual" || !e.disponible) return e;
  const [a, b] = OPCIONES_ALTERNATIVA[e.id];
  if (!noSembrar.includes(a) || !noSembrar.includes(b)) return e;
  const motivo = `No sembrar ${a} ni ${b}`;
  return {
    ...e,
    disponible: false,
    motivo_descarte: motivo,
    calendario: null,
    resumen: `Descartada por una restricción: ${motivo.toLowerCase()}.`,
    valores: null,
    puntos: null,
    valores_por_tipo_anio: null,
    diferencia_vs_actual: null,
    cercania: null,
    cercania_objetivos: null,
    que_le_falta: [],
    sensible_clima: false,
    reglas_aplicadas: [],
    probabilidades: [],
    por_que: [],
    evidencia: [],
    beneficios: [],
    vacios: [],
    riesgos: [],
  };
}

function contrastarPluviometro(salida: Salida, mm: number): void {
  const nasa = salida.indicadores.lluvia_anual?.valor;
  if (typeof nasa !== "number" || nasa <= 0) return;
  const relativa = ((mm - nasa) / nasa) * 100;
  const diferencia = Math.round(relativa);
  const difiere = Math.abs(relativa) > UMBRAL_DIFERENCIA_PCT;
  const signo = diferencia > 0 ? "+" : diferencia < 0 ? "−" : "";

  salida.contraste_mediciones = [
    {
      indicador: "lluvia_anual",
      valor_productor: mm,
      valor_nasa: nasa,
      unidad: "mm/año",
      diferencia_pct: diferencia,
      confianza_resultante: difiere ? "baja" : "alta",
      // Los terciles son de balance: el umbral no se puede corregir solo con la lluvia
      corregido_al_lado: {
        umbral_seco_mm: null,
        nota: `Lluvia media corregida con tu pluviómetro: ${fmt(mm)} mm/año (NASA: ${fmt(nasa)} mm). Solo informativo: no cambia ningún puntaje.`,
      },
      texto: `Tu pluviómetro: ${fmt(mm)} mm/año · NASA: ${fmt(nasa)} mm (${signo}${Math.abs(diferencia)} %)`,
    },
  ];
  if (!difiere) return;

  const motivo = `Tu pluviómetro difiere ${Math.abs(diferencia)} % de NASA`;
  for (const clave of INDICADORES_AGUA) {
    const ind = salida.indicadores[clave];
    if (ind) Object.assign(ind, { confianza: "baja", motivo });
  }
  const actual = salida.estrategias[0];
  actual.riesgos.push(`${motivo}: el dato de agua tiene confianza baja`);
}

function quitarFaltaMateriaOrganica(salida: Salida): void {
  const noEsMO = (v: string) => !v.startsWith("Materia orgánica");
  salida.informacion_falta = salida.informacion_falta.filter(noEsMO);
  for (const e of salida.estrategias) e.vacios = e.vacios.filter(noEsMO);
}

/** Devuelve una copia nueva de la salida del lote demo, ajustada a las entradas. */
export function mockAnalizar(opciones: OpcionesMock = {}): Salida {
  const salida = structuredClone(RIO_CUARTO);
  const { noSembrar = [], lluviaAnualMm = null, materiaOrganicaPct = null } = opciones;
  if (lluviaAnualMm != null && lluviaAnualMm > 0) contrastarPluviometro(salida, lluviaAnualMm);
  if (materiaOrganicaPct != null) quitarFaltaMateriaOrganica(salida);
  const [actual, a, b, c] = salida.estrategias;
  salida.estrategias = [actual, descartar(a, noSembrar), descartar(b, noSembrar), descartar(c, noSembrar)];
  return salida;
}

/** Lote demo tal cual: soja + barbecho, sin mediciones. */
export const MOCK_BASE: Salida = mockAnalizar();
/** B descartada: "No sembrar trigo ni cebada". */
export const MOCK_DESCARTADA: Salida = mockAnalizar({ noSembrar: ["trigo", "cebada"] });
/** Pluviómetro que no coincide: 620 mm contra 769 de NASA (−19 %). */
export const MOCK_PLUVIOMETRO: Salida = mockAnalizar({ lluviaAnualMm: 620 });
