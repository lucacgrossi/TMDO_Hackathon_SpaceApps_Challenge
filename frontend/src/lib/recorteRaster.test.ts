import { describe, expect, it } from "vitest";
import type { Bounds } from "@/lib/contrato";
import type { LatLng } from "@/lib/entradas";
import { esquinasEnImagen, factorRecorte } from "@/lib/recorteRaster";

const BOUNDS: Bounds = [
  [-33.2517, -64.2381],
  [-33.2436, -64.2268],
];

describe("esquinasEnImagen", () => {
  it("las esquinas de los bounds caen en las esquinas de la imagen", () => {
    const rect: LatLng[] = [
      [-33.2436, -64.2381],
      [-33.2436, -64.2268],
      [-33.2517, -64.2268],
      [-33.2517, -64.2381],
    ];
    const p = esquinasEnImagen(rect, BOUNDS, 400, 300);
    const cerca = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
    cerca(p[0][0], 0);
    cerca(p[0][1], 0);
    cerca(p[1][0], 400);
    cerca(p[2][1], 300);
    cerca(p[3][0], 0);
  });

  it("un punto del medio cae adentro, cerca del centro", () => {
    const [[x, y]] = esquinasEnImagen([[-33.24765, -64.23245]], BOUNDS, 100, 100);
    expect(x).toBeCloseTo(50, 3);
    expect(y).toBeGreaterThan(49);
    expect(y).toBeLessThan(51);
  });
});

describe("factorRecorte", () => {
  it("agranda las grillas chicas, sin pasar de 16 ni del lado máximo", () => {
    expect(factorRecorte(40, 30)).toBe(16);
    expect(factorRecorte(500, 200)).toBe(4);
    expect(factorRecorte(5000, 10)).toBe(1);
  });
});
