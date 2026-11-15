import { describe, expect, it } from "vitest";
import { ENTRADAS_INICIALES, LOTE_DEMO } from "@/lib/entradas";
import { RESULTADO_EJEMPLO } from "@/lib/planilla";
import {
  coordenadas,
  resumenDatosLote,
  resumenMediciones,
  resumenPrioridades,
  resumenRestricciones,
  resumenRotacion,
  superficie,
} from "@/lib/resumenEntradas";

const SIN_MEDICIONES = ENTRADAS_INICIALES.mediciones;

describe("resúmenes del panel de entradas", () => {
  it("rotación: verano con el invierno y la campaña pasada", () => {
    expect(resumenRotacion({ verano: "soja", invierno: "barbecho", pasada: "soja" })).toBe(
      "Soja con barbecho invernal; antes, soja",
    );
    expect(resumenRotacion({ verano: "maiz", invierno: "trigo", pasada: "soja" })).toBe("Maíz con trigo; antes, soja");
  });

  it("prioridades: las 4, en el orden de las barras", () => {
    expect(resumenPrioridades({ agua: 5, suelo: 3, erosion: 1, ingreso: 4 })).toBe("Agua 5, Suelo 3, Erosión 1, Ingreso 4");
  });

  it("restricciones: las activas y lo que no se siembra", () => {
    const sinNada = { restricciones: { sinRiego: false, sinHacienda: false, maquinariaLimitada: false }, noSembrar: [] };
    expect(resumenRestricciones(sinNada)).toBe("Sin restricciones");
    expect(resumenRestricciones({ ...sinNada, restricciones: { ...sinNada.restricciones, sinRiego: true } })).toBe(
      "Sin riego",
    );
    expect(
      resumenRestricciones({
        restricciones: { sinRiego: true, sinHacienda: true, maquinariaLimitada: false },
        noSembrar: ["vicia", "sorgo"],
      }),
    ).toBe("Sin riego, sin hacienda; no sembrar: vicia y sorgo");
    expect(resumenRestricciones({ ...sinNada, noSembrar: ["trigo"] })).toBe("No sembrar: trigo");
  });

  it("datos del lote: encharcamiento y textura", () => {
    expect(resumenDatosLote({ anegable: "a_veces", textura: "no_se" })).toBe("Se encharca: a veces; textura: no sé");
  });

  it("mediciones: sin cargar o con planilla (no hay carga a mano)", () => {
    expect(resumenMediciones(SIN_MEDICIONES)).toBe("Sin cargar");
    const m = { ...SIN_MEDICIONES, planilla: { nombre: "lluvia.csv", resultado: RESULTADO_EJEMPLO } };
    expect(resumenMediciones(m)).toBe("Planilla lluvia.csv");
  });

  it("superficie y coordenadas del lote de ejemplo", () => {
    expect(superficie(LOTE_DEMO)).toMatch(/^\d{2},\d ha$/);
    expect(coordenadas([-33.2477, -64.2325])).toBe("33,2477° S, 64,2325° O");
  });
});
