import { describe, expect, it } from "vitest";
import { esDisponible, type Estrategia, type EstrategiaDisponible, type Probabilidad } from "@/lib/contrato";
import { metricasTarjeta, rangoTipoAnio, seccionesDetalle, textoProbabilidad } from "@/lib/tarjeta";
import { MOCK_BASE } from "@/mocks/analizar";

function disponible(e: Estrategia): EstrategiaDisponible {
  if (!esDisponible(e)) throw new Error(`${e.id} debería estar disponible en el mock base`);
  return e;
}

const [actual, a, , c] = MOCK_BASE.estrategias.map(disponible);

describe("métricas de la tarjeta", () => {
  it("la actual es la base: sin diferencia", () => {
    const m = metricasTarjeta(actual, actual);
    expect(m.map((x) => x.objetivo)).toEqual(["agua", "suelo", "erosion", "ingreso"]);
    expect(m.every((x) => x.diferencia === "base")).toBe(true);
  });

  it("el agua va en mm de balance y el resto en puntos, con la diferencia frente a la actual", () => {
    const [agua, suelo, erosion] = metricasTarjeta(a, actual);
    // A: −342 mm contra −224 de la actual; suelo 87 contra 32; erosión 91 contra 48
    expect(agua).toMatchObject({ valor: "−342", unidad: "mm", diferencia: "−118 mm", puntos: 42 });
    expect(suelo).toMatchObject({ valor: "87", unidad: "pts", diferencia: "+55 pts" });
    expect(erosion.diferencia).toBe("+43 pts");
    expect(agua.descripcion).toContain("−118 mm frente a la actual");
  });

  it("una diferencia de cero se dice 'igual'", () => {
    const igual = { ...c, puntos: { ...c.puntos, ingreso: actual.puntos.ingreso } };
    expect(metricasTarjeta(igual, actual)[3].diferencia).toBe("igual");
  });
});

describe("rango de cada tipo de año", () => {
  it("usa los umbrales de los terciles de balance y la cantidad de campañas", () => {
    const t = MOCK_BASE.tipos_de_anio;
    expect(rangoTipoAnio(t, "seco")).toBe(`Años secos: balance de la campaña hasta −420 mm (${t.seco.length} campañas)`);
    expect(rangoTipoAnio(t, "normal")).toContain("entre −420 mm y −240 mm");
    expect(rangoTipoAnio(t, "humedo")).toContain("desde −240 mm");
  });
});

describe("probabilidad climatológica", () => {
  const p: Probabilidad = {
    evento: "siembra_seca",
    mes: 4,
    cultivo: "vicia",
    anios: 14,
    de: 30,
    pct: 47,
    texto: "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)",
    fuente: "NASA POWER",
  };

  it("deja el texto del back si ya trae el conteo de años", () => {
    expect(textoProbabilidad(p)).toBe(p.texto);
  });

  it("suma el conteo si el texto llega sin él: nunca solo el porcentaje", () => {
    const sinConteo = { ...p, texto: "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal" };
    expect(textoProbabilidad(sinConteo)).toBe(
      "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)",
    );
  });
});

describe("detalle de la tarjeta", () => {
  it("siempre trae los 5 puntos en orden y todas las probabilidades", () => {
    const s = seccionesDetalle(a, 30);
    expect(s.map((x) => x.id)).toEqual(["por_que", "evidencia", "beneficios", "vacios", "riesgos", "probabilidades"]);
    expect(s[5].titulo).toBe("En las últimas 30 campañas");
    expect(s[5].items).toHaveLength(a.probabilidades.length);
  });

  it("lleva el contraste de la estación del productor alineado con cada probabilidad", () => {
    const [p1, p2] = a.probabilidades;
    const conEstacion = {
      ...a,
      probabilidades: [{ ...p1, contraste: "Tu estación: helada en mayo en 4 de 6 campañas" }, { ...p2, contraste: null }],
    };
    const prob = seccionesDetalle(conEstacion, 30)[5];
    expect(prob.items).toEqual([p1.texto, p2.texto]);
    expect(prob.contrastes).toEqual(["Tu estación: helada en mayo en 4 de 6 campañas", null]);
  });

  it("sin beneficios, la actual dice que es la base (no queda vacío)", () => {
    const b = seccionesDetalle(actual, 30).find((x) => x.id === "beneficios");
    expect(b?.items).toEqual([]);
    expect(b?.vacio).toBe("Es la base de la comparación");
  });
});
