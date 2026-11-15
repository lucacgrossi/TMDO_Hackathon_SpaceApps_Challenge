import { describe, expect, it } from "vitest";
import type { SerieAnual } from "@/lib/contrato";
import { barrasSerie, conteoTercios, textoCampana, textosSerie } from "@/lib/serie";
import { MOCK_BASE } from "@/mocks/analizar";

const SERIE = MOCK_BASE.serie_anual!;

describe("serie de lluvia por campaña", () => {
  it("el mock trae la serie del back con 30 campañas", () => {
    expect(SERIE.campanas).toHaveLength(30);
    expect(SERIE.periodo).toBe("1995/96–2024/25");
  });

  it("la serie, los tipos de año y el encabezado dicen el mismo período y los mismos tercios", () => {
    expect(MOCK_BASE.periodo_clima).toBe(SERIE.periodo);
    expect(MOCK_BASE.clima_mensual.periodo).toBe(SERIE.periodo);
    for (const c of SERIE.campanas) expect(MOCK_BASE.tipos_de_anio[c.tipo]).toContain(c.campana);
  });

  it("marca solo las últimas 10 y escala el alto a la campaña más lluviosa", () => {
    const barras = barrasSerie(SERIE);
    expect(barras.filter((b) => b.reciente).map((b) => b.campana)[0]).toBe("2015/16");
    expect(barras.filter((b) => b.reciente)).toHaveLength(10);
    expect(barras.find((b) => b.campana === "1997/98")!.alto).toBe(1);
    expect(barras.every((b) => b.alto > 0 && b.alto <= 1)).toBe(true);
  });

  it("el tercio sale del contrato, no se recalcula", () => {
    expect(conteoTercios(SERIE)).toEqual({ seco: 10, normal: 10, humedo: 10 });
    const barras = barrasSerie(SERIE);
    expect(barras.find((b) => b.campana === "2022/23")!.tipo).toBe("seco");
  });

  it("cada campaña dice su valor exacto y el tercio en palabras", () => {
    expect(textoCampana(SERIE.campanas[25])).toBe("2020/21 · 769 mm · balance −466 mm · tercio normal");
    expect(textoCampana({ campana: "2000/01", lluvia_mm: 1156, balance_mm: null, tipo: "humedo" })).toBe(
      "2000/01 · 1.156 mm · tercio húmedo",
    );
  });

  it("describe los promedios y los secos recientes con los números del back", () => {
    const t = textosSerie(SERIE, "terciles_balance");
    expect(t.titulo).toBe("Lluvia por campaña · 30 campañas");
    expect(t.promedios).toBe("Últimas 10: 784 mm · 20 previas: 761 mm (+3 %)");
    expect(t.secos).toBe("3 de las últimas 10 en el tercio seco (10 de 30 en toda la serie)");
    expect(t.criterio).toContain("balance de agua");
    expect(t.fuente).toContain("NASA POWER");
    expect(t.fuente).toContain("~50 km");
    expect(t.fuente).toContain("1995/96–2024/25");
    expect(textosSerie(SERIE, "terciles_lluvia").criterio).toContain("tercio de lluvia");
  });

  it("no usa lenguaje de recomendación", () => {
    const t = textosSerie(SERIE, "terciles_balance");
    const todo = [...Object.values(t), ...barrasSerie(SERIE).map((b) => b.texto)].join(" ").toLowerCase();
    for (const prohibido of ["recomend", "debería", "la mejor", "conviene"]) expect(todo).not.toContain(prohibido);
  });

  it("con menos de 10 campañas no inventa previas", () => {
    const corta: SerieAnual = { ...SERIE, campanas: SERIE.campanas.slice(-4), previas_20_mm: 0 };
    const t = textosSerie(corta, "terciles_balance");
    expect(t.promedios).toBe("Últimas 4: 784 mm");
    expect(barrasSerie(corta).every((b) => b.reciente)).toBe(true);
  });
});
