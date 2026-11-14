import { describe, expect, it } from "vitest";
import { anilloGeoJSON, entradaDesde } from "@/lib/aEntrada";
import { ENTRADAS_INICIALES, type Entradas, type LatLng } from "@/lib/entradas";
import { RESULTADO_EJEMPLO, type ResultadoPlanilla } from "@/lib/planilla";

const base: Entradas = structuredClone(ENTRADAS_INICIALES);
const con = (parcial: Partial<Entradas>): Entradas => ({ ...structuredClone(base), ...parcial });

describe("entradaDesde · lote", () => {
  it("polígono [lat, lng] abierto → GeoJSON [lon, lat] cerrado", () => {
    const p: LatLng[] = [
      [-33, -64],
      [-33, -63.9],
      [-33.1, -63.9],
    ];
    expect(anilloGeoJSON(p)).toEqual([
      [-64, -33],
      [-63.9, -33],
      [-63.9, -33.1],
      [-64, -33],
    ]);
  });

  it("si ya viene cerrado no repite el primer punto", () => {
    const p: LatLng[] = [
      [-33, -64],
      [-33, -63.9],
      [-33.1, -63.9],
      [-33, -64],
    ];
    expect(anilloGeoJSON(p)).toHaveLength(4);
  });

  it("lote de ejemplo: tipo ejemplo, centro [lat, lon] y lat/lon iguales al centro", () => {
    const e = entradaDesde(base);
    expect(e.lote.tipo).toBe("ejemplo");
    expect(e.lote.poligono.type).toBe("Polygon");
    expect(e.lote.poligono.coordinates[0]).toHaveLength(5);
    const [lat, lon] = e.lote.centro;
    expect(lat).toBeLessThan(-33);
    expect(lon).toBeLessThan(-64);
    expect([e.lat, e.lon]).toEqual([lat, lon]);
    expect(e.lote.area_ha).toBeGreaterThan(1);
    expect(e.lote.area_ha).toBeLessThan(20000);
  });

  it("el lote de ejemplo movido o un lote dibujado van como dibujado (no usan el precalculado)", () => {
    const movido = base.poligono.map(([la, ln]) => [la + 0.1, ln] as LatLng);
    expect(entradaDesde(con({ poligono: movido })).lote.tipo).toBe("dibujado");
    expect(entradaDesde(con({ modoLote: "dibujo" })).lote.tipo).toBe("dibujado");
  });
});

describe("entradaDesde · nombres del contrato", () => {
  it("rotación, objetivos, restricciones y datos del lote", () => {
    const e = entradaDesde(
      con({
        verano: "maiz",
        invierno: "trigo",
        pasada: "soja",
        objetivos: { agua: 5, suelo: 1, erosion: 2, ingreso: 3 },
        restricciones: { sinRiego: true, sinHacienda: true, maquinariaLimitada: false },
        noSembrar: ["vicia"],
        anegable: "a_veces",
        textura: "arenoso",
      }),
    );
    expect(e).toMatchObject({
      cultivo_verano: "maiz",
      invierno: "trigo",
      campana_pasada: "soja",
      calendario: null,
      prioridades: { agua: 5, suelo: 1, erosion: 2, ingreso: 3 },
      restricciones: ["sin_riego", "sin_hacienda"],
      no_sembrar: ["vicia"],
      anegable: "a_veces",
      textura_suelo: "arenoso",
    });
  });

  it("prioridades enteras de 1 a 5 (el contrato rechaza 0)", () => {
    const e = entradaDesde(con({ objetivos: { agua: 0, suelo: 7, erosion: 2.6, ingreso: 3 } }));
    expect(e.prioridades).toEqual({ agua: 1, suelo: 5, erosion: 3, ingreso: 3 });
  });
});

describe("entradaDesde · mediciones propias", () => {
  it("sin mediciones: todo null", () => {
    expect(entradaDesde(base).mediciones_propias).toEqual({
      lluvia_anual_mm: null,
      anios_registro: null,
      materia_organica_pct: null,
      serie_mensual: null,
    });
  });

  it("pluviómetro, años y materia orgánica con los nombres del contrato", () => {
    const m = { ...base.mediciones, lluviaAnualMm: 620, aniosRegistro: 8, materiaOrganicaPct: 2.4 };
    expect(entradaDesde(con({ mediciones: m })).mediciones_propias).toMatchObject({
      lluvia_anual_mm: 620,
      anios_registro: 8,
      materia_organica_pct: 2.4,
    });
  });

  it("valores que el back rechazaría no se mandan (lluvia 0, años 0, materia orgánica fuera de rango)", () => {
    const m = { ...base.mediciones, lluviaAnualMm: 0, aniosRegistro: 0, materiaOrganicaPct: 140 };
    expect(entradaDesde(con({ mediciones: m })).mediciones_propias).toMatchObject({
      lluvia_anual_mm: null,
      anios_registro: null,
      materia_organica_pct: null,
    });
  });

  it("la planilla leída por el back va en serie_mensual, con null en lo que falta", () => {
    const resultado: ResultadoPlanilla = structuredClone({ ...RESULTADO_EJEMPLO, ejemplo: false });
    resultado.serie!.meses = [{ mes: "2023-01", lluvia_mm: 120.5 }];
    const m = { ...base.mediciones, planilla: { nombre: "x.csv", resultado } };
    expect(entradaDesde(con({ mediciones: m })).mediciones_propias.serie_mensual).toEqual([
      { mes: "2023-01", lluvia_mm: 120.5, t_min_c: null, t_max_c: null },
    ]);
  });

  it("la planilla de EJEMPLO (sin back) no se manda como dato del productor", () => {
    const m = { ...base.mediciones, planilla: { nombre: "x.csv", resultado: RESULTADO_EJEMPLO } };
    expect(entradaDesde(con({ mediciones: m })).mediciones_propias.serie_mensual).toBeNull();
  });
});
