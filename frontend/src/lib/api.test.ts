import { describe, expect, it } from "vitest";
import { esErrorDeEsquema, esReintentable, MENSAJE_TIEMPO_AGOTADO, mensajeDeError, mensajeSinRespuesta } from "@/lib/api";
import { camp0De, CAMP0 } from "@/lib/ndvi";

describe("mensajeDeError", () => {
  it("{mensaje} del back se muestra tal cual (422 lote, 503 NASA, 500, 413)", () => {
    expect(mensajeDeError(503, { mensaje: "NASA POWER no respondió. Probá de nuevo en un rato." })).toBe(
      "NASA POWER no respondió. Probá de nuevo en un rato.",
    );
    expect(mensajeDeError(413, { mensaje: "La planilla supera 1 MB" })).toBe("La planilla supera 1 MB");
  });

  it("422 de FastAPI ({detail}) se presenta como error de la app, con el campo", () => {
    const m = mensajeDeError(422, {
      detail: [{ loc: ["body", "prioridades", "agua"], msg: "Input should be greater than or equal to 1", type: "x" }],
    });
    expect(m).toContain("error de la app");
    expect(m).toContain("prioridades.agua");
  });

  it("sin cuerpo legible no muestra el código HTTP", () => {
    expect(mensajeDeError(502, null)).toBe("El servidor de AgroPixel respondió con un error inesperado.");
    expect(mensajeDeError(502, null)).not.toContain("502");
  });

  it("vale reintentar si NASA no respondió o el server falló; no si el lote es inválido", () => {
    expect(esReintentable(503)).toBe(true);
    expect(esReintentable(500)).toBe(true);
    expect(esReintentable(422)).toBe(false);
  });
});

describe("sin respuesta del servidor", () => {
  it("con internet, dice que no responde el servidor de AgroPixel (no manda a revisar internet)", () => {
    const m = mensajeSinRespuesta(false);
    expect(m).toContain("servidor de AgroPixel");
    expect(m).not.toMatch(/internet/i);
  });

  it("con el navegador sin conexión, dice que es internet", () => {
    expect(mensajeSinRespuesta(true)).toMatch(/sin conexión a internet/);
  });

  it("tiempo agotado: habla del servidor de AgroPixel, con los segundos", () => {
    expect(MENSAJE_TIEMPO_AGOTADO).toBe("El servidor de AgroPixel no terminó de responder en 45 s.");
  });
});

describe("esErrorDeEsquema", () => {
  it("{detail} sin {mensaje} es un pedido que no cumple el esquema (error de la app)", () => {
    expect(esErrorDeEsquema({ detail: [{ loc: ["body", "lat"], msg: "x", type: "y" }] })).toBe(true);
  });

  it("{mensaje} del back (lote no agrícola) o un cuerpo ilegible, no", () => {
    expect(esErrorDeEsquema({ mensaje: "El polígono no parece un lote agrícola." })).toBe(false);
    expect(esErrorDeEsquema(null)).toBe(false);
    expect(esErrorDeEsquema("texto")).toBe(false);
  });
});

describe("camp0De", () => {
  it("toma el primer año de la campaña de la API", () => {
    expect(camp0De("2025/26")).toBe(2025);
  });

  it("sin campaña usa la estimada", () => {
    expect(camp0De(null)).toBe(CAMP0);
    expect(camp0De("raro")).toBe(CAMP0);
  });
});
