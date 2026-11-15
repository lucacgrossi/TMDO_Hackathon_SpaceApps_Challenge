import { describe, expect, it } from "vitest";
import {
  campanaInicial,
  elegirCampana,
  MOTIVO_SIN_MENSUAL,
  seleccionCampanas,
  tieneMensual,
  type CampanaConMensual,
  type MensualCampana,
} from "@/lib/campanaClima";
import type { SerieAnual } from "@/lib/contrato";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";

const SERIE = RIO_CUARTO.serie_anual!;

const DOCE = (v: number) => Array.from({ length: 12 }, () => v);
const MENSUAL: MensualCampana = {
  lluvia_mm: DOCE(50),
  t_min_c: DOCE(5),
  t_max_c: DOCE(25),
  et0_mm: DOCE(100),
  balance_mm: DOCE(-50),
};
const CON_MENSUAL: SerieAnual = {
  ...SERIE,
  campanas: SERIE.campanas.map((c) => ({ ...c, mensual: MENSUAL }) as CampanaConMensual),
};

describe("selección de campaña de la serie anual", () => {
  it("por defecto, la última campaña de la serie", () => {
    expect(campanaInicial(SERIE)).toBe("2025/26");
    expect(campanaInicial(null)).toBeNull();
    expect(campanaInicial({ ...SERIE, campanas: [] })).toBeNull();
  });

  it("devuelve la campaña con su tercio y el título", () => {
    const c = elegirCampana(SERIE, "2021/22")!;
    expect(c).toMatchObject({
      campana: "2021/22",
      indice: 25,
      lluvia_mm: 546,
      balance_mm: -952,
      tipo: "seco",
      letra: "S",
      adjetivo: "seca",
      titulo: "Campaña 2021/22: seca, 546 mm",
      mensual: null,
    });
    expect(elegirCampana(SERIE, "1997/98")).toMatchObject({ letra: "H", adjetivo: "húmeda", titulo: "Campaña 1997/98: húmeda, 1.156 mm" });
    expect(elegirCampana(SERIE, "2000/01")).toMatchObject({ letra: "N", adjetivo: "normal" });
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

  it("sin el campo mensual, la selección queda deshabilitada con el motivo", () => {
    expect(seleccionCampanas(SERIE)).toEqual({ habilitada: false, motivo: MOTIVO_SIN_MENSUAL });
    expect(seleccionCampanas(null).habilitada).toBe(false);
    expect(seleccionCampanas(null).motivo).toMatch(/serie de campañas/);
  });

  it("con mensual en todas las campañas, se habilita y la campaña trae sus 12 meses", () => {
    expect(seleccionCampanas(CON_MENSUAL)).toEqual({ habilitada: true, motivo: null });
    expect(elegirCampana(CON_MENSUAL, "2021/22")?.mensual).toBe(MENSUAL);
  });

  it("si una sola campaña no trae sus meses, sigue deshabilitada", () => {
    const campanas = [...CON_MENSUAL.campanas];
    campanas[3] = { ...campanas[3], mensual: null } as CampanaConMensual;
    expect(seleccionCampanas({ ...CON_MENSUAL, campanas }).habilitada).toBe(false);
  });

  it("mensual incompleto (menos de 12 meses) no cuenta", () => {
    const c = { ...SERIE.campanas[0], mensual: { ...MENSUAL, lluvia_mm: DOCE(1).slice(0, 11) } };
    expect(tieneMensual(c)).toBe(false);
  });
});
