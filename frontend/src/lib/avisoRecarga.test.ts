import { describe, expect, it } from "vitest";
import { PAUSA_MS, debeAvisar, pausarAvisoRecarga } from "./avisoRecarga";

describe("aviso al recargar el dashboard", () => {
  it("avisa por defecto", () => {
    expect(debeAvisar(Date.now() + 10 * PAUSA_MS)).toBe(true);
  });

  it("no avisa durante la pausa del link de mail y vuelve a avisar después", () => {
    pausarAvisoRecarga(1_000_000);
    expect(debeAvisar(1_000_000)).toBe(false);
    expect(debeAvisar(1_000_000 + PAUSA_MS - 1)).toBe(false);
    expect(debeAvisar(1_000_000 + PAUSA_MS)).toBe(true);
  });
});
