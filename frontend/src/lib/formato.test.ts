import { describe, expect, it } from "vitest";
import { conSigno, fmt, metadatosHoja } from "@/lib/formato";
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
      "a 17 km de Río Cuarto, Córdoba · Clima NASA POWER 1995/96–2024/25 · pendiente 0,6 % · 14/11/2026",
    );
  });

  it("sin pendiente muestra una raya, no un número inventado", () => {
    const s = { ...MOCK_BASE, lote: { ...MOCK_BASE.lote, pendiente_pct: { ...MOCK_BASE.lote.pendiente_pct, valor: null } } };
    expect(metadatosHoja(s, new Date(2026, 10, 14))).toContain("pendiente —");
  });
});
