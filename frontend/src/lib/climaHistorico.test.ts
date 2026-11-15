import { describe, expect, it } from "vitest";
import { elegirCampana } from "@/lib/campanaClima";
import { datosGrafico, fichaCampana, heladasCalor } from "@/lib/climaHistorico";
import type { SerieAnual } from "@/lib/contrato";
import { RIO_CUARTO as MOCK } from "@/mocks/rio-cuarto";

const SERIE = MOCK.serie_anual!;
const CLIMA = MOCK.clima_mensual;

describe("gráfico de la campaña", () => {
  it("12 meses de julio a junio con el año de cada mes", () => {
    const f = datosGrafico(CLIMA, elegirCampana(SERIE, "2021/22"));
    expect(f.map((x) => x.corto)).toEqual(["jul", "ago", "sep", "oct", "nov", "dic", "ene", "feb", "mar", "abr", "may", "jun"]);
    expect(f[0].nombre).toBe("julio de 2021");
    expect(f[6].nombre).toBe("enero de 2022");
  });

  it("la campaña va contra la media de 30 años, mes por mes (índice 0 = enero)", () => {
    const f = datosGrafico(CLIMA, elegirCampana(SERIE, "2021/22"));
    const enero = f.find((x) => x.mes === 0)!;
    expect(enero).toMatchObject({ lluvia: 88.9, lluviaMedia: 130.8, balance: -123, balanceMedia: -71.5 });
    const julio = f[0];
    expect(julio).toMatchObject({ mes: 6, lluvia: 2.9, lluviaMedia: 9.7 });
  });

  it("T mín y T máx (extremos) van contra minima_media_c y maxima_media_c, no contra t_media_c", () => {
    const conMedia = { ...CLIMA, t_media_c: CLIMA.lluvia_mm.map(() => 99) };
    const julio = datosGrafico(conMedia, elegirCampana(SERIE, "2021/22"))[0];
    expect(julio.tminMedia).toBe(CLIMA.minima_media_c[6]);
    expect(julio.tmaxMedia).toBe(CLIMA.maxima_media_c[6]);
    expect([julio.tminMedia, julio.tmaxMedia]).not.toContain(99);
  });

  it("sin campaña (o sin mensual) solo la media, con los valores de la campaña en null", () => {
    const f = datosGrafico(CLIMA, null);
    expect(f[0]).toMatchObject({ nombre: "julio", lluvia: null, tmin: null, tmax: null, balance: null, lluviaMedia: 9.7 });
    const sinMensual: SerieAnual = { ...SERIE, campanas: SERIE.campanas.map((c) => ({ ...c, mensual: null })) };
    expect(datosGrafico(CLIMA, elegirCampana(sinMensual, "2021/22"))[0].lluvia).toBeNull();
  });
});

describe("ficha de la campaña", () => {
  it("con campaña: lluvia, ET0 (suma de los 12 meses), balance y heladas", () => {
    const f = fichaCampana(MOCK, elegirCampana(SERIE, "2021/22"));
    expect(f.map((x) => x.etiqueta)).toEqual(["Lluvia", "ET0 (Hargreaves)", "Balance de agua", "Meses con mínima bajo 0 °C"]);
    expect(f[0]).toEqual({ etiqueta: "Lluvia", valor: "546 mm", pie: "Media de 30 años: 819 mm/campaña." });
    expect(f[1].valor).toBe("1.497 mm");
    expect(f[2]).toEqual({ etiqueta: "Balance de agua", valor: "−952 mm", pie: "Umbral del tercio seco: −731 mm." });
    expect(f[3].valor).toBe("3");
    expect(f[3].pie).toBe("En la campaña: jul, may, jun. Con helada frecuente en 30 campañas: jul, ago, sep, jun.");
  });

  it("cuenta los meses de la campaña con mínima bajo 0 °C", () => {
    const campanas = SERIE.campanas.map((c) =>
      c.campana === "2021/22" ? { ...c, mensual: { ...c.mensual!, t_min_c: c.mensual!.t_min_c.map((_, i) => (i === 6 || i === 7 ? -2 : 5)) } } : c,
    );
    const f = fichaCampana(MOCK, elegirCampana({ ...SERIE, campanas }, "2021/22"));
    expect(f[3].valor).toBe("2");
    expect(f[3].pie).toMatch(/^En la campaña: jul, ago\. /);
  });

  it("sin ET0 de la campaña dice sin dato", () => {
    const campanas = SERIE.campanas.map((c) => ({ ...c, mensual: c.mensual ? { ...c.mensual, et0_mm: null } : null }));
    const f = fichaCampana(MOCK, elegirCampana({ ...SERIE, campanas }, "2021/22"));
    expect(f[1]).toMatchObject({ valor: "sin dato", pie: "Esta respuesta no trae la ET0 de la campaña." });
  });

  it("sin campaña: la media de 30 años", () => {
    const f = fichaCampana(MOCK, null);
    expect(f[0].valor).toBe("819 mm/campaña");
    expect(f[2].valor).toBe("−628 mm/campaña");
    expect(f[3]).toMatchObject({ etiqueta: "Meses con helada frecuente", valor: "4" });
  });
});

describe("heladas y calor por mes", () => {
  it("de julio a junio, siempre como N de 30 años", () => {
    const h = heladasCalor(CLIMA);
    expect(h.map((x) => x.heladas)).toEqual([26, 20, 11, 0, 0, 0, 0, 0, 0, 0, 8, 25]);
    expect(h.map((x) => x.calor)).toEqual([0, 2, 5, 14, 25, 26, 29, 24, 16, 1, 0, 0]);
    expect(h[0].textoHeladas).toBe("26 de 30 años con mínima bajo 0 °C en julio");
    expect(h[6].textoCalor).toBe("29 de 30 años con máxima de 35 °C o más en enero");
  });
});
