import { describe, expect, it } from "vitest";
import { salidaDe } from "@/lib/salidaDashboard";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";

describe("salida del dashboard", () => {
  it("null mientras carga o con error", () => {
    expect(salidaDe({ estado: "cargando" })).toBeNull();
    expect(salidaDe({ estado: "error", mensaje: "NASA POWER no responde", reintentable: true })).toBeNull();
  });

  it("con un resultado listo, la respuesta tal cual (también el mock)", () => {
    expect(salidaDe({ estado: "listo", datos: RIO_CUARTO })).toBe(RIO_CUARTO);
  });
});
