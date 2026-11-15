import { describe, expect, it } from "vitest";
import { efectoContraste, nombreIndicador } from "@/lib/contraste";

describe("efectoContraste", () => {
  it("la lluvia habla del 15 % y del agua", () => {
    expect(efectoContraste({ indicador: "lluvia_anual", confianza_resultante: "baja" })).toMatch(/15 %.*agua/);
    expect(efectoContraste({ indicador: "lluvia_anual", confianza_resultante: "alta" })).toMatch(/no cambia/);
  });

  it("heladas y calor usan la regla de 1 de cada 3 campañas, no el 15 % del agua", () => {
    for (const indicador of ["helada", "calor"]) {
      for (const confianza_resultante of ["alta", "baja"] as const) {
        const t = efectoContraste({ indicador, confianza_resultante });
        expect(t).toContain("1 de cada 3 campañas");
        expect(t).not.toMatch(/15 %|agua/);
      }
    }
    expect(efectoContraste({ indicador: "helada", confianza_resultante: "baja" })).toContain("confianza baja en las heladas");
  });

  it("nombres legibles para cada indicador", () => {
    expect(nombreIndicador("helada")).toBe("Heladas");
    expect(nombreIndicador("calor")).toBe("Calor (35 °C o más)");
    expect(nombreIndicador("otro")).toBe("otro");
  });
});
