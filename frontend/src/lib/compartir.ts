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
import { esDisponible, type ContrasteMedicion, type Estrategia, type Salida } from "./contrato";
import { AVISO_PRECALCULADO, fmt, metadatosHoja } from "./formato";

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

/**
 * Medición del productor al lado de NASA (RF15). La confianza solo se nombra
 * cuando el contraste la cambia: la materia orgánica no tiene dato de NASA y
 * llega con `confianza_resultante: null`.
 */
function textoContraste(c: ContrasteMedicion): string {
  if (c.confianza_resultante == null) return c.texto;
  if (c.confianza_resultante === "alta") return `${c.texto}: confianza alta`;
  return `${c.texto}: confianza baja${c.indicador === "lluvia_anual" ? " en agua" : ""}`;
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
  const contrastes = salida.contraste_mediciones.map(textoContraste);
  if (satelite || contrastes.length) L.push("");
  if (satelite) L.push(satelite);
  L.push(...contrastes);

  if (salida.informacion_falta.length) {
    L.push("", "Información que falta:", ...salida.informacion_falta.map((v) => `- ${v}`));
  }
  if (salida.es_mock) L.push("", AVISO_PRECALCULADO);

  L.push("", AVISO_APOYO);
  return L.join("\n");
}

/**
 * Largo máximo del link `mailto:` ya codificado. Outlook y el manejador de
 * Windows cortan o rechazan los links de más de ~2.000 caracteres; con este
 * margen el mail sale entero.
 */
export const LARGO_MAX_MAILTO = 1800;

export const CIERRE_MAIL =
  "El resumen completo, con probabilidades e información que falta, se copia con «Copiar resumen» en Field Shift.";

/**
 * Versión corta para "Enviar por mail" (el link `mailto:` tiene que entrar en
 * `LARGO_MAX_MAILTO`). Una línea por columna con la cercanía y el trío; el
 * resto queda en el resumen completo, que se copia o se guarda en PDF.
 */
export function resumenMail(salida: Salida, pesos: Pesos): string {
  const L: string[] = [
    "Field Shift: comparación de rotaciones",
    `Lote: ${fmt(salida.lote.area_ha)} ha${salida.lote.localidad_aprox ? `, ${salida.lote.localidad_aprox}` : ""}`,
    `Objetivos (0 a 5): agua ${pesos.agua}, suelo ${pesos.suelo}, erosión ${pesos.erosion}, ingreso ${pesos.ingreso}`,
    "",
    "Cercanía % (seco / normal / húmedo):",
  ];
  for (const e of salida.estrategias) {
    const titulo = `${ETIQUETA[e.id]}, ${e.nombre}`;
    if (!esDisponible(e)) {
      L.push(`${titulo}: descartada (${e.motivo_descarte ?? "sin motivo informado"})`);
      continue;
    }
    const t = cercaniaPorTipo(e.puntos, pesos);
    L.push(`${titulo}: ${numero(t.normal)} (${numero(t.seco)} / ${numero(t.normal)} / ${numero(t.humedo)})`);
  }
  const contrastes = salida.contraste_mediciones.map(textoContraste);
  if (contrastes.length) L.push("", ...contrastes);
  if (salida.es_mock) L.push("", AVISO_PRECALCULADO);
  L.push("", AVISO_APOYO, CIERRE_MAIL);
  return L.join("\n");
}

/** Link `mailto:` sin destinatario: el productor elige a quién mandarlo. */
export function linkMail(resumen: string): string {
  return `mailto:?subject=${encodeURIComponent(ASUNTO_MAIL)}&body=${encodeURIComponent(resumen)}`;
}
