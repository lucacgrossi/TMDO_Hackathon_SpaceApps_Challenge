import { describe, expect, it } from "vitest";
import {
  boundsCelda,
  boundsPixel,
  clasesLeyenda,
  dibujoNdvi,
  estadoCapas,
  filasFicha,
  lecturaPixel,
  mesesBajos,
  moverPixel,
  numero,
  rasterDeCapa,
  textoValor,
  urlGibs,
} from "@/lib/capasLote";
import type { Salida } from "@/lib/contrato";
import { CAPA_RASTER_EJEMPLO as ejemplo } from "@/lib/ejemplos/capaRasterEjemplo";
import { RIO_CUARTO as MOCK } from "@/mocks/rio-cuarto";
// Respuesta precalculada del lote demo (datos reales, con los 12 rasters de NDVI y la erosión).
import demoJson from "../../../backend/app/demo/rio_cuarto.json";

const DEMO = demoJson as unknown as Salida;

describe("capas del mapa del lote", () => {
  it("con la demo, las 6 capas están disponibles", () => {
    expect(estadoCapas(DEMO).every((c) => c.disponible)).toBe(true);
    expect(estadoCapas(DEMO).map((c) => c.nombre)).toEqual(["Satélite", "NDVI", "Pendiente", "Cultivo", "Erosión", "Celda NASA POWER"]);
  });

  it("una respuesta sin erosión la deshabilita con el motivo", () => {
    const sinErosion: Salida = { ...MOCK, capas: { ...MOCK.capas, erosion_mapa: null } };
    const erosion = estadoCapas(sinErosion).find((c) => c.id === "erosion")!;
    expect(erosion.disponible).toBe(false);
    expect(erosion.motivo).toBe("Esta respuesta no trae la capa.");
    expect(estadoCapas(sinErosion).filter((c) => !c.disponible)).toHaveLength(1);
  });

  it("una capa en no_disponibles se apaga aunque traiga raster", () => {
    const s = { ...DEMO, capas: { ...DEMO.capas, no_disponibles: ["cultivo_mapa"] } };
    expect(estadoCapas(s).find((c) => c.id === "cultivo")!.disponible).toBe(false);
  });

  it("raster de cada capa; NDVI según el mes (0 = enero)", () => {
    expect(rasterDeCapa(DEMO, "ndvi", 0)?.fecha).toBe("2026-01-22");
    expect(rasterDeCapa(DEMO, "ndvi", 6)?.campana).toBe("2025/26");
    expect(rasterDeCapa(DEMO, "pendiente", 0)?.id).toBe("pendiente");
    expect(rasterDeCapa(DEMO, "erosion", 0)?.id).toBe("erosion");
    expect(rasterDeCapa(DEMO, "satelite", 0)).toBeNull();
    expect(rasterDeCapa(DEMO, "celda", 0)).toBeNull();
  });
});

describe("imagen del NDVI por mes", () => {
  it("con raster del back, se dibuja el raster", () => {
    const d = dibujoNdvi(DEMO, 0);
    expect(d.tipo).toBe("raster");
  });

  it("sin raster y con escena HLS real, teselas de Planetary Computer con el item del back", () => {
    const sinRaster: Salida = {
      ...DEMO,
      capas: { ...DEMO.capas, ndvi_mensual: DEMO.capas.ndvi_mensual.map((m) => (m ? { ...m, mapa: null } : m)) },
    };
    const d = dibujoNdvi(sinRaster, 0);
    expect(d.tipo).toBe("hls");
    if (d.tipo === "hls") expect(d.url).toContain(encodeURIComponent(DEMO.capas.ndvi_mensual[0]!.item));
    // marzo es MODIS en la demo: sin raster va a GIBS
    expect(dibujoNdvi(sinRaster, 2).tipo).toBe("gibs");
  });

  // El mock sin rasters: no pide teselas de HLS (es_mock) y cae a GIBS
  const mockSinRaster: Salida = {
    ...MOCK,
    capas: { ...MOCK.capas, ndvi_mensual: MOCK.capas.ndvi_mensual.map((m) => (m ? { ...m, mapa: null } : m)) },
  };

  it("el mock sin raster usa GIBS con el año de la campaña del back", () => {
    const julio = dibujoNdvi(mockSinRaster, 6);
    expect(julio).toMatchObject({ tipo: "gibs", fecha: "15/07/2025" });
    if (julio.tipo === "gibs") expect(julio.url).toContain("/default/2025-07-15/");
    expect(dibujoNdvi(mockSinRaster, 0)).toMatchObject({ tipo: "gibs", fecha: "15/01/2026" });
  });

  it("mes sin escena ni dato: nada, con el motivo", () => {
    const sinNov: Salida = {
      ...mockSinRaster,
      capas: { ...mockSinRaster.capas, ndvi_mensual: mockSinRaster.capas.ndvi_mensual.map((m, i) => (i === 10 ? null : m)) },
      visto_por_satelite: {
        ...MOCK.visto_por_satelite,
        meses: MOCK.visto_por_satelite.meses.map((m, i) => (i === 10 ? null : m)),
      },
    };
    expect(dibujoNdvi(sinNov, 10)).toEqual({ tipo: "nada", motivo: "Sin imagen de NDVI para noviembre." });
  });

  it("sin campaña no se arma la fecha de GIBS", () => {
    expect(urlGibs(null, 6)).toBeNull();
  });
});

describe("celda y píxel", () => {
  it("clima_celda.bbox [oeste, sur, este, norte] pasa a [[sur, oeste], [norte, este]]", () => {
    expect(boundsCelda([-64.6875, -33.25, -64.0625, -32.75])).toEqual([
      [-33.25, -64.6875],
      [-32.75, -64.0625],
    ]);
  });

  it("límites del píxel: fila 0 al norte, columna 0 al oeste", () => {
    const [[s, o], [n, e]] = boundsPixel(ejemplo, 0, 0);
    expect(n).toBeCloseTo(-33.24);
    expect(s).toBeCloseTo(-33.245);
    expect(o).toBeCloseTo(-64.24);
    expect(e).toBeCloseTo(-64.23);
  });

  it("lectura del inspector con valor, píxel desde 1 y fuente", () => {
    const l = lecturaPixel(ejemplo, 0, 1);
    expect(l.texto).toBe("2,5 %");
    expect(l.color).toBe("#fdd835");
    expect(l.pixel).toBe("Este píxel (1 segundo de arco (~30 m)): fila 1, columna 2");
    expect(l.fuente).toBe("NASADEM, confianza alta");
    expect(lecturaPixel(ejemplo, 0, 2)).toMatchObject({ valor: null, texto: "sin dato", color: null });
  });

  it("NDVI de la demo: valor con su escena y fecha", () => {
    const capa = rasterDeCapa(DEMO, "ndvi", 0)!;
    const l = lecturaPixel(capa, 15, 20);
    expect(l.texto).toMatch(/^NDVI \d,\d+$/);
    expect(l.fuente).toContain("22/01/2026");
    expect(l.fuente).toContain("confianza alta");
  });

  it("una capa de clases se lee con la etiqueta de la clase", () => {
    const cultivo = {
      ...MOCK.capas.cultivo_mapa!,
      unidad: "clase",
      escala: { cortes: [0, 1], colores: ["#9E9E9E", "#F2C94C"], etiquetas: ["Otro uso", "Cultivo (clase 40)"] },
    };
    expect(textoValor(cultivo, 1)).toBe("Cultivo (clase 40)");
    expect(textoValor(cultivo, 0)).toBe("Otro uso");
  });

  it("el cultivo de la demo es el porcentaje del píxel, con su unidad (H-019)", () => {
    expect(textoValor(MOCK.capas.cultivo_mapa!, 93.9)).toBe("93,9 %");
  });

  it("flechas: arranca en el centro y no sale de la grilla", () => {
    expect(moverPixel(ejemplo, null, "ArrowUp")).toEqual({ fila: 1, columna: 1 });
    expect(moverPixel(ejemplo, { fila: 0, columna: 0 }, "ArrowUp")).toEqual({ fila: 0, columna: 0 });
    expect(moverPixel(ejemplo, { fila: 0, columna: 0 }, "ArrowRight")).toEqual({ fila: 0, columna: 1 });
    expect(moverPixel(ejemplo, { fila: 1, columna: 2 }, "ArrowDown")).toEqual({ fila: 1, columna: 2 });
    expect(moverPixel(ejemplo, null, "Enter")).toBeNull();
  });

  it("leyenda desde capa.escala", () => {
    expect(clasesLeyenda(DEMO.capas.pendiente_mapa!)).toEqual([
      { color: "#2E7D32", etiqueta: "< 1 %" },
      { color: "#7CB342", etiqueta: "1–2,5 %" },
      { color: "#FDD835", etiqueta: "2,5–4 %" },
      { color: "#F57C00", etiqueta: "4–6 %" },
      { color: "#C62828", etiqueta: "≥ 6 %" },
    ]);
  });

  it("números con coma decimal", () => {
    expect(numero(0.6)).toBe("0,6");
    expect(numero(0.264)).toBe("0,26");
    expect(numero(93.9)).toBe("93,9");
    expect(numero(607)).toBe("607");
  });
});

describe("ficha técnica del lote", () => {
  it("6 filas con valor, unidad, confianza y fuente (demo)", () => {
    const f = filasFicha(DEMO);
    expect(f.map((x) => x.etiqueta)).toEqual([
      "Pendiente general",
      "Pendiente máxima",
      "Cobertura agrícola",
      "Meses con NDVI bajo (< 0,3)",
      "Riesgo de erosión",
      "ET real anual, contexto regional",
    ]);
    expect(f[0]).toMatchObject({ valor: "0,6 %", confianza: DEMO.lote.pendiente_pct.confianza });
    expect(f[0].fuente).toContain("NASADEM");
    expect(f[2].valor).toBe("93,9 %");
    expect(f[3]).toMatchObject({ valor: "3 meses", confianza: "baja" });
    expect(f[3].nota).toContain("Meses: julio, septiembre y octubre.");
    expect(f[4]).toMatchObject({ valor: "2,6 % × meses", confianza: "baja" });
    expect(f[5]).toMatchObject({ valor: "607 mm/año", confianza: "media" });
    expect(f[5].fuente).toContain("500 m");
  });

  it("lo que falta dice sin dato, nunca cero (respuesta sin erosión)", () => {
    // El mock ya trae la erosión de la demo: se le saca para probar el caso sin dato.
    const { riesgo_erosion: _sinErosion, ...indicadores } = MOCK.indicadores;
    const s: Salida = { ...MOCK, indicadores, capas: { ...MOCK.capas, erosion: null, erosion_mapa: null } };
    const erosion = filasFicha(s)[4];
    expect(erosion).toMatchObject({ valor: "sin dato", confianza: "sin_dato" });
    expect(erosion.nota).toBe("Esta respuesta no trae el índice de erosión.");
  });

  it("indicador con valor null queda sin dato con su motivo", () => {
    const s: Salida = {
      ...MOCK,
      indicadores: { ...MOCK.indicadores, et_real_anual: { ...MOCK.indicadores.et_real_anual, valor: null, motivo: "MODIS no respondió" } },
    };
    expect(filasFicha(s)[5]).toMatchObject({ valor: "sin dato", confianza: "sin_dato", nota: "MODIS no respondió" });
  });

  it("meses bajos en orden de campaña", () => {
    expect(mesesBajos(DEMO)).toBe("julio, septiembre y octubre");
  });
});
