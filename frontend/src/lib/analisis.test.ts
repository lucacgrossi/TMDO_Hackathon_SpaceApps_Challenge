import { beforeEach, describe, expect, it } from "vitest";
import {
  analizarLote,
  errorDeResultado,
  eventoDeResultado,
  lugarDelLote,
  MENSAJE_PEDIDO_INVALIDO,
} from "@/lib/analisis";
import { ESTADO_INICIAL, useApp } from "@/lib/app";
import { useResultadoStore } from "@/lib/resultado";
import { RIO_CUARTO } from "@/mocks/rio-cuarto";

describe("eventoDeResultado", () => {
  it("listo → analisisListo; cargando → nada", () => {
    expect(eventoDeResultado({ estado: "listo", datos: RIO_CUARTO })).toEqual({ tipo: "analisisListo" });
    expect(eventoDeResultado({ estado: "cargando" })).toBeNull();
  });

  it("422 con {mensaje}: el mensaje del back tal cual, no reintentable", () => {
    const mensaje = "El polígono no parece un lote agrícola (ESA WorldCover).";
    expect(eventoDeResultado({ estado: "error", mensaje, reintentable: false, codigo: 422 })).toEqual({
      tipo: "analisisFallo",
      error: { mensaje, estado: 422, reintentable: false },
    });
  });

  it("503: reintentable, con su código", () => {
    const r = { estado: "error", mensaje: "NASA POWER no respondió.", reintentable: true, codigo: 503 } as const;
    expect(errorDeResultado(r)).toEqual({ mensaje: "NASA POWER no respondió.", estado: 503, reintentable: true });
  });

  it("tiempo agotado o sin conexión: sin código y reintentable", () => {
    const r = { estado: "error", mensaje: "No se pudo conectar con el servidor.", reintentable: true, codigo: null } as const;
    expect(errorDeResultado(r)).toEqual({ mensaje: r.mensaje, estado: null, reintentable: true });
    // Un resultado viejo sin código también cuenta como "sin respuesta"
    expect(errorDeResultado({ estado: "error", mensaje: "x", reintentable: true }).estado).toBeNull();
  });

  it("422 con {detail}: error de la app, con el texto fijo y no reintentable", () => {
    const r = { estado: "error", mensaje: "prioridades.agua: …", reintentable: false, codigo: 422, deLaApp: true } as const;
    expect(errorDeResultado(r)).toEqual({
      mensaje: MENSAJE_PEDIDO_INVALIDO,
      estado: 422,
      reintentable: false,
      deLaApp: true,
    });
  });
});

describe("lugarDelLote", () => {
  it("usa el lugar buscado; sin lugar o con el GPS, null", () => {
    const ubicacion = { lat: -31.4, lng: -64.2, etiqueta: "Alcira Gigena, Córdoba" };
    expect(lugarDelLote({ ubicacion })).toBe("cerca de Alcira Gigena, Córdoba");
    expect(lugarDelLote({ ubicacion: null })).toBeNull();
    const gps = { lat: -31.4, lng: -64.2, etiqueta: "tu ubicación actual", precisionM: 20 };
    expect(lugarDelLote({ ubicacion: gps })).toBeNull();
  });
});

describe("analizarLote (con el mock)", () => {
  beforeEach(() => useApp.setState({ ...ESTADO_INICIAL, etapa: "configurar" }));

  it("desde configurar pide el análisis y, con el resultado listo, abre el dashboard", () => {
    analizarLote();
    expect(useResultadoStore.getState().resultado.estado).toBe("listo");
    expect(useApp.getState().etapa).toBe("dashboard");
    expect(useApp.getState().seccion).toBe("mapa");
  });

  it("fuera de configurar no hace nada", () => {
    useApp.setState({ ...ESTADO_INICIAL, etapa: "marcar" });
    analizarLote();
    expect(useApp.getState().etapa).toBe("marcar");
  });

  it("un error que llega en cargando vuelve al panel con el error", () => {
    useApp.setState({ ...ESTADO_INICIAL, etapa: "cargando" });
    useResultadoStore.setState({ resultado: { estado: "error", mensaje: "NASA POWER no respondió.", reintentable: true, codigo: 503 } });
    expect(useApp.getState().etapa).toBe("configurar");
    expect(useApp.getState().error).toEqual({ mensaje: "NASA POWER no respondió.", estado: 503, reintentable: true });
  });

  it("una respuesta que llega cuando la etapa ya no es cargando se ignora", () => {
    useResultadoStore.setState({ resultado: { estado: "error", mensaje: "tarde", reintentable: true, codigo: 503 } });
    expect(useApp.getState().etapa).toBe("configurar");
    expect(useApp.getState().error).toBeNull();
  });
});
