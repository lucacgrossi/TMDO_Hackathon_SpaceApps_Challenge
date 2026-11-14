import { describe, expect, it } from "vitest";
import { tituloZona } from "@/lib/zona";

describe("tituloZona · título del lote según dónde está", () => {
  it("localidad y provincia en Argentina", () => {
    expect(tituloZona({ City: "Alpa Corral", Region: "Córdoba", CntryName: "Argentina" })).toBe(
      "Lote cerca de Alpa Corral, Córdoba",
    );
  });

  it("sin localidad usa el departamento", () => {
    expect(tituloZona({ Subregion: "Río Cuarto", Region: "Córdoba", CntryName: "Argentina" })).toBe(
      "Lote cerca de Río Cuarto, Córdoba",
    );
  });

  it("fuera de Argentina suma el país", () => {
    expect(tituloZona({ City: "Ames", Region: "Iowa", CntryName: "Estados Unidos" })).toBe(
      "Lote cerca de Ames, Iowa, Estados Unidos",
    );
  });

  it("solo provincia o solo país", () => {
    expect(tituloZona({ Region: "La Pampa", CntryName: "Argentina" })).toBe("Lote en La Pampa");
    expect(tituloZona({ CntryName: "Uruguay" })).toBe("Lote en Uruguay");
  });

  it("sin datos útiles devuelve null", () => {
    expect(tituloZona({ City: " " })).toBeNull();
    expect(tituloZona(null)).toBeNull();
  });
});
