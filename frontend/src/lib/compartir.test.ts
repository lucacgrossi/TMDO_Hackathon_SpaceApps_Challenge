import { describe, expect, it } from "vitest";
import {
  ASUNTO_MAIL,
  AVISO_APOYO,
  CIERRE_MAIL,
  LARGO_MAX_MAILTO,
  linkMail,
  resumenComparacion,
  resumenMail,
} from "@/lib/compartir";
import { cercaniaPorTipo, type Pesos } from "@/lib/cercania";
import { esDisponible, type Salida } from "@/lib/contrato";
import { AVISO_PRECALCULADO, fmt, metadatosHoja } from "@/lib/formato";
import { MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO, mockAnalizar } from "@/mocks/analizar";

const PESOS: Pesos = { agua: 3, suelo: 3, erosion: 3, ingreso: 3 };
const FECHA = new Date(2026, 10, 14);

/**
 * Lo que tiene que decir la línea del pluviómetro, armado con el contraste del
 * mock: así el test no depende de la lluvia de NASA que tenga el mock.
 */
function lineaPluviometro(salida: Salida): string {
  const c = salida.contraste_mediciones.find((m) => m.indicador === "lluvia_anual");
  if (!c) throw new Error("el mock no trae el contraste del pluviómetro");
  return `${c.texto}: ${c.confianza_resultante === "alta" ? "confianza alta" : "confianza baja en agua"}`;
}

describe("resumen para compartir", () => {
  const texto = resumenComparacion(MOCK_BASE, PESOS, FECHA);

  it("arranca con el lote, el período de clima, la pendiente y las barras", () => {
    const [titulo, lote, objetivos] = texto.split("\n");
    expect(titulo).toBe("AgroPixel · comparación de rotaciones");
    // Los datos del lote salen del mock: si cambia el período de clima, el test sigue valiendo
    expect(lote).toBe(`Lote: ${fmt(MOCK_BASE.lote.area_ha)} ha · ${metadatosHoja(MOCK_BASE, FECHA)}`);
    expect(lote).toContain(`Clima NASA POWER ${MOCK_BASE.periodo_clima}`);
    expect(objetivos).toBe("Prioridades (1 a 5): agua 3 · suelo 3 · erosión 3 · ingreso 3");
  });

  it("tiene una línea por columna con cercanía, cobertura baja y el trío", () => {
    for (const etiqueta of ["Actual · ", "A · ", "B · ", "C · "]) {
      const linea = texto.split("\n").find((l) => l.startsWith(etiqueta));
      expect(linea).toMatch(/cercanía \d+ % · \d+ mes(es)? con cobertura baja · seco \d+ \/ normal \d+ \/ húmedo \d+/);
    }
    // Singular y plural según el valor de cada columna
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) {
      const n = e.valores.meses_cobertura_baja;
      expect(texto).toContain(`${n} ${n === 1 ? "mes" : "meses"} con cobertura baja`);
    }
    expect(texto).not.toMatch(/(^|\D)1 meses/);
  });

  it("la cercanía sigue a las barras (RF13)", () => {
    const soloAgua = resumenComparacion(MOCK_BASE, { agua: 5, suelo: 0, erosion: 0, ingreso: 0 }, FECHA);
    expect(soloAgua).not.toBe(texto);
    const enCero = resumenComparacion(MOCK_BASE, { agua: 0, suelo: 0, erosion: 0, ingreso: 0 }, FECHA);
    expect(enCero).toContain("cercanía — %");
  });

  it("muestra la probabilidad con el conteo de años", () => {
    expect(texto).toContain(MOCK_BASE.estrategias[1].probabilidades[0].texto);
    expect(texto).toContain(`de ${MOCK_BASE.clima_mensual.n_anios} años`);
  });

  it("incluye lo visto por satélite, la información que falta y los datos de prueba", () => {
    const s = MOCK_BASE.visto_por_satelite;
    expect(texto).toContain(
      `Visto por satélite (${s.fuente}, campaña ${s.campana}): NDVI del lote menor a ${fmt(s.umbral, 1)} ` +
        `en ${s.meses_ndvi_bajo} de ${s.meses_con_dato} meses con escena sin nubes`,
    );
    expect(texto).toContain("Información que falta:\n- ");
    expect(texto).toContain(AVISO_PRECALCULADO);
  });

  it("termina con el aviso de apoyo", () => {
    expect(texto.endsWith(AVISO_APOYO)).toBe(true);
  });

  it("la descartada va con su motivo", () => {
    const b = MOCK_DESCARTADA.estrategias[2];
    expect(b.motivo_descarte).toBe("No sembrar trigo ni cebada");
    expect(resumenComparacion(MOCK_DESCARTADA, PESOS, FECHA)).toContain(
      `B · ${b.nombre} (${b.especies}): descartada (${b.motivo_descarte})`,
    );
  });

  it("el pluviómetro va al lado de NASA, con la confianza", () => {
    const t = resumenComparacion(MOCK_PLUVIOMETRO, PESOS, FECHA);
    expect(t).toContain(lineaPluviometro(MOCK_PLUVIOMETRO));
    expect(texto).not.toContain("pluviómetro");
  });

  it("nunca recomienda ni elige", () => {
    for (const salida of [MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO]) {
      const t = resumenComparacion(salida, PESOS, FECHA).toLowerCase();
      expect(t).not.toContain("recomend");
      expect(t).not.toContain("deberías");
      expect(t).not.toContain("la mejor");
    }
  });
});

describe("resumen corto para el mail", () => {
  // El caso más largo: B descartada, pluviómetro que no coincide y materia orgánica
  const completo = mockAnalizar({ noSembrar: ["trigo", "cebada"], lluviaAnualMm: 620, materiaOrganicaPct: 2.5 });
  const corto = resumenMail(completo, PESOS);

  it(`el mailto codificado queda por debajo de ${LARGO_MAX_MAILTO} caracteres`, () => {
    expect(linkMail(corto).length).toBeLessThan(LARGO_MAX_MAILTO);
    // El completo no entraría: por eso el mail usa el corto
    expect(linkMail(resumenComparacion(completo, PESOS, FECHA)).length).toBeGreaterThan(LARGO_MAX_MAILTO);
  });

  it("una línea por columna con la cercanía y el trío; la descartada con su motivo", () => {
    const [actual, , b] = completo.estrategias;
    const t = cercaniaPorTipo(actual.puntos!, PESOS);
    expect(corto).toContain(`Actual, ${actual.nombre}: ${t.normal} (${t.seco} / ${t.normal} / ${t.humedo})`);
    expect(corto).toContain(`B, ${b.nombre}: descartada (${b.motivo_descarte})`);
    expect(corto).toMatch(/^A, Cobertura de invierno: \d+ \(\d+ \/ \d+ \/ \d+\)$/m);
    expect(corto).toMatch(/^C, Diversificar el verano: \d+ \(\d+ \/ \d+ \/ \d+\)$/m);
  });

  it("lleva el pluviómetro, los datos de prueba, el aviso y adónde está el resto", () => {
    expect(corto).toContain(lineaPluviometro(completo));
    expect(corto).toContain(AVISO_PRECALCULADO);
    expect(corto).toContain(AVISO_APOYO);
    expect(corto.endsWith(CIERRE_MAIL)).toBe(true);
  });

  it("la materia orgánica no se presenta como confianza del agua", () => {
    for (const t of [corto, resumenComparacion(completo, PESOS, FECHA)]) {
      const linea = t.split("\n").find((l) => l.startsWith("Materia orgánica"));
      expect(linea).toBeDefined();
      expect(linea).not.toContain("en agua");
    }
  });

  it("nunca recomienda ni elige", () => {
    for (const salida of [MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO, completo]) {
      const t = resumenMail(salida, PESOS).toLowerCase();
      expect(t).not.toContain("recomend");
      expect(t).not.toContain("deberías");
      expect(t).not.toContain("la mejor");
    }
  });
});

describe("link de mail", () => {
  it("lleva el asunto fijo y el resumen codificados", () => {
    const resumen = "Línea 1\nLínea 2 · 50 %";
    const link = linkMail(resumen);
    expect(link.startsWith("mailto:?subject=")).toBe(true);
    const params = new URLSearchParams(link.slice("mailto:?".length).replace(/\+/g, "%2B"));
    expect(params.get("subject")).toBe(ASUNTO_MAIL);
    expect(params.get("body")).toBe(resumen);
  });
});
