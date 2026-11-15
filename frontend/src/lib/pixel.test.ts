import { describe, expect, it } from "vitest";
import { ICONOS, trazoDesdeGrilla } from "@/lib/pixel";

describe("trazoDesdeGrilla", () => {
  it("une los píxeles seguidos de una fila en un solo rectángulo", () => {
    expect(trazoDesdeGrilla([".###."])).toBe("M1 0h3v1h-3z");
  });

  it("un rectángulo por tramo y por fila, con la fila como y", () => {
    expect(trazoDesdeGrilla(["#.#", "...", "##."])).toBe("M0 0h1v1h-1zM2 0h1v1h-1zM0 2h2v1h-2z");
  });

  it("una grilla vacía no dibuja nada", () => {
    expect(trazoDesdeGrilla(["....", "...."])).toBe("");
  });
});

describe("ICONOS", () => {
  it.each(Object.entries(ICONOS))("%s mide 16 × 16 y solo usa '#' y '.'", (_nombre, grilla) => {
    expect(grilla).toHaveLength(16);
    for (const fila of grilla) expect(fila).toMatch(/^[#.]{16}$/);
  });

  it("los 6 íconos del Figma", () => {
    expect(Object.keys(ICONOS).sort()).toEqual(["capas", "clima", "editar", "imprimir", "mapa", "rotacion"]);
  });
});
