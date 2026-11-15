import { describe, expect, it } from "vitest";
import { mockAnalizar } from "@/mocks/analizar";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";
import type { Salida } from "./contrato";
import { SECCIONES, SIN_DATO, datosSeccion, fichaDelLote } from "./dashboard";

const valores = (s: Salida) => Object.fromEntries(fichaDelLote(s).map((p) => [p.etiqueta, p.valor]));

describe("secciones del dashboard", () => {
  it("son mapa, clima y rotaciones, en ese orden", () => {
    expect(SECCIONES.map((s) => s.id)).toEqual(["mapa", "clima", "rotaciones"]);
  });

  it("cada sección tiene su título", () => {
    expect(datosSeccion("mapa").titulo).toBe("Mapa del lote");
    expect(datosSeccion("clima").titulo).toBe("Clima histórico");
    expect(datosSeccion("rotaciones").titulo).toBe("Rotaciones");
  });
});

describe("fichaDelLote", () => {
  it("devuelve siempre los 4 pares en orden", () => {
    expect(fichaDelLote(RIO_CUARTO).map((p) => p.etiqueta)).toEqual([
      "Superficie",
      "Campaña satelital",
      "Clima",
      "Tus mediciones",
    ]);
  });

  it("lee los valores de la respuesta sin calcularlos", () => {
    const v = valores(RIO_CUARTO);
    expect(v["Superficie"]).toBe(`${RIO_CUARTO.lote.area_ha.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`);
    expect(v["Campaña satelital"]).toBe(RIO_CUARTO.visto_por_satelite.campana);
    expect(v["Clima"]).toBe(`${RIO_CUARTO.clima_mensual.n_anios} campañas, ${RIO_CUARTO.periodo_clima}`);
  });

  it("usa coma decimal en la superficie", () => {
    const s: Salida = { ...RIO_CUARTO, lote: { ...RIO_CUARTO.lote, area_ha: 94.94 } };
    expect(valores(s)["Superficie"]).toBe("94,9 ha");
  });

  it("muestra 'sin dato' si no hay campaña satelital, nunca 0", () => {
    const s: Salida = {
      ...RIO_CUARTO,
      visto_por_satelite: { ...RIO_CUARTO.visto_por_satelite, campana: null },
    };
    expect(valores(s)["Campaña satelital"]).toBe(SIN_DATO);
  });

  it("dice 'Sin cargar' sin mediciones y cuenta los datos contrastados si hay", () => {
    const sin: Salida = { ...RIO_CUARTO, contraste_mediciones: [] };
    expect(valores(sin)["Tus mediciones"]).toBe("Sin cargar");

    const con = mockAnalizar({ lluviaAnualMm: 700 });
    const n = con.contraste_mediciones.length;
    expect(n).toBeGreaterThan(0);
    expect(valores(con)["Tus mediciones"]).toBe(`${n} ${n === 1 ? "dato" : "datos"} contra NASA`);
  });
});
