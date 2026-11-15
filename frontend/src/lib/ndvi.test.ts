import { describe, expect, it } from "vitest";
import { anioCampania, campanaEstimada, colormapHls, formatoFecha, geoLote, urlTeselasModis } from "./ndvi";

describe("ndvi", () => {
  it("julio a diciembre caen en el primer año de la campaña", () => {
    expect(anioCampania(6, 2024)).toBe(2024);
    expect(anioCampania(11, 2024)).toBe(2024);
    expect(anioCampania(0, 2024)).toBe(2025);
    expect(anioCampania(5, 2024)).toBe(2025);
  });

  it("URL de GIBS con el día 15 del mes y nivel 9", () => {
    expect(urlTeselasModis(6, 2024)).toContain("/MODIS_Terra_L3_NDVI_16Day/default/2024-07-15/GoogleMapsCompatible_Level9/");
    expect(urlTeselasModis(0, 2024)).toContain("/2025-01-15/");
  });

  it("formatea la fecha corta", () => {
    expect(formatoFecha("2024-07-08")).toBe("8 jul 2024");
  });

  it("el lote como GeoJSON va en lng,lat y cerrado", () => {
    const g = geoLote([
      [-33, -64],
      [-33, -63],
      [-34, -63],
    ]);
    expect(g.coordinates[0][0]).toEqual([-64, -33]);
    expect(g.coordinates[0].at(-1)).toEqual([-64, -33]);
  });

  it("el mapa de colores cubre 0–256 sin huecos", () => {
    const cm = JSON.parse(decodeURIComponent(colormapHls())) as [[number, number], number[]][];
    expect(cm).toHaveLength(6);
    expect(cm[0][0][0]).toBe(0);
    expect(cm.at(-1)![0][1]).toBe(256);
    for (let i = 1; i < cm.length; i++) expect(cm[i][0][0]).toBe(cm[i - 1][0][1]);
  });
});

describe("campanaEstimada", () => {
  it("después de junio es la campaña que terminó este junio", () => {
    expect(campanaEstimada(new Date(2026, 10, 14))).toBe(2025); // nov 2026 → 2025/26
    expect(campanaEstimada(new Date(2026, 6, 1))).toBe(2025); // 1 de julio
  });
  it("hasta junio es la anterior (la de este año todavía no terminó)", () => {
    expect(campanaEstimada(new Date(2026, 5, 30))).toBe(2024); // 30 de junio → 2024/25
    expect(campanaEstimada(new Date(2026, 0, 10))).toBe(2024);
  });
});
