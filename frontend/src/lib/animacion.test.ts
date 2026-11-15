import { describe, expect, it } from "vitest";
import {
  DURACION_TWEEN_MS,
  pasoTween,
  salidaCubica,
  sinMovimiento,
} from "@/lib/animacion";

describe("pasoTween (tween del prototipo)", () => {
  it("arranca en el valor de origen y termina exacto en el nuevo", () => {
    expect(pasoTween(40, 60, 0)).toEqual({ valor: 40, fin: false });
    expect(pasoTween(40, 60, DURACION_TWEEN_MS)).toEqual({ valor: 60, fin: true });
    expect(pasoTween(40, 60, DURACION_TWEEN_MS + 500)).toEqual({ valor: 60, fin: true });
  });

  it("frena al llegar: a mitad de tiempo ya hizo casi 90 % del camino", () => {
    expect(salidaCubica(0.5)).toBeCloseTo(0.875);
    expect(pasoTween(0, 100, DURACION_TWEEN_MS / 2).valor).toBe(88);
  });

  it("también baja y siempre muestra enteros", () => {
    const { valor } = pasoTween(60, 47, 100);
    expect(Number.isInteger(valor)).toBe(true);
    expect(valor).toBeLessThan(60);
    expect(valor).toBeGreaterThan(47);
  });

  it("con duración 0 va directo al valor nuevo", () => {
    expect(pasoTween(10, 20, 0, 0)).toEqual({ valor: 20, fin: true });
  });
});

describe("sinMovimiento", () => {
  it("sin ventana (servidor o tests) no falla al leer la preferencia", () => {
    expect(sinMovimiento()).toBe(false);
  });
});
