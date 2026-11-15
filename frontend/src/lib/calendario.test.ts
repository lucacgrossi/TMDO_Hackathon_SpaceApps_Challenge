import { describe, expect, it } from "vitest";
import {
  calendario,
  cultivoDeVerano,
  describirSegmento,
  mesesDeInvierno,
  mesesDeVerano,
  nombreTramo,
  notaCalendario,
  segmentos,
} from "@/lib/calendario";
import { INVIERNOS, VERANOS } from "@/lib/entradas";

describe("calendario", () => {
  it("siempre 12 meses", () => {
    for (const v of VERANOS) for (const i of INVIERNOS) expect(calendario(v, i)).toHaveLength(12);
  });

  it("soja después de trigo o cebada es soja 2ª; el resto queda igual", () => {
    expect(cultivoDeVerano("soja", "trigo")).toBe("soja2");
    expect(cultivoDeVerano("soja", "cebada")).toBe("soja2");
    expect(cultivoDeVerano("soja", "vicia")).toBe("soja");
    expect(cultivoDeVerano("maiz", "trigo")).toBe("maiz");
  });
});

describe("nombres de los tramos (QA H-027)", () => {
  it("el barbecho es 'Barbecho (pelado)' en el rótulo y en el aria-label", () => {
    expect(nombreTramo("barbecho")).toBe("Barbecho (pelado)");
    const barbecho = segmentos(calendario("soja", "barbecho")).find((s) => s.cultivo === "barbecho");
    expect(barbecho && describirSegmento(barbecho)).toBe("Barbecho (pelado): julio a octubre");
  });

  it("los cultivos usan su nombre", () => {
    expect(nombreTramo("soja2")).toBe("Soja 2ª");
  });
});

describe("regla del motor para el calendario (QA H-003)", () => {
  /** Meses (0 = enero) que ocupa un cultivo en el calendario armado. */
  const ocupa = (v: string, i: string, c: string) =>
    calendario(v, i)
      .map((x, m) => (x === c ? m : -1))
      .filter((m) => m >= 0);

  it("con trigo o cebada, el invierno conserva junio a noviembre y el verano va de 2ª, diciembre a abril", () => {
    for (const v of VERANOS)
      for (const i of ["trigo", "cebada"]) {
        expect(ocupa(v, i, i)).toEqual([5, 6, 7, 8, 9, 10]);
        expect(ocupa(v, i, cultivoDeVerano(v, i))).toEqual([0, 1, 2, 3, 11]);
        expect(calendario(v, i)[4]).toBe("barbecho"); // mayo
      }
  });

  it("la soja pasa a soja 2ª; maíz, girasol, sorgo y maní mantienen su clave", () => {
    expect(calendario("soja", "trigo")[0]).toBe("soja2");
    expect(calendario("maiz", "trigo")[0]).toBe("maiz");
    expect(calendario("girasol", "cebada")[0]).toBe("girasol");
  });

  it("sin invierno comercial, el verano queda en su ventana típica", () => {
    expect(mesesDeVerano("maiz", "barbecho")).toEqual([9, 10, 11, 0, 1, 2, 3]);
    expect(mesesDeVerano("girasol", "vicia")).toEqual([8, 9, 10, 11, 0, 1]);
  });

  it("la cobertura se seca el mes anterior a la siembra de verano, que queda en barbecho", () => {
    // Girasol se siembra en septiembre: agosto es el secado, la vicia va de mayo a julio.
    expect(mesesDeInvierno("girasol", "vicia")).toEqual([4, 5, 6]);
    expect(calendario("girasol", "vicia")[7]).toBe("barbecho");
    // Maíz en octubre: septiembre es el secado.
    expect(mesesDeInvierno("maiz", "centeno")).toEqual([4, 5, 6, 7]);
    // Soja en noviembre: la vicia ya terminó en septiembre, no cambia.
    expect(mesesDeInvierno("soja", "vicia")).toEqual([4, 5, 6, 7, 8]);
  });

  it("verano e invierno nunca se pisan", () => {
    for (const v of VERANOS)
      for (const i of INVIERNOS) {
        const ver = mesesDeVerano(v, i);
        expect(mesesDeInvierno(v, i).some((m) => ver.includes(m))).toBe(false);
      }
  });
});

describe("notaCalendario (QA H-003)", () => {
  it("con trigo o cebada dice que el verano va de 2ª y cuándo va cada uno", () => {
    expect(notaCalendario("maiz", "trigo")).toBe(
      "Con trigo en invierno, el maíz va de 2ª: diciembre a abril, con mayo en barbecho. El trigo va de junio a noviembre.",
    );
    expect(notaCalendario("soja", "cebada")).toBe(
      "Con cebada en invierno, la soja va de 2ª: diciembre a abril, con mayo en barbecho. La cebada va de junio a noviembre.",
    );
  });

  it("con una cobertura recortada por el secado, dice cuándo se seca", () => {
    expect(notaCalendario("girasol", "vicia")).toBe(
      "La vicia se seca en agosto, el mes anterior a la siembra de girasol: va de mayo a julio.",
    );
  });

  it("sin cambios de ventana, no hay nota", () => {
    expect(notaCalendario("soja", "barbecho")).toBeNull();
    expect(notaCalendario("soja", "vicia")).toBeNull();
    expect(notaCalendario("sorgo", "centeno")).toBeNull();
  });

  it("describe, no recomienda", () => {
    for (const v of VERANOS)
      for (const i of INVIERNOS) expect(notaCalendario(v, i) ?? "").not.toMatch(/recomendamos|deberías|la mejor/i);
  });
});
