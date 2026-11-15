import { describe, expect, it } from "vitest";
import {
  calendario,
  cultivoDeVerano,
  describirSegmento,
  nombreTramo,
  segmentos,
  solapamiento,
  textoSolapamiento,
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

describe("solapamiento (QA H-003)", () => {
  it("maíz y trigo se pisan en octubre y noviembre: el trigo queda de junio a septiembre", () => {
    const s = solapamiento("maiz", "trigo");
    expect(s).toEqual({ verano: "maiz", invierno: "trigo", meses: [9, 10], inviernoQueda: [5, 6, 7, 8] });
    expect(textoSolapamiento(s!)).toBe(
      "Maíz (octubre a abril) y trigo (junio a noviembre) se superponen en octubre y noviembre. " +
        "El calendario muestra trigo de junio a septiembre. Fechas a revisar con el agrónomo.",
    );
  });

  it("girasol y trigo se pisan en septiembre, octubre y noviembre", () => {
    const s = solapamiento("girasol", "trigo")!;
    expect(s.meses).toEqual([8, 9, 10]);
    expect(textoSolapamiento(s)).toContain("se superponen en septiembre, octubre y noviembre");
    expect(textoSolapamiento(s)).toContain("El calendario muestra trigo de junio a agosto.");
  });

  it("girasol y vicia se pisan en septiembre", () => {
    expect(solapamiento("girasol", "vicia")?.meses).toEqual([8]);
  });

  it("soja de 2ª después de trigo, o invierno en barbecho: no se pisan", () => {
    expect(solapamiento("soja", "trigo")).toBeNull();
    expect(solapamiento("soja", "cebada")).toBeNull();
    expect(solapamiento("maiz", "barbecho")).toBeNull();
    expect(solapamiento("soja", "vicia")).toBeNull();
  });

  it("el texto describe, no recomienda", () => {
    for (const v of VERANOS)
      for (const i of INVIERNOS) {
        const s = solapamiento(v, i);
        if (s) expect(textoSolapamiento(s)).not.toMatch(/recomendamos|deberías|la mejor/i);
      }
  });
});
