import { describe, expect, it } from "vitest";
import { LOTE_DEMO, type LatLng } from "@/lib/entradas";
import { COLORES_SATELITE, grillaDelLote, PASO_GRILLA, SATELITE, tonosFranjas, trazosGrilla } from "@/lib/momentos";

describe("satélite pixel", () => {
  it("todas las filas miden lo mismo y solo usan colores conocidos", () => {
    const ancho = SATELITE[0].length;
    for (const fila of SATELITE) {
      expect(fila).toHaveLength(ancho);
      for (const c of fila) if (c !== ".") expect(COLORES_SATELITE).toHaveProperty(c);
    }
  });

  it("trazosGrilla junta los píxeles seguidos del mismo color", () => {
    expect(trazosGrilla(["aab.", ".bb."], { a: "x", b: "y" })).toEqual({ a: "M0 0h2v1h-2z", b: "M2 0h1v1h-1zM1 1h2v1h-2z" });
  });
});

describe("grillaDelLote", () => {
  it("cubre el lote de ejemplo con la grilla de 1″ y deja adentro casi todo el rectángulo", () => {
    const g = grillaDelLote(LOTE_DEMO)!;
    const [[sur, oeste], [norte, este]] = g.bounds;
    expect(sur).toBeLessThanOrEqual(-33.2517);
    expect(norte).toBeGreaterThanOrEqual(-33.2436);
    expect(oeste).toBeLessThanOrEqual(-64.2381);
    expect(este).toBeGreaterThanOrEqual(-64.2268);
    expect(Math.round((norte - sur) / PASO_GRILLA)).toBe(g.filas);
    // ~95 ha a ~30 m: del orden de mil celdas
    expect(g.dentro.length).toBeGreaterThan(800);
    expect(g.dentro.length).toBeLessThanOrEqual(g.filas * g.columnas);
  });

  it("la ola arranca en la primera esquina (noroeste del lote de ejemplo)", () => {
    const [x, y] = grillaDelLote(LOTE_DEMO)!.origen;
    expect(x).toBeLessThan(0.1);
    expect(y).toBeLessThan(0.1);
  });

  it("en un triángulo queda afuera la mitad de la grilla", () => {
    const tri: LatLng[] = [
      [-33, -64],
      [-33, -63.99],
      [-33.01, -64],
    ];
    const g = grillaDelLote(tri)!;
    const frac = g.dentro.length / (g.filas * g.columnas);
    expect(frac).toBeGreaterThan(0.4);
    expect(frac).toBeLessThan(0.6);
  });

  it("en lotes enormes agrupa celdas para no pasar de 40.000", () => {
    const grande: LatLng[] = [
      [-33, -64],
      [-33, -63.8],
      [-33.2, -63.8],
      [-33.2, -64],
    ];
    const g = grillaDelLote(grande)!;
    expect(g.filas * g.columnas).toBeLessThanOrEqual(40_000);
  });

  it("sin 3 esquinas no hay grilla", () => {
    expect(grillaDelLote([[-33, -64]])).toBeNull();
  });
});

describe("tonosFranjas", () => {
  it("la mediana es neutra y los extremos llegan a 1 de cada lado", () => {
    const t = tonosFranjas([-300, -100, 0, 100, 300]);
    expect(t[2]).toEqual({ lado: "humedo", intensidad: 0 });
    expect(t[0]).toEqual({ lado: "seco", intensidad: 1 });
    expect(t[4]).toEqual({ lado: "humedo", intensidad: 1 });
    expect(t[1]?.intensidad).toBeCloseTo(1 / 3);
  });

  it("null queda sin tono y no rompe la escala", () => {
    const t = tonosFranjas([null, 10, 20, 30]);
    expect(t[0]).toBeNull();
    expect(t[1]?.lado).toBe("seco");
  });
});
