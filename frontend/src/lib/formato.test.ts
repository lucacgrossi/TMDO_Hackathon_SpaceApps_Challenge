import { describe, expect, it } from "vitest";
import {
  conSigno,
  ETIQUETA_TRAMO,
  fmt,
  listaMeses,
  mesesConAnios,
  metadatosHoja,
  NOMBRE_CULTIVO,
  rangoMeses,
  textoEfecto,
  tramosCalendario,
} from "@/lib/formato";
import { MOCK_BASE } from "@/mocks/analizar";

describe("formato es-AR", () => {
  it("usa coma decimal y punto de miles", () => {
    expect(fmt(0.6, 1)).toBe("0,6");
    expect(fmt(1234.4)).toBe("1.234");
  });

  it("pone el signo menos tipográfico y el más", () => {
    expect(conSigno(-60)).toBe("−60");
    expect(conSigno(5)).toBe("+5");
    expect(conSigno(0)).toBe("0");
  });
});

describe("metadatos de la hoja", () => {
  it("lote, período de clima, pendiente y fecha", () => {
    expect(metadatosHoja(MOCK_BASE, new Date(2026, 10, 14))).toBe(
      "Clima NASA POWER 1996/97 a 2025/26 · pendiente 0,6 % · 14/11/2026",
    );
  });

  it("sin pendiente muestra una raya, no un número inventado", () => {
    const s = { ...MOCK_BASE, lote: { ...MOCK_BASE.lote, pendiente_pct: { ...MOCK_BASE.lote.pendiente_pct, valor: null } } };
    expect(metadatosHoja(s, new Date(2026, 10, 14))).toContain("pendiente —");
  });
});

describe("calendario y meses", () => {
  const sojaBarbecho = MOCK_BASE.estrategias[0].calendario!;

  it("arma los tramos en el orden de la campaña, de julio a junio", () => {
    expect(tramosCalendario(sojaBarbecho)).toEqual([
      { cultivo: "barbecho", desde: 6, hasta: 9, meses: 4 },
      { cultivo: "soja", desde: 10, hasta: 3, meses: 6 },
      { cultivo: "barbecho", desde: 4, hasta: 5, meses: 2 },
    ]);
  });

  it("los tramos suman siempre 12 meses", () => {
    for (const e of MOCK_BASE.estrategias) {
      if (e.calendario) expect(tramosCalendario(e.calendario).reduce((s, t) => s + t.meses, 0)).toBe(12);
    }
  });

  it("nombra rangos y meses sueltos en orden de campaña", () => {
    expect(rangoMeses({ desde: 10, hasta: 3 })).toBe("nov a abr");
    expect(rangoMeses({ desde: 4, hasta: 4 })).toBe("may");
    expect(listaMeses([0, 11])).toBe("dic, ene");
  });

  it("acompaña cada mes con su conteo de años", () => {
    const anios = MOCK_BASE.clima_mensual.anios_con_35c;
    expect(mesesConAnios([0, 11], anios, 30)).toBe("dic (26 de 30 años), ene (29 de 30 años)");
    expect(mesesConAnios([], anios, 30)).toBe("");
  });

  it("redondea el efecto de una regla y nombra la dimensión", () => {
    expect(textoEfecto({ agua: 20.506 })).toBe("agua 21");
    expect(textoEfecto({ erosion: -12 })).toBe("erosión −12");
  });
});

describe("etiquetas de los tramos del calendario", () => {
  it("tres largos fijos por cultivo: completa, abreviatura de hasta 4 letras e inicial", () => {
    for (const [cultivo, et] of Object.entries(ETIQUETA_TRAMO)) {
      expect(et.corta.length, cultivo).toBeLessThanOrEqual(4);
      expect(et.inicial).toHaveLength(1);
      expect(et.completa.startsWith(et.inicial), cultivo).toBe(true);
    }
  });

  it("el nombre completo es el mismo que en el title, salvo el barbecho, que se lee Pelado", () => {
    for (const c of Object.keys(ETIQUETA_TRAMO) as (keyof typeof ETIQUETA_TRAMO)[]) {
      if (c === "barbecho") continue;
      expect(ETIQUETA_TRAMO[c].completa).toBe(NOMBRE_CULTIVO[c]);
    }
    expect(ETIQUETA_TRAMO.barbecho).toEqual({ completa: "Pelado", corta: "Pel.", inicial: "P" });
    expect(NOMBRE_CULTIVO.barbecho).toBe("Barbecho (pelado)");
  });
});
