import { describe, expect, it } from "vitest";
import { celdaPower, posicionEnCelda } from "./zonaClima";

describe("zona del dato de clima", () => {
  it("la celda de POWER contiene al lote demo y mide 0,5° × 0,625°", () => {
    const [[s, o], [n, e]] = celdaPower([-33.2477, -64.2325]);
    expect(s).toBeLessThan(-33.2477);
    expect(n).toBeGreaterThan(-33.2477);
    expect(o).toBeLessThan(-64.2325);
    expect(e).toBeGreaterThan(-64.2325);
    expect(n - s).toBeCloseTo(0.5);
    expect(e - o).toBeCloseTo(0.625);
  });

  it("describe la posición dentro de la celda", () => {
    // Celda centrada en (-33, -64.375): el centro está bien adentro.
    expect(posicionEnCelda([-33, -64.375])).toBe("bien adentro");
    expect(posicionEnCelda([-33.24, -64.375])).toBe("cerca del borde sur");
    expect(posicionEnCelda([-32.76, -64.07])).toBe("cerca del borde norte-este");
  });
});
