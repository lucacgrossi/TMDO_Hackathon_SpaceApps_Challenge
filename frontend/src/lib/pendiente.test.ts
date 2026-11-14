import { describe, expect, it } from "vitest";
import type { LatLng } from "./entradas";
import {
  alturaTerrarium,
  calcularPendiente,
  colorPendiente,
  lat2y,
  lon2x,
  recortePixeles,
  resolver3,
  x2lon,
  y2lat,
} from "./pendiente";

const LOTE: LatLng[] = [
  [-33.2436, -64.2381],
  [-33.2436, -64.2268],
  [-33.2517, -64.2268],
  [-33.2517, -64.2381],
];

describe("pendiente", () => {
  it("ida y vuelta lat/lng ↔ píxel", () => {
    expect(x2lon(lon2x(-64.2325, 14), 14)).toBeCloseTo(-64.2325, 8);
    expect(y2lat(lat2y(-33.2477, 14), 14)).toBeCloseTo(-33.2477, 8);
  });

  it("decodifica la altura terrarium", () => {
    // 128·256 + 0 + 0 − 32768 = 0 m; 129·256 + 44 = 300 m
    expect(alturaTerrarium(128, 0, 0)).toBe(0);
    expect(alturaTerrarium(129, 44, 0)).toBe(300);
  });

  it("resuelve un sistema 3×3", () => {
    const s = resolver3(
      [
        [2, 1, 0],
        [1, 3, 1],
        [0, 1, 4],
      ],
      [3, 5, 5],
    );
    expect(s).not.toBeNull();
    s!.forEach((v) => expect(v).toBeCloseTo(1, 9));
    expect(resolver3([[1, 1, 1], [1, 1, 1], [0, 0, 1]], [1, 1, 1])).toBeNull();
  });

  it("colores de los extremos de la escala", () => {
    expect(colorPendiente(0)).toEqual([46, 125, 50]);
    expect(colorPendiente(2.5)).toEqual([253, 216, 53]);
    expect(colorPendiente(20)).toEqual([198, 40, 40]);
  });

  it("un plano inclinado 2 % hacia el este da 2 % de pendiente", () => {
    const z = 14;
    const { x0, x1, y0, y1 } = recortePixeles(LOTE, z);
    const W = x1 - x0;
    const H = y1 - y0;
    const px = (156543.03392 * Math.cos((-33.24765 * Math.PI) / 180)) / 2 ** z;
    const crudo = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) crudo[j * W + i] = 300 + 0.02 * i * px;
    const r = calcularPendiente(crudo, W, H, x0, y0, z, LOTE);
    expect(r.media).toBeCloseTo(2, 3);
    expect(r.maxima).toBeCloseTo(2, 2);
    // Algún píxel del lote quedó pintado (alfa 200) y alguno fuera, transparente.
    expect(r.rgba.some((v, i) => i % 4 === 3 && v === 200)).toBe(true);
    expect(r.rgba[3]).toBe(0);
  });
});
