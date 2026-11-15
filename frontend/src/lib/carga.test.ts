import { describe, expect, it } from "vitest";
import { CONSULTAS, textoLote, textosError, textoTiempo } from "./carga";

describe("textoLote", () => {
  it("superficie con un decimal y el lugar", () => {
    expect(textoLote(94.9, "cerca de Río Cuarto")).toBe("Lote de 94,9 ha cerca de Río Cuarto.");
  });

  it("sin lugar o sin superficie, la frase se acorta", () => {
    expect(textoLote(95, null)).toBe("Lote de 95,0 ha.");
    expect(textoLote(null, "cerca de Río Cuarto")).toBe("Tu lote cerca de Río Cuarto.");
    expect(textoLote(0, "  ")).toBe("Tu lote.");
  });
});

describe("textoTiempo", () => {
  it("redondea los segundos hacia abajo y nunca es negativo", () => {
    expect(textoTiempo(12_900)).toBe("Suele tardar hasta 30 s; van 12 s.");
    expect(textoTiempo(0)).toBe("Suele tardar hasta 30 s; van 0 s.");
    expect(textoTiempo(-3000)).toBe("Suele tardar hasta 30 s; van 0 s.");
    expect(textoTiempo(Number.NaN)).toBe("Suele tardar hasta 30 s; van 0 s.");
  });
});

describe("CONSULTAS", () => {
  it("son las 5 partes del pedido, con fuente y resolución", () => {
    expect(CONSULTAS.map((c) => c.dato)).toEqual(["Clima", "Vegetación", "Relieve", "Uso del suelo", "Comparación"]);
    for (const c of CONSULTAS) {
      expect(c.fuente).not.toBe("");
      expect(c.resolucion).not.toBe("");
    }
  });
});

describe("textosError", () => {
  it("422 de esquema (error de la app): no ofrece reintentar ni habla del polígono", () => {
    const t = textosError(422, true);
    expect(t.titulo).not.toContain("polígono");
    expect(t.acciones).toEqual(["marcar"]);
  });

  it("422: el polígono no es un lote agrícola", () => {
    const t = textosError(422);
    expect(t.titulo).toBe("Este polígono no parece un lote agrícola");
    expect(t.acciones).toEqual(["marcar"]);
  });

  it("503: NASA POWER no responde", () => {
    const t = textosError(503);
    expect(t.titulo).toBe("NASA POWER no responde");
    expect(t.acciones).toEqual(["reintentar"]);
  });

  it("otro código o sin respuesta: solo probar de nuevo", () => {
    expect(textosError(500).acciones).toEqual(["reintentar"]);
    expect(textosError(0).acciones).toEqual(["reintentar"]);
    expect(textosError(500).comoSeguir).not.toMatch(/ejemplo/i);
  });

  it("los textos no recomiendan", () => {
    for (const c of [422, 503, 500]) {
      const t = textosError(c);
      expect(`${t.titulo} ${t.comoSeguir}`).not.toMatch(/recomendamos|deberías|la mejor/i);
    }
  });
});
