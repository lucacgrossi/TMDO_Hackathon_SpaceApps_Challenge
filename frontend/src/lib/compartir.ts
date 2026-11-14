/**
 * Resumen de la comparación para compartir (RF20, CU5): el `buildMail()` del
 * prototipo. Puro, sin React: lo usan el menú Compartir (mail y portapapeles)
 * y los tests.
 *
 * Plantilla fija, sin IA: cada línea sale de un campo de la salida de
 * /analizar o de las barras de objetivos. Describe datos; nunca indica qué
 * hacer ni elige una alternativa.
 */
import { cercania, cercaniaPorTipo, esSensibleAlClima, type Pesos } from "./cercania";
import { esDisponible, type Estrategia, type Salida } from "./contrato";
import { fmt, metadatosHoja } from "./formato";

export const ASUNTO_MAIL = "Comparación de rotaciones · Field Shift";
export const AVISO_APOYO = "Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo.";

const ETIQUETA = { actual: "Actual", A: "A", B: "B", C: "C" } as const;

const numero = (n: number | null) => (n == null ? "—" : fmt(n));

function lineaEstrategia(e: Estrategia, pesos: Pesos): string[] {
  const titulo = `${ETIQUETA[e.id]} · ${e.nombre} (${e.especies})`;
  if (!esDisponible(e)) return [`${titulo}: descartada (${e.motivo_descarte ?? "sin motivo informado"})`];

  const trio = cercaniaPorTipo(e.puntos, pesos);
  const meses = e.valores.meses_cobertura_baja;
  const partes = [
    `cercanía ${numero(cercania(e.puntos, pesos))} %`,
    `${fmt(meses)} ${meses === 1 ? "mes" : "meses"} con cobertura baja`,
    `seco ${numero(trio.seco)} / normal ${numero(trio.normal)} / húmedo ${numero(trio.humedo)}`,
  ];
  if (esSensibleAlClima(trio)) partes.push("sensible al clima");
  const lineas = [`${titulo}: ${partes.join(" · ")}`];
  // La primera probabilidad climatológica, siempre con el conteo de años (RF25)
  const p = e.probabilidades[0];
  if (p) lineas.push(`  ${p.texto}`);
  return lineas;
}

function lineaSatelite(salida: Salida): string | null {
  const s = salida.visto_por_satelite;
  if (s.meses_ndvi_bajo == null || s.meses_con_dato === 0) return null;
  const campana = s.campana ? `, campaña ${s.campana}` : "";
  return (
    `Visto por satélite (${s.fuente}${campana}): NDVI del lote menor a ${fmt(s.umbral, 1)} ` +
    `en ${s.meses_ndvi_bajo} de ${s.meses_con_dato} meses con escena sin nubes`
  );
}

/**
 * El resumen en texto plano, una línea por dato.
 * `fecha` entra de afuera para que el texto sea el mismo en el servidor, el navegador y los tests.
 */
export function resumenComparacion(salida: Salida, pesos: Pesos, fecha: Date): string {
  const area = `${fmt(salida.lote.area_ha)} ha`;
  const L: string[] = [
    "Field Shift · comparación de rotaciones",
    `Lote: ${area} · ${metadatosHoja(salida, fecha)}`,
    `Objetivos (0 a 5): agua ${pesos.agua} · suelo ${pesos.suelo} · erosión ${pesos.erosion} · ingreso ${pesos.ingreso}`,
    "",
  ];

  for (const e of salida.estrategias) L.push(...lineaEstrategia(e, pesos));

  const satelite = lineaSatelite(salida);
  const contrastes = salida.contraste_mediciones.map(
    (c) => `${c.texto}: ${c.confianza_resultante === "alta" ? "confianza alta" : "confianza baja en agua"}`,
  );
  if (satelite || contrastes.length) L.push("");
  if (satelite) L.push(satelite);
  L.push(...contrastes);

  if (salida.informacion_falta.length) {
    L.push("", "Información que falta:", ...salida.informacion_falta.map((v) => `- ${v}`));
  }
  if (salida.es_mock) L.push("", "Datos de prueba: valores ilustrativos, no son datos de NASA.");

  L.push("", AVISO_APOYO);
  return L.join("\n");
}

/** Link `mailto:` sin destinatario: el productor elige a quién mandarlo. */
export function linkMail(resumen: string): string {
  return `mailto:?subject=${encodeURIComponent(ASUNTO_MAIL)}&body=${encodeURIComponent(resumen)}`;
}
