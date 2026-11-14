import { describe, expect, it } from "vitest";
import {
  cercania,
  cercaniaEstrategia,
  cercaniaPorTipo,
  choqueObjetivos,
  esSensibleAlClima,
  type Pesos,
} from "@/lib/cercania";
import { esDisponible, type EstrategiaDisponible } from "@/lib/contrato";
import { MOCK_BASE, MOCK_DESCARTADA } from "@/mocks/analizar";

const IGUALES: Pesos = { agua: 3, suelo: 3, erosion: 3, ingreso: 3 };
const disponible = (i: number): EstrategiaDisponible => {
  const e = MOCK_BASE.estrategias[i];
  if (!esDisponible(e)) throw new Error("se esperaba una estrategia disponible");
  return e;
};

describe("cercania (sc del prototipo)", () => {
  it("con barras iguales es el promedio simple, redondeado", () => {
    expect(cercania({ agua: 100, suelo: 32, erosion: 48, ingreso: 50 }, IGUALES)).toBe(58);
  });

  it("pondera por las barras", () => {
    const p = { agua: 100, suelo: 0, erosion: 0, ingreso: 0 };
    expect(cercania(p, { agua: 5, suelo: 0, erosion: 0, ingreso: 0 })).toBe(100);
    expect(cercania(p, { agua: 1, suelo: 1, erosion: 1, ingreso: 1 })).toBe(25);
  });

  it("con todas las barras en 0 no hay cercanía (null), no un 0", () => {
    expect(cercania({ agua: 80, suelo: 80, erosion: 80, ingreso: 80 }, { agua: 0, suelo: 0, erosion: 0, ingreso: 0 })).toBeNull();
  });

  it("usa los puntajes del tipo de año pedido", () => {
    const actual = disponible(0);
    expect(cercaniaEstrategia(actual, { agua: 1, suelo: 0, erosion: 0, ingreso: 0 }, "seco")).toBe(
      actual.valores_por_tipo_anio.seco.puntajes.agua,
    );
  });
});

describe("tipos de año", () => {
  it("devuelve el trío seco / normal / húmedo", () => {
    const t = cercaniaPorTipo(disponible(1), IGUALES);
    expect(t.seco).not.toBeNull();
    expect(t.seco!).toBeLessThan(t.humedo!);
  });

  it("marca sensible al clima con 15 puntos o más de diferencia", () => {
    expect(esSensibleAlClima({ seco: 50, normal: 60, humedo: 65 })).toBe(true);
    expect(esSensibleAlClima({ seco: 50, normal: 55, humedo: 64 })).toBe(false);
    expect(esSensibleAlClima({ seco: null, normal: null, humedo: null })).toBe(false);
  });

  it("con las barras en 3, coincide con el sensible_clima que manda el mock", () => {
    for (const e of MOCK_BASE.estrategias.filter(esDisponible)) {
      expect(esSensibleAlClima(cercaniaPorTipo(e, IGUALES))).toBe(e.sensible_clima);
    }
  });
});

describe("choque de objetivos", () => {
  it("sin dos objetivos fuertes no hay choque", () => {
    expect(choqueObjetivos(MOCK_BASE.estrategias, IGUALES)).toBeNull();
  });

  it("agua 5 e ingreso 4: en agua queda más cerca C y en ingreso B", () => {
    const pesos = { agua: 5, suelo: 1, erosion: 1, ingreso: 4 };
    expect(choqueObjetivos(MOCK_BASE.estrategias, pesos)).toEqual({
      objetivos: ["agua", "ingreso"],
      masCerca: ["C", "B"],
    });
  });

  it("ignora las alternativas descartadas: sin B, C queda más cerca en los dos y no hay choque", () => {
    const pesos = { agua: 5, suelo: 1, erosion: 1, ingreso: 4 };
    expect(choqueObjetivos(MOCK_DESCARTADA.estrategias, pesos)).toBeNull();
  });
});
