import { describe, expect, it } from "vitest";
import { destinoTab } from "./focoAtrapado";

describe("destinoTab", () => {
  it("avanza y retrocede de a uno", () => {
    expect(destinoTab(0, 4, false)).toBe(1);
    expect(destinoTab(2, 4, true)).toBe(1);
  });

  it("da la vuelta en los extremos", () => {
    expect(destinoTab(3, 4, false)).toBe(0);
    expect(destinoTab(0, 4, true)).toBe(3);
  });

  it("desde fuera de la lista va al primero o al último", () => {
    expect(destinoTab(-1, 4, false)).toBe(0);
    expect(destinoTab(-1, 4, true)).toBe(3);
    expect(destinoTab(9, 4, false)).toBe(0);
  });

  it("con un solo control se queda en él", () => {
    expect(destinoTab(0, 1, false)).toBe(0);
    expect(destinoTab(0, 1, true)).toBe(0);
  });

  it("sin controles devuelve -1", () => {
    expect(destinoTab(-1, 0, false)).toBe(-1);
  });
});
