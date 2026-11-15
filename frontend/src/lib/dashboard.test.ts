import { describe, expect, it } from "vitest";
import { mockAnalizar } from "@/mocks/analizar";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";
import { SECCIONES } from "./app";
import type { ContrasteMedicion, Salida } from "./contrato";
import { MENU_SECCIONES, SIN_DATO, fichaDelLote, itemMenu, textoMediciones } from "./dashboard";

const valores = (s: Salida) => Object.fromEntries(fichaDelLote(s).map((p) => [p.etiqueta, p.valor]));

describe("menú del dashboard", () => {
  it("tiene las mismas secciones que useApp, en el mismo orden", () => {
    expect(MENU_SECCIONES.map((s) => s.id)).toEqual([...SECCIONES]);
  });

  it("cada sección tiene su título", () => {
    expect(itemMenu("mapa").titulo).toBe("Mapa del lote");
    expect(itemMenu("clima").titulo).toBe("Clima histórico");
    expect(itemMenu("rotaciones").titulo).toBe("Rotaciones");
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
});

describe("textoMediciones", () => {
  const fila = (campanas: string[] | null): ContrasteMedicion => ({
    indicador: "lluvia",
    valor_productor: 700,
    valor_nasa: 780,
    unidad: "mm",
    diferencia_pct: -10,
    confianza_resultante: "alta",
    corregido_al_lado: null,
    texto: "",
    campanas_comparadas: campanas,
  });

  it("dice 'Sin cargar' sin mediciones", () => {
    expect(textoMediciones({ ...RIO_CUARTO, contraste_mediciones: [] })).toBe("Sin cargar");
  });

  it("dice 'Cargadas' si hay mediciones sin campañas comparadas", () => {
    const con = mockAnalizar({ lluviaAnualMm: 700 });
    expect(con.contraste_mediciones.length).toBeGreaterThan(0);
    expect(textoMediciones({ ...con, contraste_mediciones: [fila(null)] })).toBe("Cargadas");
  });

  it("cuenta las campañas distintas comparadas con NASA", () => {
    const s: Salida = {
      ...RIO_CUARTO,
      contraste_mediciones: [fila(["2018/19", "2019/20", "2020/21"]), fila(["2019/20", "2021/22"])],
    };
    expect(textoMediciones(s)).toBe("Planilla, 4 campañas comparadas con NASA");
  });

  it("usa el singular con una sola campaña", () => {
    const s: Salida = { ...RIO_CUARTO, contraste_mediciones: [fila(["2023/24"])] };
    expect(textoMediciones(s)).toBe("Planilla, 1 campaña comparada con NASA");
  });
});
