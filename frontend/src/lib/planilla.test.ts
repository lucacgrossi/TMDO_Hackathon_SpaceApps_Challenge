import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subirPlanilla } from "@/lib/api";
import {
  esPlantillaDeEjemplo,
  leerPlanilla,
  rangoCampanas,
  RESULTADO_EJEMPLO,
  resumenPlanilla,
  traeLluvia,
  type SeriePlanilla,
} from "@/lib/planilla";

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

  it("traeLluvia: solo con una planilla válida que tenga lluvia", () => {
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

describe("planilla CSV · plantilla de ejemplo (H-022)", () => {
  /** Lee la plantilla descargable como la devolvería el back (solo mes y lluvia). */
  const plantilla = (): SeriePlanilla => {
    const csv = readFileSync(fileURLToPath(new URL("../../public/plantillas/mediciones.csv", import.meta.url)), "utf-8");
    const filas = csv.trim().split(/
?
/).slice(1).map((l) => l.split(";"));
    return {
      ...RESULTADO_EJEMPLO.serie!,
      meses: filas.map(([mes, lluvia]) => ({ mes, lluvia_mm: Number(lluvia.replace(",", ".")) })),
      periodo: { desde: filas[0][0], hasta: filas[filas.length - 1][0] },
    };
  };

  it("la plantilla trae 12 meses (una campaña julio a junio) y se reconoce", () => {
    const s = plantilla();
    expect(s.meses).toHaveLength(12);
    expect(s.periodo).toEqual({ desde: "2024-07", hasta: "2025-06" });
    expect(esPlantillaDeEjemplo(s)).toBe(true);
  });

  it("con un solo dato cambiado ya no es la plantilla", () => {
    const s = plantilla();
    s.meses[3] = { ...s.meses[3], lluvia_mm: 70 };
    expect(esPlantillaDeEjemplo(s)).toBe(false);
    expect(esPlantillaDeEjemplo(RESULTADO_EJEMPLO.serie!)).toBe(false);
  });
});

describe("planilla CSV · servidor caído (H-024)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin conexión marca sinServidor y no culpa al archivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const r = await subirPlanilla(new File(["fecha;lluvia_mm"], "lluvia.csv"));
    expect(r.ok).toBe(false);
    expect(r.sinServidor).toBe(true);
    expect(r.errores[0].motivo).toMatch(/servidor/);
    expect(r.errores[0].motivo).not.toMatch(/corregi/i);
  });

  it("un 5xx también es del servidor; un 422 con errores es del archivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    expect((await subirPlanilla(new File(["x"], "a.csv"))).sinServidor).toBe(true);
    const cuerpo = { ok: false, serie: null, errores: [{ fila: 2, motivo: "x" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 422 })));
    expect((await subirPlanilla(new File(["x"], "a.csv"))).sinServidor).toBeUndefined();
  });
});
