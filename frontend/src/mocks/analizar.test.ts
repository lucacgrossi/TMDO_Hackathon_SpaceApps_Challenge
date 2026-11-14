import { describe, expect, it } from "vitest";
import { esDisponible, OBJETIVOS, TIPOS_DE_ANIO, type Salida } from "@/lib/contrato";
import { MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO, mockAnalizar } from "@/mocks/analizar";

const puntajes = (s: Salida) =>
  s.estrategias.filter(esDisponible).map((e) => ({ id: e.id, normal: e.cercania_objetivos, tipos: e.valores_por_tipo_anio }));

describe("mock de /analizar · forma del contrato", () => {
  it.each([
    ["base", MOCK_BASE],
    ["descartada", MOCK_DESCARTADA],
    ["pluviómetro", MOCK_PLUVIOMETRO],
  ])("%s: siempre 4 columnas en orden actual, A, B, C", (_, s) => {
    expect(s.estrategias.map((e) => e.id)).toEqual(["actual", "A", "B", "C"]);
  });

  it("los arrays mensuales tienen 12 meses", () => {
    const c = MOCK_BASE.clima_mensual;
    for (const a of [c.lluvia_mm, c.minima_media_c, c.maxima_media_c, c.anios_con_helada, c.anios_con_35c]) {
      expect(a).toHaveLength(12);
    }
    expect(MOCK_BASE.visto_por_satelite?.meses).toHaveLength(12);
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) expect(e.calendario).toHaveLength(12);
  });

  it("30 campañas cortadas en terciles de 10", () => {
    const t = MOCK_BASE.tipos_de_anio;
    expect(MOCK_BASE.serie_anual?.campanas).toHaveLength(30);
    expect([t.seco.length, t.normal.length, t.humedo.length]).toEqual([10, 10, 10]);
  });

  it("cada estrategia trae los 5 puntos y puntajes por tipo de año", () => {
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) {
      expect(e.por_que.length).toBeGreaterThan(0);
      expect(e.evidencia.length).toBeGreaterThan(0);
      expect(e.vacios.length).toBeGreaterThan(0);
      expect(Array.isArray(e.beneficios)).toBe(true);
      expect(Array.isArray(e.riesgos)).toBe(true);
      for (const t of TIPOS_DE_ANIO) for (const o of OBJETIVOS) {
        expect(e.valores_por_tipo_anio[t].puntajes[o]).toBeGreaterThanOrEqual(0);
        expect(e.valores_por_tipo_anio[t].puntajes[o]).toBeLessThanOrEqual(100);
      }
    }
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
  it("No sembrar trigo ni cebada descarta B con el motivo", () => {
    const b = MOCK_DESCARTADA.estrategias[2];
    expect(b.disponible).toBe(false);
    expect(b.motivo_descarte).toBe("No sembrar trigo ni cebada");
  });

  it("excluir un solo cultivo no descarta la alternativa", () => {
    expect(mockAnalizar({ noSembrar: ["trigo"] }).estrategias[2].disponible).toBe(true);
  });

  it("pluviómetro de 650 mm: −21 % contra NASA, confianza baja y nota para el agrónomo", () => {
    const [c] = MOCK_PLUVIOMETRO.contraste_mediciones;
    expect(c).toMatchObject({ valor_productor: 650, valor_nasa: 824, diferencia_pct: -21, confianza_resultante: "baja" });
    const actual = MOCK_PLUVIOMETRO.estrategias[0];
    if (!esDisponible(actual)) throw new Error("la actual siempre está disponible");
    expect(actual.valores.agua_mm.confianza).toBe("baja");
    expect(actual.riesgos.some((r) => r.includes("pluviómetro difiere 21 %"))).toBe(true);
  });

  it("el pluviómetro no cambia ningún puntaje", () => {
    expect(puntajes(MOCK_PLUVIOMETRO)).toEqual(puntajes(MOCK_BASE));
  });

  it("un pluviómetro que coincide (±15 %) deja la confianza alta", () => {
    const s = mockAnalizar({ lluviaAnualMm: 800 });
    expect(s.contraste_mediciones[0].confianza_resultante).toBe("alta");
    expect(s.indicadores.lluvia_campana.confianza).toBe("alta");
  });

  it("sin mediciones el contraste viene vacío", () => {
    expect(MOCK_BASE.contraste_mediciones).toEqual([]);
  });

  it("con materia orgánica cargada deja de figurar en lo que falta", () => {
    const s = mockAnalizar({ materiaOrganicaPct: 2.4 });
    for (const e of s.estrategias.filter(esDisponible)) {
      expect(e.vacios.some((v) => v.startsWith("Materia orgánica"))).toBe(false);
    }
  });

  it("cada llamada devuelve una copia: no se pisa el mock base", () => {
    mockAnalizar({ lluviaAnualMm: 650 });
    expect(MOCK_BASE.indicadores.lluvia_campana.confianza).toBe("alta");
  });
});
