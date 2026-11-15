import { describe, expect, it } from "vitest";
import { ENTRADAS_INICIALES, noSembrarEnLaRotacion } from "@/lib/entradas";

describe("ENTRADAS_INICIALES", () => {
  it("encharca y textura arrancan en 'No sé': nada inventado (QA H-011)", () => {
    expect(ENTRADAS_INICIALES.anegable).toBe("no_se");
    expect(ENTRADAS_INICIALES.textura).toBe("no_se");
  });
});

describe("noSembrarEnLaRotacion", () => {
  it("devuelve los cultivos de 'No sembrar' que están en la rotación actual (QA H-025)", () => {
    expect(noSembrarEnLaRotacion({ verano: "soja", invierno: "trigo", noSembrar: ["trigo"] })).toEqual(["trigo"]);
    expect(noSembrarEnLaRotacion({ verano: "girasol", invierno: "vicia", noSembrar: ["girasol", "vicia", "sorgo"] })).toEqual([
      "vicia",
      "girasol",
    ]);
  });

  it("sin choque, lista vacía", () => {
    expect(noSembrarEnLaRotacion({ verano: "soja", invierno: "barbecho", noSembrar: ["trigo", "sorgo"] })).toEqual([]);
    expect(noSembrarEnLaRotacion({ verano: "soja", invierno: "trigo", noSembrar: [] })).toEqual([]);
  });
});
