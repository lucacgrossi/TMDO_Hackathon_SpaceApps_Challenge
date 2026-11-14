import { describe, expect, it } from "vitest";
import {
  cercania,
  cercaniaPorTipo,
  choqueObjetivos,
  esSensibleAlClima,
  redondearComoBackend,
  type Pesos,
} from "@/lib/cercania";
import { esDisponible, TIPOS_DE_ANIO, type Puntos } from "@/lib/contrato";
import { MOCK_BASE, MOCK_DESCARTADA } from "@/mocks/analizar";

const IGUALES: Pesos = { agua: 3, suelo: 3, erosion: 3, ingreso: 3 };
const disponibles = MOCK_BASE.estrategias.filter(esDisponible);
const puntos = (agua: number, suelo: number, erosion: number, ingreso: number): Puntos => ({
  agua: { seco: agua, normal: agua, humedo: agua },
  suelo,
  erosion,
  ingreso,
});

describe("cercania (fórmula del contrato, sc del prototipo)", () => {
  it("con barras iguales es el promedio simple, redondeado", () => {
    expect(cercania(puntos(53, 32, 48, 50), IGUALES)).toBe(46);
  });

  it("pondera por las barras", () => {
    const p = puntos(100, 0, 0, 0);
    expect(cercania(p, { agua: 5, suelo: 0, erosion: 0, ingreso: 0 })).toBe(100);
    expect(cercania(p, { agua: 1, suelo: 1, erosion: 1, ingreso: 1 })).toBe(25);
  });

  it("redondea los ,5 al par, como el round() de Python del backend", () => {
    expect([50.5, 51.5, 37.75, 45.75].map(redondearComoBackend)).toEqual([50, 52, 38, 46]);
  });

  it("con todas las barras en 0 no hay cercanía (null), no un 0", () => {
    expect(cercania(puntos(80, 80, 80, 80), { agua: 0, suelo: 0, erosion: 0, ingreso: 0 })).toBeNull();
  });

  it("da lo mismo que el backend: cercanía en año normal con las barras en 3", () => {
    for (const e of disponibles) expect(cercania(e.puntos, IGUALES)).toBe(e.cercania);
  });

  it("da lo mismo que el backend en cada tipo de año", () => {
    for (const e of disponibles) {
      for (const t of TIPOS_DE_ANIO) expect(cercania(e.puntos, IGUALES, t)).toBe(e.valores_por_tipo_anio[t].cercania);
    }
  });
});

describe("tipos de año", () => {
  it("devuelve el trío seco / normal / húmedo, que sube con la lluvia", () => {
    const t = cercaniaPorTipo(disponibles[1].puntos, IGUALES);
    expect(t.seco!).toBeLessThan(t.normal!);
    expect(t.normal!).toBeLessThan(t.humedo!);
  });

  it("marca sensible al clima con 15 puntos o más de diferencia", () => {
    expect(esSensibleAlClima({ seco: 50, normal: 60, humedo: 65 })).toBe(true);
    expect(esSensibleAlClima({ seco: 50, normal: 55, humedo: 64 })).toBe(false);
    expect(esSensibleAlClima({ seco: null, normal: null, humedo: null })).toBe(false);
  });

  it("con las barras en 3, coincide con el sensible_clima del backend", () => {
    for (const e of disponibles) expect(esSensibleAlClima(cercaniaPorTipo(e.puntos, IGUALES))).toBe(e.sensible_clima);
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

  it("ignora las descartadas: sin B, C queda más cerca en los dos y no hay choque", () => {
    const pesos = { agua: 5, suelo: 1, erosion: 1, ingreso: 4 };
    expect(choqueObjetivos(MOCK_DESCARTADA.estrategias, pesos)).toBeNull();
  });
});
