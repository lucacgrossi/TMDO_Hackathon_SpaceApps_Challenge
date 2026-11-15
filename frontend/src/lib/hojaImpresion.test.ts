import { describe, expect, it } from "vitest";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";
import type { Salida } from "./contrato";
import { SIN_DATO } from "./dashboard";
import {
  fechaGeneracion,
  fichaImpresion,
  fuentesDelAnalisis,
  partesFuente,
  textoNoSembrar,
  textoPrioridades,
  textoRestricciones,
  type RestriccionesHoja,
} from "./hojaImpresion";

const pesos = { agua: 3, suelo: 4, erosion: 3, ingreso: 2 };
const sinRestricciones: RestriccionesHoja = {
  restricciones: { sinRiego: false, sinHacienda: false, maquinariaLimitada: false },
  noSembrar: [],
};

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

describe("textoRestricciones y textoNoSembrar", () => {
  it("listan lo marcado o dicen que no hay", () => {
    expect(textoRestricciones(sinRestricciones.restricciones)).toBe("Ninguna");
    expect(textoRestricciones({ sinRiego: true, sinHacienda: false, maquinariaLimitada: true })).toBe(
      "Sin riego, maquinaria limitada",
    );
    expect(textoNoSembrar([])).toBe("Ninguno");
    expect(textoNoSembrar(["vicia", "sorgo"])).toBe("Vicia, Sorgo");
  });
});

describe("fichaImpresion", () => {
  it("suma lote, centro, prioridades y restricciones a la ficha del encabezado", () => {
    const ficha = fichaImpresion(RIO_CUARTO, [-33.2477, -64.2325], pesos, {
      restricciones: { sinRiego: true, sinHacienda: false, maquinariaLimitada: false },
      noSembrar: ["centeno"],
    });
    expect(ficha.map((p) => p.etiqueta)).toEqual([
      "Lote",
      "Superficie",
      "Campaña satelital",
      "Clima",
      "Tus mediciones",
      "Centro",
      "Prioridades (1 a 5)",
      "Restricciones",
      "No sembrar",
    ]);
    expect(ficha.find((p) => p.etiqueta === "Centro")?.valor).toBe("33,2477° S, 64,2325° O");
    expect(ficha.find((p) => p.etiqueta === "Restricciones")?.valor).toBe("Sin riego");
    expect(ficha.find((p) => p.etiqueta === "No sembrar")?.valor).toBe("Centeno");
  });

  it("sin centro ni localidad dice 'sin dato'", () => {
    const s: Salida = { ...RIO_CUARTO, lote: { ...RIO_CUARTO.lote, localidad_aprox: null } };
    const ficha = fichaImpresion(s, null, pesos, null);
    expect(ficha.find((p) => p.etiqueta === "Lote")?.valor).toBe(SIN_DATO);
    expect(ficha.find((p) => p.etiqueta === "Restricciones")?.valor).toBe(SIN_DATO);
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

  it("une dos textos de la misma fuente y deja el más completo", () => {
    const corto = "NASA HLS 30 m + MODIS 250 m (respaldo en 1 de 12 meses)";
    const largo = "NASA HLS 30 m (Landsat + Sentinel-2) y MODIS MOD13Q1 250 m de respaldo en 1 mes, vía Planetary Computer";
    const s: Salida = {
      ...RIO_CUARTO,
      visto_por_satelite: { ...RIO_CUARTO.visto_por_satelite, fuente: corto },
      indicadores: { ndvi: { ...Object.values(RIO_CUARTO.indicadores)[0], fuente: largo, resolucion: "30 m", anios: "2024/25" } },
    };
    const hls = fuentesDelAnalisis(s).filter((x) => x.startsWith("NASA HLS 30 m"));
    expect(hls).toEqual([`${largo} (30 m, 2024/25)`]);
  });
});

describe("fuentes del lote y compuestas (H-021)", () => {
  it("separa una fuente compuesta y le saca la etiqueta", () => {
    expect(partesFuente("Pendiente: NASADEM · NASA, vía PC · Cobertura: NASA HLS 30 m (Landsat + Sentinel-2)")).toEqual([
      "NASADEM · NASA, vía PC",
      "NASA HLS 30 m (Landsat + Sentinel-2)",
    ]);
    expect(partesFuente("NASADEM · NASA, vía PC")).toEqual(["NASADEM · NASA, vía PC"]);
  });

  it("incluye NASADEM y ESA WorldCover del lote", () => {
    const f = fuentesDelAnalisis(RIO_CUARTO);
    expect(f.some((x) => x.startsWith("NASADEM"))).toBe(true);
    expect(f.some((x) => x.startsWith("ESA WorldCover"))).toBe(true);
    expect(f.filter((x) => x.startsWith("NASADEM"))).toHaveLength(1);
    expect(f.some((x) => x.startsWith("Pendiente:"))).toBe(false);
  });
});
