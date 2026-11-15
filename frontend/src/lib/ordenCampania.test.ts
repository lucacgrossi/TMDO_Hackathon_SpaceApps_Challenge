import { describe, expect, it } from "vitest";
import { enOrdenCampania, mesesCampania } from "@/lib/ordenCampania";

/** ene = 1 … dic = 12, como un array del contrato (índice 0 = enero). */
const PORMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("orden de campaña", () => {
  it("reordena de julio a junio", () => {
    expect(enOrdenCampania(PORMES)).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
  });

  it("conserva el índice del contrato y la posición en la campaña", () => {
    const meses = mesesCampania(PORMES);
    expect(meses[0]).toEqual({ mes: 6, posicion: 0, corto: "jul", nombre: "julio", valor: 7 });
    expect(meses[11]).toEqual({ mes: 5, posicion: 11, corto: "jun", nombre: "junio", valor: 6 });
    expect(meses.map((m) => m.corto).join(" ")).toBe("jul ago sep oct nov dic ene feb mar abr may jun");
  });

  it("los meses sin dato quedan null, nunca cero", () => {
    expect(enOrdenCampania([null, 2, undefined])).toEqual([null, null, null, null, null, null, null, 2, null, null, null, null]);
    expect(mesesCampania([0])[6].valor).toBe(0);
  });
});
