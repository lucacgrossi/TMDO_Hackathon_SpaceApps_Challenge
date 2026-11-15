import { describe, expect, it } from "vitest";
import { campanaInicial, elegirCampana, MOTIVO_SIN_MENSUAL, seleccionCampanas, tieneMensual } from "@/lib/campanaClima";
import type { CampanaSerie, SerieAnual } from "@/lib/contrato";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";

/** La serie del mock trae `mensual` en las 30 campañas (PR #86). */
const SERIE = RIO_CUARTO.serie_anual!;
const SIN_MENSUAL: SerieAnual = { ...SERIE, campanas: SERIE.campanas.map(({ mensual: _m, ...c }) => c) };

describe("selección de campaña de la serie anual", () => {
  it("por defecto, la última campaña de la serie", () => {
    expect(campanaInicial(SERIE)).toBe(SERIE.campanas[29].campana);
    expect(campanaInicial(null)).toBeNull();
    expect(campanaInicial({ ...SERIE, campanas: [] })).toBeNull();
  });

  it("devuelve la campaña con su tercio, el título y sus 12 meses", () => {
    const c = elegirCampana(SERIE, "2021/22")!;
    const original = SERIE.campanas.find((x) => x.campana === "2021/22")!;
    expect(c).toMatchObject({
      campana: "2021/22",
      indice: SERIE.campanas.indexOf(original),
      lluvia_mm: original.lluvia_mm,
      balance_mm: original.balance_mm,
      tipo: original.tipo,
    });
    expect(c.mensual).toBe(original.mensual);
  });

  it("letra, adjetivo y título por tercio", () => {
    const base: CampanaSerie = { campana: "2021/22", lluvia_mm: 546, balance_mm: -952, tipo: "seco" };
    const serie = (tipo: CampanaSerie["tipo"], lluvia_mm = 546): SerieAnual => ({
      ...SERIE,
      campanas: [{ ...base, tipo, lluvia_mm }],
    });
    expect(elegirCampana(serie("seco"), "2021/22")).toMatchObject({ letra: "S", adjetivo: "seca", titulo: "Campaña 2021/22: seca, 546 mm" });
    expect(elegirCampana(serie("normal"), "2021/22")).toMatchObject({ letra: "N", adjetivo: "normal" });
    expect(elegirCampana(serie("humedo", 1156), "2021/22")).toMatchObject({
      letra: "H",
      adjetivo: "húmeda",
      titulo: "Campaña 2021/22: húmeda, 1.156 mm",
    });
  });

  it("el tercio es el que manda el back, igual que tipos_de_anio", () => {
    for (const t of ["seco", "normal", "humedo"] as const) {
      for (const camp of RIO_CUARTO.tipos_de_anio[t]) expect(elegirCampana(SERIE, camp)?.tipo).toBe(t);
    }
  });

  it("campaña que no está o sin serie: null", () => {
    expect(elegirCampana(SERIE, "1980/81")).toBeNull();
    expect(elegirCampana(SERIE, null)).toBeNull();
    expect(elegirCampana(null, "2021/22")).toBeNull();
  });

  it("con mensual en todas las campañas, la selección se habilita", () => {
    expect(seleccionCampanas(SERIE)).toEqual({ habilitada: true, motivo: null });
  });

  it("sin el campo mensual, la selección queda deshabilitada con el motivo y la campaña sin meses", () => {
    expect(seleccionCampanas(SIN_MENSUAL)).toEqual({ habilitada: false, motivo: MOTIVO_SIN_MENSUAL });
    expect(MOTIVO_SIN_MENSUAL).not.toMatch(/Back 1|pedido/);
    expect(elegirCampana(SIN_MENSUAL, "2021/22")?.mensual).toBeNull();
    expect(seleccionCampanas(null).habilitada).toBe(false);
    expect(seleccionCampanas(null).motivo).toMatch(/serie de campañas/);
  });

  it("si una sola campaña viene con mensual null, sigue deshabilitada", () => {
    const campanas = [...SERIE.campanas];
    campanas[3] = { ...campanas[3], mensual: null };
    expect(seleccionCampanas({ ...SERIE, campanas }).habilitada).toBe(false);
  });

  it("mensual incompleto (menos de 12 meses) no cuenta", () => {
    const c = SERIE.campanas[0];
    expect(tieneMensual(c)).toBe(true);
    expect(tieneMensual({ ...c, mensual: { ...c.mensual!, lluvia_mm: c.mensual!.lluvia_mm.slice(0, 11) } })).toBe(false);
  });
});
