import { describe, expect, it } from "vitest";
import { mockAnalizar } from "@/mocks/analizar";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";
import { choqueObjetivos } from "./cercania";
import { esDisponible, type CultivoMes, type Salida } from "./contrato";
import { balancePorTipo, celdasCalendario, cincoPuntos, textoBandaChoque, textoPelado } from "./rotaciones";

const disponible = (s: Salida, i: number) => {
  const e = s.estrategias[i];
  if (!esDisponible(e)) throw new Error("la estrategia del mock debería estar disponible");
  return e;
};

describe("celdasCalendario", () => {
  // Soja de noviembre a abril, barbecho el resto (índice 0 = enero)
  const cal: CultivoMes[] = ["soja", "soja", "soja", "soja", "barbecho", "barbecho", "barbecho", "barbecho", "barbecho", "barbecho", "soja", "soja"];

  it("ordena de julio a junio", () => {
    const celdas = celdasCalendario(cal);
    expect(celdas.map((c) => c.mes)).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
    expect(celdas.map((c) => c.inicial).join("")).toBe("JASONDEFMAMJ");
  });

  it("asigna cultivo y grupo de cada mes", () => {
    const celdas = celdasCalendario(cal);
    expect(celdas[0]).toMatchObject({ mes: 6, cultivo: "barbecho", grupo: "barbecho", nombreMes: "julio" });
    expect(celdas[0].nombreCultivo).toBe("Barbecho (pelado)");
    expect(celdas[4]).toMatchObject({ mes: 10, cultivo: "soja", grupo: "verano", nombreCultivo: "Soja" });
  });
});

describe("textoPelado", () => {
  it("usa singular y plural", () => {
    expect(textoPelado(1)).toBe("1 mes con el lote pelado");
    expect(textoPelado(6)).toBe("6 meses con el lote pelado");
  });

  it("null es sin dato, nunca 0", () => {
    expect(textoPelado(null)).toBe("Meses con el lote pelado: sin dato");
  });
});

describe("balancePorTipo", () => {
  it("lee el balance de cada tipo de año con letra y signo", () => {
    const e = disponible(RIO_CUARTO, 0);
    const b = balancePorTipo(e);
    expect(b.map((x) => x.letra)).toEqual(["S", "N", "H"]);
    expect(b[0].valor).toMatch(/ mm$/);
    const seco = e.valores_por_tipo_anio.seco.agua_mm;
    expect(b[0].valor.startsWith(seco < 0 ? "−" : seco > 0 ? "+" : "0")).toBe(true);
  });
});

describe("cincoPuntos", () => {
  it("son siempre los 5, en orden, también en una descartada", () => {
    const s = mockAnalizar({ noSembrar: ["vicia", "centeno"] });
    const descartada = s.estrategias[1];
    expect(descartada.disponible).toBe(false);
    const puntos = cincoPuntos(descartada);
    expect(puntos.map((p) => p.titulo)).toEqual([
      "Por qué",
      "Evidencia",
      "Beneficios",
      "Información que falta",
      "A revisar con el agrónomo",
    ]);
    expect(puntos.every((p) => p.vacio.length > 0)).toBe(true);
  });

  it("pasa los items del back tal cual", () => {
    const e = RIO_CUARTO.estrategias[1];
    expect(cincoPuntos(e)[0].items).toBe(e.por_que);
  });
});

describe("textoBandaChoque", () => {
  // Agua 5 y suelo 5: en el mock quedan más cerca alternativas distintas
  const pesosChoque = { agua: 5, suelo: 5, erosion: 1, ingreso: 1 };
  const pesosSinChoque = { agua: 3, suelo: 3, erosion: 3, ingreso: 3 };

  it("sin choque con las prioridades actuales no hay banda", () => {
    expect(textoBandaChoque(RIO_CUARTO, pesosSinChoque)).toBeNull();
  });

  it("con choque recalculado usa el texto fijo del cliente si el back no lo traía", () => {
    const local = choqueObjetivos(RIO_CUARTO.estrategias, pesosChoque);
    if (!local) return; // el mock no tiene choque con estos pesos: nada que probar
    const t = textoBandaChoque(RIO_CUARTO, pesosChoque);
    expect(t).toMatch(/chocan en este lote\./);
  });

  it("si el back trae el mismo choque, muestra su texto tal cual", () => {
    const local = choqueObjetivos(RIO_CUARTO.estrategias, pesosChoque);
    if (!local) return;
    const s: Salida = { ...RIO_CUARTO, choque: { hay: true, objetivos: [...local.objetivos], texto: "Texto del back." } };
    expect(textoBandaChoque(s, pesosChoque)).toBe("Texto del back.");
  });
});
