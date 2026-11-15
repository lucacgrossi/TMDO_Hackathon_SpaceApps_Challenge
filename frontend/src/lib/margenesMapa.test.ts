import { describe, expect, it } from "vitest";
import { aspectoLote, type Caja, margenesLote } from "@/lib/margenesMapa";

const caja = (left: number, top: number, right: number, bottom: number): Caja => ({ left, top, right, bottom });

// Mapa de 870 × 640 px, como a 1440 × 900 (H-020)
const MAPA = caja(0, 0, 870, 640);
const SELECTOR = caja(16, 16, 530, 106);
const INSPECTOR = caja(554, 16, 854, 66);
const LINEA = caja(16, 524, 306, 624);
const LEYENDA = caja(554, 414, 814, 624);

describe("margenes del mapa del lote", () => {
  it("compu: el lote queda abajo del selector, arriba de la línea de tiempo y a la izquierda de la leyenda", () => {
    expect(margenesLote(MAPA, [SELECTOR, INSPECTOR, LINEA, LEYENDA], 1)).toEqual({
      paddingTopLeft: [12, 118],
      paddingBottomRight: [328, 128],
    });
  });

  it("un lote muy ancho prefiere dejar la leyenda abajo y usar todo el ancho", () => {
    const m = margenesLote(MAPA, [SELECTOR, INSPECTOR, LINEA, LEYENDA], 4);
    expect(m.paddingBottomRight).toEqual([12, 238]);
  });

  it("celular: los paneles que van debajo del mapa no cuentan", () => {
    const mapa = caja(16, 0, 359, 640);
    const linea = caja(16, 652, 359, 760);
    const leyenda = caja(16, 772, 276, 960);
    const inspector = caja(32, 574, 343, 624);
    expect(margenesLote(mapa, [caja(32, 16, 343, 106), inspector, linea, leyenda], 1)).toEqual({
      paddingTopLeft: [12, 118],
      paddingBottomRight: [12, 78],
    });
  });

  it("un panel oculto (caja vacía) no cuenta", () => {
    expect(margenesLote(MAPA, [caja(0, 0, 0, 0)], 1)).toEqual({ paddingTopLeft: [12, 12], paddingBottomRight: [12, 12] });
  });

  it("si los paneles no dejan lugar, se encuadra sin ellos", () => {
    const tapaTodo = caja(0, 0, 870, 600);
    expect(margenesLote(MAPA, [tapaTodo], 1)).toEqual({ paddingTopLeft: [12, 12], paddingBottomRight: [12, 12] });
  });

  it("aspecto del lote en metros: a 33° S un grado de longitud mide menos que uno de latitud", () => {
    expect(aspectoLote(-33.26, -64.24, -33.24, -64.22)).toBeCloseTo(Math.cos((33.25 * Math.PI) / 180), 3);
    expect(aspectoLote(0, 0, 0, 1)).toBe(1);
  });
});
