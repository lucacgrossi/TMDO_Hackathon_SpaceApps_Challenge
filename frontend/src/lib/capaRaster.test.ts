import { describe, expect, it } from "vitest";
import { decodificarValores, pixelEn, urlImagen, valorEn } from "@/lib/capaRaster";
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

  it("arma la URL de la imagen con o sin prefijo", () => {
    expect(urlImagen(capa)).toMatch(/^data:image\/png;base64,/);
    expect(urlImagen({ ...capa, png: "data:image/png;base64,AAAA" })).toBe("data:image/png;base64,AAAA");
  });
});
