import { beforeEach, describe, expect, it } from "vitest";
import { ESTADO_INICIAL, transicion, useApp, type ErrorAnalisis, type EstadoApp } from "@/lib/app";

const ERROR_503: ErrorAnalisis = { mensaje: "NASA POWER no respondió.", estado: 503, reintentable: true };
const en = (parcial: Partial<EstadoApp>): EstadoApp => ({ ...ESTADO_INICIAL, ...parcial });

describe("transicion", () => {
  it("arranca marcando el lote, en la sección Mapa y sin error", () => {
    expect(ESTADO_INICIAL).toEqual({ etapa: "marcar", seccion: "mapa", error: null, hayResultado: false });
  });

  it("marcar → configurar al cerrar el polígono o elegir el ejemplo, y vuelta", () => {
    const configurar = transicion(ESTADO_INICIAL, { tipo: "loteListo" });
    expect(configurar.etapa).toBe("configurar");
    expect(transicion(configurar, { tipo: "volverAMarcar" }).etapa).toBe("marcar");
  });

  it("configurar → cargando al analizar, y borra el error anterior", () => {
    const e = transicion(en({ etapa: "configurar", error: ERROR_503 }), { tipo: "analizar" });
    expect(e).toMatchObject({ etapa: "cargando", error: null });
  });

  it("cargando → dashboard en la sección Mapa con la respuesta OK", () => {
    const e = transicion(en({ etapa: "cargando", seccion: "rotaciones" }), { tipo: "analisisListo" });
    expect(e).toMatchObject({ etapa: "dashboard", seccion: "mapa", hayResultado: true });
  });

  it("cargando → configurar con el error si /analizar falla", () => {
    const e = transicion(en({ etapa: "cargando" }), { tipo: "analisisFallo", error: ERROR_503 });
    expect(e).toMatchObject({ etapa: "configurar", error: ERROR_503 });
  });

  it("un fallo reemplaza al resultado anterior: ya no se ofrece volver a él", () => {
    const e = transicion(en({ etapa: "cargando", hayResultado: true }), { tipo: "analisisFallo", error: ERROR_503 });
    expect(e.hayResultado).toBe(false);
    // y "Volver al análisis anterior" (irA desde el panel) no abre un dashboard vacío
    expect(transicion(e, { tipo: "irA", seccion: "mapa" }).etapa).toBe("configurar");
  });

  it("'Editar lote y entradas' vuelve a configurar sin perder el resultado", () => {
    const e = transicion(en({ etapa: "dashboard", seccion: "clima", hayResultado: true }), { tipo: "volverAEditar" });
    expect(e).toMatchObject({ etapa: "configurar", hayResultado: true });
  });

  it("irA cambia de sección dentro del dashboard", () => {
    const e = transicion(en({ etapa: "dashboard", hayResultado: true }), { tipo: "irA", seccion: "rotaciones" });
    expect(e).toMatchObject({ etapa: "dashboard", seccion: "rotaciones" });
  });

  it("irA desde el panel vuelve al dashboard solo si ya hubo un análisis", () => {
    expect(transicion(en({ etapa: "configurar" }), { tipo: "irA", seccion: "clima" }).etapa).toBe("configurar");
    const e = transicion(en({ etapa: "configurar", hayResultado: true }), { tipo: "irA", seccion: "clima" });
    expect(e).toMatchObject({ etapa: "dashboard", seccion: "clima" });
  });

  it("los eventos fuera de su etapa no cambian nada (mismo objeto)", () => {
    const marcar = ESTADO_INICIAL;
    expect(transicion(marcar, { tipo: "analizar" })).toBe(marcar);
    expect(transicion(marcar, { tipo: "analisisListo" })).toBe(marcar);
    expect(transicion(marcar, { tipo: "irA", seccion: "clima" })).toBe(marcar);
    const dashboard = en({ etapa: "dashboard", hayResultado: true });
    expect(transicion(dashboard, { tipo: "analizar" })).toBe(dashboard);
    expect(transicion(dashboard, { tipo: "loteListo" })).toBe(dashboard);
    expect(transicion(dashboard, { tipo: "irA", seccion: "mapa" })).toBe(dashboard);
    const cargando = en({ etapa: "cargando" });
    expect(transicion(cargando, { tipo: "volverAEditar" })).toBe(cargando);
    expect(transicion(cargando, { tipo: "volverAMarcar" })).toBe(cargando);
  });

  it("cerrarError borra el error y no toca la etapa", () => {
    expect(transicion(en({ etapa: "configurar", error: ERROR_503 }), { tipo: "cerrarError" })).toMatchObject({
      etapa: "configurar",
      error: null,
    });
  });
});

describe("useApp", () => {
  beforeEach(() => useApp.setState(ESTADO_INICIAL));

  it("recorre el flujo completo con las acciones", () => {
    const a = useApp.getState();
    a.loteListo();
    a.analizar();
    expect(useApp.getState().etapa).toBe("cargando");
    a.analisisListo();
    a.irA("rotaciones");
    expect(useApp.getState()).toMatchObject({ etapa: "dashboard", seccion: "rotaciones" });
    a.volverAEditar();
    a.analizar();
    a.analisisFallo(ERROR_503);
    expect(useApp.getState()).toMatchObject({ etapa: "configurar", error: ERROR_503, hayResultado: false });
  });
});
