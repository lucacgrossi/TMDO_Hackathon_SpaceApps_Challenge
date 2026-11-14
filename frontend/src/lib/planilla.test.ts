import { describe, expect, it } from "vitest";
import { leerPlanilla, rangoCampanas, RESULTADO_EJEMPLO, resumenPlanilla, traeLluvia } from "@/lib/planilla";

describe("planilla CSV · vista previa", () => {
  it("resume campañas, registros y filas descartadas como el plan", () => {
    expect(resumenPlanilla(RESULTADO_EJEMPLO.serie!)).toEqual([
      "Lluvia: 6 campañas completas (2018/19 a 2023/24)",
      "Temperatura: 4 campañas completas (2020/21 a 2023/24)",
      "1.248 registros diarios",
      "3 filas descartadas",
    ]);
  });

  it("singular y sin campañas completas", () => {
    const s = {
      ...RESULTADO_EJEMPLO.serie!,
      variables: ["lluvia_mm" as const],
      campanas_completas: {},
      granularidad: "mensual" as const,
      filas_leidas: 1,
      filas_usadas: 1,
    };
    expect(resumenPlanilla(s)).toEqual(["Lluvia: ninguna campaña completa (julio a junio)", "1 registro mensual"]);
  });

  it("rango de campañas", () => {
    expect(rangoCampanas(["2020/21"])).toBe("2020/21");
    expect(rangoCampanas([])).toBe("");
  });

  it("con lluvia se deshabilita la carga a mano; con error no", () => {
    expect(traeLluvia(RESULTADO_EJEMPLO)).toBe(true);
    expect(traeLluvia({ ok: false, serie: null, errores: [] })).toBe(false);
    expect(traeLluvia(null)).toBe(false);
  });

  it("rechaza en el navegador archivos de más de 1 MB o que no son CSV", async () => {
    const grande = new File([new Uint8Array(1024 * 1024 + 1)], "a.csv");
    expect((await leerPlanilla(grande)).errores[0].motivo).toMatch(/1 MB/);
    const xlsx = new File(["x"], "a.xlsx");
    expect((await leerPlanilla(xlsx)).ok).toBe(false);
    expect((await leerPlanilla(new File(["x"], "lluvia.csv"))).ejemplo).toBe(true);
  });
});
