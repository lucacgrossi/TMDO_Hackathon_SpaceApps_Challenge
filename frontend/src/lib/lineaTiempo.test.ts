import { describe, expect, it } from "vitest";
import type { Capas, VistoPorSatelite } from "@/lib/contrato";
import { CAPA_RASTER_EJEMPLO } from "@/lib/ejemplos/capaRasterEjemplo";
import { esModis, escalaNdvi, fechaCorta, lineaTiempo, NOTA_MODIS, rasterNdviDelMes } from "@/lib/lineaTiempo";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";

const ESCALA_NDVI = {
  cortes: [0, 0.15, 0.3, 0.45, 0.6, 0.75],
  colores: ["#E6D8AE", "#CDBA86", "#94AF63", "#689C49", "#3F8139", "#1B5E2E"],
  etiquetas: ["<0,15", "0,15", "0,3", "0,45", "0,6", "≥0,75"],
};

/** El mock trae marzo en MODIS y los 12 meses con escena. */
const VISTO: VistoPorSatelite = RIO_CUARTO.visto_por_satelite;

/** Noviembre sin escena, con su motivo en `faltantes`. */
const MOTIVO_NOV = "Sin escena HLS limpia ni compuesto MODIS";
const VISTO_SIN_NOV: VistoPorSatelite = {
  ...VISTO,
  meses: VISTO.meses.map((m, i) => (i === 10 ? null : m)),
  faltantes: [{ mes: "2025-11", motivo: MOTIVO_NOV }],
};

/** Capas con raster solo en julio (6), para probar el color y `conRaster`. */
const CAPAS: Capas = {
  ...RIO_CUARTO.capas,
  ndvi_mensual: RIO_CUARTO.capas.ndvi_mensual.map((m, i) =>
    !m ? m : i === 6 ? { ...m, mapa: { ...CAPA_RASTER_EJEMPLO, id: "ndvi", escala: ESCALA_NDVI } } : { ...m, mapa: null },
  ),
};

describe("línea de tiempo del NDVI", () => {
  it("va de julio a junio con el índice del contrato", () => {
    const l = lineaTiempo(VISTO);
    expect(l).toHaveLength(12);
    expect(l.map((m) => m.mes)).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
    expect(l[0].ndvi).toBe(0.264); // julio de la mock
    expect(l[6].ndvi).toBe(0.62); // enero
  });

  it("marca el mes de MODIS con asterisco y nota de confianza baja", () => {
    const marzo = lineaTiempo(VISTO).find((m) => m.mes === 2)!;
    expect(marzo.modis).toBe(true);
    expect(marzo.etiqueta).toBe("mar*");
    expect(marzo.texto).toContain(NOTA_MODIS);
    expect(lineaTiempo(VISTO).filter((m) => m.modis)).toHaveLength(1);
  });

  it("el mes sin escena queda sin dato, con el motivo y alto 0", () => {
    const nov = lineaTiempo(VISTO_SIN_NOV).find((m) => m.mes === 10)!;
    expect(nov).toMatchObject({ ndvi: null, alto: 0, bajo: null, color: null, modis: false });
    expect(nov.motivo).toBe(MOTIVO_NOV);
    expect(nov.texto).toBe(`noviembre: sin dato. ${MOTIVO_NOV}`);
  });

  it("sin faltantes, el mes vacío dice que no hubo escena", () => {
    const nov = lineaTiempo({ ...VISTO_SIN_NOV, faltantes: [] }).find((m) => m.mes === 10)!;
    expect(nov.motivo).toBe("Sin escena utilizable ese mes.");
  });

  it("cobertura baja con el umbral del back", () => {
    const l = lineaTiempo(VISTO);
    expect(l.find((m) => m.mes === 6)!.bajo).toBe(true); // 0,264 < 0,3
    expect(l.find((m) => m.mes === 11)!.bajo).toBe(false); // 0,549
    expect(l.filter((m) => m.bajo).length).toBe(RIO_CUARTO.visto_por_satelite.meses_ndvi_bajo);
  });

  it("color desde la escala del back; sin rasters no hay color", () => {
    const con = lineaTiempo(VISTO, CAPAS);
    expect(con[0].color).toBe("#CDBA86"); // 0,264 → clase 0,15–0,3
    expect(con[6].color).toBe("#3F8139"); // 0,62 → clase 0,6–0,75
    expect(con[0].conRaster).toBe(true);
    expect(con[1].conRaster).toBe(false);
    expect(lineaTiempo(VISTO).every((m) => m.color === null)).toBe(true);
  });

  it("el alto de la barrita es el NDVI recortado a 0–1", () => {
    const meses = [...VISTO.meses];
    meses[0] = { ...meses[0]!, ndvi_medio: -0.1 };
    const l = lineaTiempo({ ...VISTO, meses });
    expect(l.find((m) => m.mes === 0)!.alto).toBe(0);
    expect(l.find((m) => m.mes === 1)!.alto).toBe(0.51);
  });

  it("texto con valor, fuente y fecha", () => {
    expect(lineaTiempo(VISTO)[0].texto).toBe(`julio: NDVI 0,26, ${VISTO.meses[6]!.fuente}, 19/07/2025`);
  });

  it("detecta MODIS por la colección o, si no viene, por la fuente", () => {
    expect(esModis({ coleccion: "modis-13Q1-061", fuente: "x" })).toBe(true);
    expect(esModis({ coleccion: "hls2-s30", fuente: "MODIS" })).toBe(false);
    expect(esModis({ coleccion: null, fuente: "MODIS 250 m" })).toBe(true);
    expect(esModis({ fuente: "NASA HLS 30 m" })).toBe(false);
  });

  it("raster y escala del NDVI desde capas", () => {
    expect(rasterNdviDelMes(CAPAS, 6)?.id).toBe("ndvi");
    expect(rasterNdviDelMes(CAPAS, 10)).toBeNull();
    expect(rasterNdviDelMes(null, 6)).toBeNull();
    expect(escalaNdvi(CAPAS)).toEqual(ESCALA_NDVI);
    expect(escalaNdvi({ ...RIO_CUARTO.capas, ndvi_mensual: RIO_CUARTO.capas.ndvi_mensual.map(() => null) })).toBeNull();
  });

  it("fecha corta", () => {
    expect(fechaCorta("2025-07-22")).toBe("22/07/2025");
    expect(fechaCorta("2025-07-22T13:00:00Z")).toBe("22/07/2025");
    expect(fechaCorta("estática")).toBe("estática");
  });
});
