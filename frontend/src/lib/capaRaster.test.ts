import { describe, expect, it } from "vitest";
import {
  centroPixel,
  claseEscala,
  colorEscala,
  decodificarValores,
  pixelEn,
  urlImagen,
  valorEn,
  valoresDe,
  valorPixel,
} from "@/lib/capaRaster";
import { CAPA_RASTER_EJEMPLO as capa } from "@/lib/ejemplos/capaRasterEjemplo";

describe("capa raster del backend", () => {
  it("decodifica los int16 en base64", () => {
    expect(Array.from(decodificarValores(capa.valores ?? ""))).toEqual([12, 25, -32768, 8, 40, 61]);
  });

  it("la fila 0 es el norte y la columna 0 el oeste", () => {
    expect(pixelEn(capa, -33.241, -64.239)).toEqual({ fila: 0, columna: 0 });
    expect(pixelEn(capa, -33.249, -64.211)).toEqual({ fila: 1, columna: 2 });
  });

  it("lee el valor del píxel × factor", () => {
    expect(valorEn(capa, -33.241, -64.225)).toBeCloseTo(2.5);
    expect(valorEn(capa, -33.249, -64.211)).toBeCloseTo(6.1);
  });

  it("sin valores (NDVI de lotes grandes) no hay valor por píxel", () => {
    expect(valorEn({ ...capa, valores: null }, -33.241, -64.225)).toBeNull();
  });

  it("nodata y fuera de la grilla dan null", () => {
    expect(valorEn(capa, -33.241, -64.211)).toBeNull();
    expect(valorEn(capa, -33.3, -64.22)).toBeNull();
  });

  it("lee valores[fila][columna] × factor", () => {
    expect(valorPixel(capa, 0, 1)).toBeCloseTo(2.5);
    expect(valorPixel(capa, 1, 2)).toBeCloseTo(6.1);
  });

  it("valorPixel: nodata, fuera de la grilla, índices no enteros o sin valores dan null", () => {
    expect(valorPixel(capa, 0, 2)).toBeNull();
    expect(valorPixel(capa, 2, 0)).toBeNull();
    expect(valorPixel(capa, 0, -1)).toBeNull();
    expect(valorPixel(capa, 0.5, 0)).toBeNull();
    expect(valorPixel({ ...capa, valores: null }, 0, 0)).toBeNull();
  });

  it("decodifica los valores una sola vez por capa", () => {
    const a = valoresDe(capa);
    expect(a).not.toBeNull();
    expect(valoresDe(capa)).toBe(a);
    expect(valoresDe({ ...capa, valores: null })).toBeNull();
  });

  it("centro del píxel: fila 0 al norte, columna 0 al oeste", () => {
    const [lat, lng] = centroPixel(capa, 0, 0);
    expect(lat).toBeCloseTo(-33.2425);
    expect(lng).toBeCloseTo(-64.235);
    expect(pixelEn(capa, lat, lng)).toEqual({ fila: 0, columna: 0 });
    const [lat2, lng2] = centroPixel(capa, 1, 2);
    expect(pixelEn(capa, lat2, lng2)).toEqual({ fila: 1, columna: 2 });
  });

  it("clase y color de la escala del back (cada corte es el piso de su clase)", () => {
    expect(claseEscala(capa.escala, -1)).toBe(0);
    expect(claseEscala(capa.escala, 2.5)).toBe(1);
    expect(claseEscala(capa.escala, 9)).toBe(2);
    expect(colorEscala(capa.escala, 3)).toBe("#fdd835");
    expect(colorEscala(capa.escala, Number.NaN)).toBeNull();
    expect(colorEscala({ cortes: [], colores: [], etiquetas: [] }, 1)).toBeNull();
  });

  it("arma la URL de la imagen con o sin prefijo", () => {
    expect(urlImagen(capa)).toMatch(/^data:image\/png;base64,/);
    expect(urlImagen({ ...capa, png: "data:image/png;base64,AAAA" })).toBe("data:image/png;base64,AAAA");
  });
});
