import { describe, expect, it } from "vitest";
import { esDisponible } from "@/lib/contrato";
import { colorNdvi, indiceCampania, mesesLinea, NDVI_COLORES } from "@/lib/linea";
import { MOCK_BASE } from "@/mocks/analizar";

describe("línea de la campaña", () => {
  it("julio es el primer mes de la campaña y junio el último", () => {
    expect(indiceCampania(6)).toBe(0);
    expect(indiceCampania(5)).toBe(11);
    expect(indiceCampania(0)).toBe(6);
  });

  it("arma 12 meses de julio a junio con helada y calor del contrato", () => {
    const actual = MOCK_BASE.estrategias[0];
    if (!esDisponible(actual)) throw new Error("la actual siempre está disponible");
    const meses = mesesLinea(MOCK_BASE, actual);
    expect(meses.map((m) => m.mes)).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
    // Soja + barbecho: helada frecuente de junio a septiembre, calor con soja de noviembre a marzo
    expect(meses.filter((m) => m.heladaFrecuente).map((m) => m.mes)).toEqual([6, 7, 8, 5]);
    expect(meses.filter((m) => m.calor).map((m) => m.mes)).toEqual([10, 11, 0, 1, 2]);
    expect(meses.some((m) => m.conflictoHelada)).toBe(false);
  });

  it("pinta el NDVI con la escala clasificada: 0,3 separa pelado de vegetación", () => {
    expect(colorNdvi(0.26)).toBe(NDVI_COLORES[1]);
    expect(colorNdvi(0.3)).toBe(NDVI_COLORES[2]);
    expect(colorNdvi(0.81)).toBe(NDVI_COLORES[5]);
    expect(colorNdvi(-0.1)).toBe(NDVI_COLORES[0]);
  });
});
