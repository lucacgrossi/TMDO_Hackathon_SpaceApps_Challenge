import { describe, expect, it } from "vitest";
import {
  COLORES_PLANTA,
  FOTOGRAMA_QUIETO,
  FOTOGRAMAS_PLANTA,
  fotogramaPlanta,
  trazosPorColor,
} from "./planta";

describe("FOTOGRAMAS_PLANTA", () => {
  it("son 5 grillas de 16 × 16 con letras conocidas", () => {
    expect(FOTOGRAMAS_PLANTA).toHaveLength(5);
    for (const grilla of FOTOGRAMAS_PLANTA) {
      expect(grilla).toHaveLength(16);
      for (const fila of grilla) {
        expect(fila).toHaveLength(16);
        for (const c of fila) expect(c === "." || c in COLORES_PLANTA).toBe(true);
      }
    }
  });

  it("todos tienen la tierra abajo", () => {
    for (const grilla of FOTOGRAMAS_PLANTA) {
      expect(grilla.slice(13)).toEqual(["tttttttttttttttt", "tttttttttttttttt", "tttttttttttttttt"]);
    }
  });

  it("la semilla no tiene tallo y el último tiene vainas", () => {
    expect(FOTOGRAMAS_PLANTA[0].join("")).not.toContain("v");
    expect(FOTOGRAMAS_PLANTA[4].join("")).toContain("p");
  });
});

describe("fotogramaPlanta", () => {
  it("avanza uno cada 0,3 s", () => {
    expect(fotogramaPlanta(0, false)).toBe(0);
    expect(fotogramaPlanta(299, false)).toBe(0);
    expect(fotogramaPlanta(300, false)).toBe(1);
    expect(fotogramaPlanta(950, false)).toBe(3);
  });

  it("en bucle: la planta entera queda hasta los 2,1 s y vuelve a la semilla", () => {
    expect(fotogramaPlanta(1200, false)).toBe(4);
    expect(fotogramaPlanta(2099, false)).toBe(4);
    expect(fotogramaPlanta(2100, false)).toBe(0);
    expect(fotogramaPlanta(2100 + 950, false)).toBe(3);
  });

  it("con movimiento reducido siempre muestra el de 4 hojas", () => {
    expect(fotogramaPlanta(0, true)).toBe(FOTOGRAMA_QUIETO);
    expect(fotogramaPlanta(60_000, true)).toBe(3);
  });

  it("un tiempo negativo o inválido es el primero", () => {
    expect(fotogramaPlanta(-500, false)).toBe(0);
    expect(fotogramaPlanta(Number.NaN, false)).toBe(0);
  });
});

describe("trazosPorColor", () => {
  it("junta los píxeles seguidos del mismo color en un rectángulo", () => {
    expect(trazosPorColor(["ttv.", "..vv"])).toEqual({ t: "M0 0h2v1h-2z", v: "M2 0h1v1h-1zM2 1h2v1h-2z" });
  });

  it("ignora los vacíos y las letras desconocidas", () => {
    expect(trazosPorColor(["..x."])).toEqual({});
  });
});
