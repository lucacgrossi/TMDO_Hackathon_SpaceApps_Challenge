/**
 * Mock de POST /analizar: imita lo que haría el backend con las entradas que
 * le importan a la hoja, a partir de la salida fija del lote de Río Cuarto.
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
 * siempre soja + barbecho) ni los objetivos (la cercanía la recalcula el front
 * con `cercania.ts`, RF13).
 */
import type { CultivoNoSembrar } from "@/lib/entradas";
import type { Estrategia, IdEstrategia, Salida } from "@/lib/contrato";
import { RIO_CUARTO } from "./rio-cuarto";

export interface OpcionesMock {
  noSembrar?: readonly CultivoNoSembrar[];
  lluviaAnualMm?: number | null;
  materiaOrganicaPct?: number | null;
}

/** Diferencia (en %) a partir de la cual el pluviómetro "no coincide" con NASA. */
export const UMBRAL_DIFERENCIA_PCT = 15;

/** Los dos cultivos que puede usar cada alternativa (prototipo, `strategies`). */
const OPCIONES_ALTERNATIVA: Record<Exclude<IdEstrategia, "actual">, [CultivoNoSembrar, CultivoNoSembrar]> = {
  A: ["vicia", "centeno"],
  B: ["trigo", "cebada"],
  C: ["sorgo", "girasol"],
};

function descartar(e: Estrategia, noSembrar: readonly CultivoNoSembrar[]): Estrategia {
  if (e.id === "actual" || !e.disponible) return e;
  const [a, b] = OPCIONES_ALTERNATIVA[e.id];
  if (!noSembrar.includes(a) || !noSembrar.includes(b)) return e;
  return { id: e.id, nombre: e.nombre, disponible: false, motivo_descarte: `No sembrar ${a} ni ${b}` };
}

function contrastarPluviometro(salida: Salida, mm: number): void {
  const lluvia = salida.indicadores.lluvia_campana;
  const nasa = lluvia?.valor;
  if (!nasa) return;
  const diferencia = Math.round(((mm - nasa) / nasa) * 100);
  const difiere = Math.abs(diferencia) > UMBRAL_DIFERENCIA_PCT;
  const factor = mm / nasa;
  const umbralSeco = salida.tipos_de_anio.umbral_seco_mm;
  const umbralCorregido = Math.round(umbralSeco * factor);

  salida.contraste_mediciones = [
    {
      indicador: "lluvia_campana",
      valor_productor: mm,
      valor_nasa: nasa,
      diferencia_pct: diferencia,
      confianza_resultante: difiere ? "baja" : "alta",
      corregido_al_lado: {
        umbral_seco_mm: umbralCorregido,
        nota: `Corregido con tu pluviómetro, al lado de NASA: año seco hasta ${umbralCorregido} mm (NASA: ${umbralSeco} mm). No cambia ningún puntaje.`,
      },
    },
  ];
  if (!difiere) return;

  lluvia.confianza = "baja";
  for (const e of salida.estrategias) {
    if (!e.disponible) continue;
    e.valores.agua_mm.confianza = "baja";
    if (e.id === "actual") {
      e.riesgos.push(`Tu pluviómetro difiere ${Math.abs(diferencia)} % de NASA: el dato de agua tiene confianza baja`);
    }
  }
}

function quitarFaltaMateriaOrganica(salida: Salida): void {
  for (const e of salida.estrategias) {
    if (e.disponible) e.vacios = e.vacios.filter((v) => !v.startsWith("Materia orgánica"));
  }
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
/** Pluviómetro que no coincide: 650 mm contra 824 de NASA (−21 %), como el ejemplo del MVP. */
export const MOCK_PLUVIOMETRO: Salida = mockAnalizar({ lluviaAnualMm: 650 });
