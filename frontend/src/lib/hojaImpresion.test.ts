import { describe, expect, it } from "vitest";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";
import type { Salida } from "./contrato";
import { SIN_DATO } from "./dashboard";
import { fechaGeneracion, fichaImpresion, fuentesDelAnalisis, textoPrioridades } from "./hojaImpresion";

const pesos = { agua: 3, suelo: 4, erosion: 3, ingreso: 2 };

describe("textoPrioridades", () => {
  it("lista las 4 prioridades en orden", () => {
    expect(textoPrioridades(pesos)).toBe("Agua 3, Suelo 4, Erosión 3, Ingreso 2");
  });
});

describe("fechaGeneracion", () => {
  it("usa día/mes/año", () => {
    expect(fechaGeneracion(new Date(2026, 10, 15, 12))).toBe("15/11/2026");
  });
});

describe("fichaImpresion", () => {
  it("suma lote, centro y prioridades a la ficha del encabezado", () => {
    const ficha = fichaImpresion(RIO_CUARTO, [-33.2477, -64.2325], pesos);
    expect(ficha.map((p) => p.etiqueta)).toEqual([
      "Lote",
      "Superficie",
      "Campaña satelital",
      "Clima",
      "Tus mediciones",
      "Centro",
      "Prioridades (1 a 5)",
    ]);
    expect(ficha.find((p) => p.etiqueta === "Centro")?.valor).toBe("33,2477° S, 64,2325° O");
  });

  it("sin centro ni localidad dice 'sin dato'", () => {
    const s: Salida = { ...RIO_CUARTO, lote: { ...RIO_CUARTO.lote, localidad_aprox: null } };
    const ficha = fichaImpresion(s, null, pesos);
    expect(ficha.find((p) => p.etiqueta === "Lote")?.valor).toBe(SIN_DATO);
    expect(ficha.find((p) => p.etiqueta === "Centro")?.valor).toBe(SIN_DATO);
  });
});

describe("fuentesDelAnalisis", () => {
  it("empieza por el clima con su resolución y período", () => {
    const f = fuentesDelAnalisis(RIO_CUARTO);
    const cm = RIO_CUARTO.clima_mensual;
    expect(f[0]).toBe(`${cm.fuente} (${cm.resolucion}, ${cm.periodo})`);
  });

  it("no repite fuentes, aunque vengan con otro formato", () => {
    const f = fuentesDelAnalisis(RIO_CUARTO);
    expect(new Set(f).size).toBe(f.length);
    const power = f.filter((x) => x.startsWith(RIO_CUARTO.clima_mensual.fuente.split(" (")[0]));
    expect(power).toHaveLength(1);
  });
});
