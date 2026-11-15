import { describe, expect, it } from "vitest";
import { anioDelMes, enOrdenCampania, mesesCampania } from "@/lib/ordenCampania";

/** ene = 1 … dic = 12, como un array del contrato (índice 0 = enero). */
const PORMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("orden de campaña", () => {
  it("reordena de julio a junio", () => {
    expect(enOrdenCampania(PORMES)).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
  });

  it("conserva el índice del contrato y la posición en la campaña", () => {
    const meses = mesesCampania(PORMES);
    expect(meses[0]).toEqual({ mes: 6, posicion: 0, corto: "jul", nombre: "julio", valor: 7, anio: null });
    expect(meses[11]).toEqual({ mes: 5, posicion: 11, corto: "jun", nombre: "junio", valor: 6, anio: null });
    expect(meses.map((m) => m.corto).join(" ")).toBe("jul ago sep oct nov dic ene feb mar abr may jun");
  });

  it("los meses sin dato quedan null, nunca cero", () => {
    expect(enOrdenCampania([null, 2, undefined])).toEqual([null, null, null, null, null, null, null, 2, null, null, null, null]);
    expect(mesesCampania([0])[6].valor).toBe(0);
  });

  it("rota exactamente [6..11, 0..5]: el índice 6 es julio y el 0 es enero", () => {
    expect(mesesCampania(PORMES).map((m) => m.mes)).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
  });

  it("año de cada mes en la campaña 2024/25: jul a dic de 2024, ene a jun de 2025", () => {
    const meses = mesesCampania(PORMES, "2024/25");
    expect(meses.map((m) => `${m.corto} ${m.anio}`)).toEqual([
      "jul 2024", "ago 2024", "sep 2024", "oct 2024", "nov 2024", "dic 2024",
      "ene 2025", "feb 2025", "mar 2025", "abr 2025", "may 2025", "jun 2025",
    ]);
    // índice 0 del contrato = enero de 2025, índice 6 = julio de 2024
    expect(anioDelMes("2024/25", 0)).toBe(2025);
    expect(anioDelMes("2024/25", 6)).toBe(2024);
    expect(anioDelMes("1999/00", 0)).toBe(2000);
  });

  it("sin campaña válida no inventa el año", () => {
    expect(anioDelMes(null, 6)).toBeNull();
    expect(anioDelMes("sin dato", 6)).toBeNull();
    expect(mesesCampania(PORMES)[0].anio).toBeNull();
  });
});
