import { describe, expect, it } from "vitest";
import { ASUNTO_MAIL, AVISO_APOYO, linkMail, resumenComparacion } from "@/lib/compartir";
import type { Pesos } from "@/lib/cercania";
import { MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO } from "@/mocks/analizar";

const PESOS: Pesos = { agua: 3, suelo: 3, erosion: 3, ingreso: 3 };
const FECHA = new Date(2026, 10, 14);

describe("resumen para compartir", () => {
  const texto = resumenComparacion(MOCK_BASE, PESOS, FECHA);

  it("arranca con el lote, el período de clima, la pendiente y las barras", () => {
    const [titulo, lote, objetivos] = texto.split("\n");
    expect(titulo).toBe("Field Shift · comparación de rotaciones");
    expect(lote).toBe(
      "Lote: 95 ha · a 17 km de Río Cuarto, Córdoba · Clima NASA POWER 1995/96–2024/25 · pendiente 0,6 % · 14/11/2026",
    );
    expect(objetivos).toBe("Objetivos (0 a 5): agua 3 · suelo 3 · erosión 3 · ingreso 3");
  });

  it("tiene una línea por columna con cercanía, cobertura baja y el trío", () => {
    for (const etiqueta of ["Actual · ", "A · ", "B · ", "C · "]) {
      const linea = texto.split("\n").find((l) => l.startsWith(etiqueta));
      expect(linea).toMatch(/cercanía \d+ % · \d+ mes(es)? con cobertura baja · seco \d+ \/ normal \d+ \/ húmedo \d+/);
    }
    expect(texto).toContain("1 mes con cobertura baja");
    expect(texto).not.toMatch(/(^|\D)1 meses/);
  });

  it("la cercanía sigue a las barras (RF13)", () => {
    const soloAgua = resumenComparacion(MOCK_BASE, { agua: 5, suelo: 0, erosion: 0, ingreso: 0 }, FECHA);
    expect(soloAgua).not.toBe(texto);
    const enCero = resumenComparacion(MOCK_BASE, { agua: 0, suelo: 0, erosion: 0, ingreso: 0 }, FECHA);
    expect(enCero).toContain("cercanía — %");
  });

  it("muestra la probabilidad con el conteo de años", () => {
    expect(texto).toContain(MOCK_BASE.estrategias[1].probabilidades[0].texto);
    expect(texto).toMatch(/\d+ de 30 años/);
  });

  it("incluye lo visto por satélite, la información que falta y los datos de prueba", () => {
    expect(texto).toContain(
      "Visto por satélite (NASA HLS 30 m, campaña 2024/25): NDVI del lote menor a 0,3 en 6 de 11 meses con escena sin nubes",
    );
    expect(texto).toContain("Información que falta:\n- ");
    expect(texto).toContain("Datos de prueba");
  });

  it("termina con el aviso de apoyo", () => {
    expect(texto.endsWith(AVISO_APOYO)).toBe(true);
  });

  it("la descartada va con su motivo", () => {
    expect(resumenComparacion(MOCK_DESCARTADA, PESOS, FECHA)).toContain(
      "B · Cultivo de invierno (Trigo + soja 2ª): descartada (No sembrar trigo ni cebada)",
    );
  });

  it("el pluviómetro va al lado de NASA, con la confianza", () => {
    const t = resumenComparacion(MOCK_PLUVIOMETRO, PESOS, FECHA);
    expect(t).toContain("Tu pluviómetro: 620 mm/año · NASA: 769 mm (−19 %): confianza baja en agua");
    expect(texto).not.toContain("pluviómetro");
  });

  it("nunca recomienda ni elige", () => {
    for (const salida of [MOCK_BASE, MOCK_DESCARTADA, MOCK_PLUVIOMETRO]) {
      const t = resumenComparacion(salida, PESOS, FECHA).toLowerCase();
      expect(t).not.toContain("recomend");
      expect(t).not.toContain("deberías");
      expect(t).not.toContain("la mejor");
    }
  });
});

describe("link de mail", () => {
  it("lleva el asunto fijo y el resumen codificados", () => {
    const resumen = "Línea 1\nLínea 2 · 50 %";
    const link = linkMail(resumen);
    expect(link.startsWith("mailto:?subject=")).toBe(true);
    const params = new URLSearchParams(link.slice("mailto:?".length).replace(/\+/g, "%2B"));
    expect(params.get("subject")).toBe(ASUNTO_MAIL);
    expect(params.get("body")).toBe(resumen);
  });
});
