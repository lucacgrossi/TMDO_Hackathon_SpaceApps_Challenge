import { describe, expect, it } from "vitest";
import { esDisponible, type Salida } from "@/lib/contrato";
import { MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO, MOCK_SIN_MEZCLA, mockAnalizar } from "@/mocks/analizar";

const puntos = (s: Salida) => s.estrategias.map((e) => ({ id: e.id, puntos: e.puntos, cercania: e.cercania }));

describe("mock de /analizar · forma del contrato", () => {
  it.each([
    ["base", MOCK_BASE],
    ["descartada", MOCK_DESCARTADA],
    ["pluviómetro", MOCK_PLUVIOMETRO],
  ])("%s: siempre 4 columnas en orden actual, A, B, C", (_, s) => {
    expect(s.estrategias.map((e) => e.id)).toEqual(["actual", "A", "B", "C"]);
  });

  it("dice que es un mock", () => {
    expect(MOCK_BASE.es_mock).toBe(true);
  });

  it("los arrays mensuales tienen 12 meses", () => {
    const c = MOCK_BASE.clima_mensual;
    for (const a of [c.lluvia_mm, c.minima_media_c, c.maxima_media_c, c.anios_con_helada, c.anios_con_35c]) {
      expect(a).toHaveLength(12);
    }
    expect(MOCK_BASE.visto_por_satelite.meses).toHaveLength(12);
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) expect(e.calendario).toHaveLength(12);
  });

  it("las probabilidades muestran el conteo de años, no solo el porcentaje", () => {
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) {
      expect(e.probabilidades.length).toBeGreaterThan(0);
      for (const p of e.probabilidades) expect(p.texto).toContain(`${p.anios} de ${p.de} años (${p.pct} %)`);
    }
  });

  it("los textos describen datos: nunca recomiendan ni eligen", () => {
    const texto = JSON.stringify([MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO]).toLowerCase();
    for (const prohibido of ["recomend", "deberías", "deberia", "la mejor", "el mejor"]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});

describe("mock de /analizar · variantes", () => {
  it("No sembrar trigo ni cebada descarta B con el motivo y sin datos", () => {
    const b = MOCK_DESCARTADA.estrategias[2];
    expect(b).toMatchObject({ disponible: false, motivo_descarte: "No sembrar trigo ni cebada", puntos: null });
    expect(esDisponible(b)).toBe(false);
  });

  it("excluir un solo cultivo no descarta la alternativa", () => {
    expect(mockAnalizar({ noSembrar: ["trigo"] }).estrategias[2].disponible).toBe(true);
  });

  it("pluviómetro de 620 mm: −19 % contra NASA, confianza baja y nota para el agrónomo", () => {
    const [c] = MOCK_PLUVIOMETRO.contraste_mediciones;
    expect(c).toMatchObject({ valor_productor: 620, valor_nasa: 769, diferencia_pct: -19, confianza_resultante: "baja" });
    expect(c.texto).toBe("Tu pluviómetro: 620 mm/año · NASA: 769 mm (−19 %)");
    expect(MOCK_PLUVIOMETRO.indicadores.lluvia_anual.confianza).toBe("baja");
    expect(MOCK_PLUVIOMETRO.estrategias[0].riesgos.some((r) => r.includes("difiere 19 %"))).toBe(true);
  });

  it("el mock no simula la mezcla en los puntajes y lo dice en lo que falta", () => {
    // En el back la lluvia del productor sí mueve los puntos (MVP 4.3); el mock no lo imita
    expect(puntos(MOCK_PLUVIOMETRO)).toEqual(puntos(MOCK_BASE));
    expect(MOCK_PLUVIOMETRO.informacion_falta).toContain(MOCK_SIN_MEZCLA);
    expect(MOCK_BASE.informacion_falta).not.toContain(MOCK_SIN_MEZCLA);
  });

  it.each([
    ["pluviómetro que coincide", { lluviaAnualMm: 760 }],
    ["materia orgánica", { materiaOrganicaPct: 2.4 }],
    ["pluviómetro que no coincide + materia orgánica", { lluviaAnualMm: 620, materiaOrganicaPct: 2.4 }],
    // El mock no simula la mezcla del motor (MVP 4.3): en el back la lluvia sí mueve los puntos
  ])("%s: el mock deja los puntos y los valores como estaban", (_, opciones) => {
    const s = mockAnalizar(opciones);
    expect(puntos(s)).toEqual(puntos(MOCK_BASE));
    expect(s.estrategias.map((e) => e.valores)).toEqual(MOCK_BASE.estrategias.map((e) => e.valores));
  });

  it("la nota para el agrónomo va solo en la actual", () => {
    for (const e of MOCK_PLUVIOMETRO.estrategias.slice(1)) {
      expect(e.riesgos.some((r) => r.includes("pluviómetro"))).toBe(false);
    }
  });

  it("decide con la diferencia exacta: 650 mm es −15,5 %, pasa el 15 % y baja la confianza", () => {
    expect(mockAnalizar({ lluviaAnualMm: 650 }).contraste_mediciones[0].confianza_resultante).toBe("baja");
  });

  it("un pluviómetro que coincide (±15 %) deja la confianza como estaba", () => {
    const s = mockAnalizar({ lluviaAnualMm: 760 });
    expect(s.contraste_mediciones[0].confianza_resultante).toBe("alta");
    expect(s.indicadores.lluvia_anual.confianza).toBe(MOCK_BASE.indicadores.lluvia_anual.confianza);
  });

  it("sin mediciones el contraste viene vacío", () => {
    expect(MOCK_BASE.contraste_mediciones).toEqual([]);
  });

  it("la materia orgánica llega como dato del productor, sin NASA, y deja de figurar en lo que falta", () => {
    const s = mockAnalizar({ materiaOrganicaPct: 2.4 });
    expect(s.contraste_mediciones).toEqual([
      expect.objectContaining({
        indicador: "materia_organica",
        valor_productor: 2.4,
        valor_nasa: null,
        diferencia_pct: null,
        confianza_resultante: null,
      }),
    ]);
    const textos = [...s.informacion_falta, ...s.estrategias.flatMap((e) => e.vacios)];
    expect(textos.some((v) => v.startsWith("Materia orgánica"))).toBe(false);
  });

  it("cada llamada devuelve una copia: no se pisa el mock base", () => {
    mockAnalizar({ lluviaAnualMm: 620 });
    expect(MOCK_BASE.contraste_mediciones).toEqual([]);
    expect(MOCK_BASE.estrategias[0].riesgos.some((r) => r.includes("pluviómetro"))).toBe(false);
  });
});
