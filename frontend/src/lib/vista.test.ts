import { beforeEach, describe, expect, it } from "vitest";
import { MES_INICIAL, useVista } from "@/lib/vista";

describe("useVista · mes del mapa", () => {
  beforeEach(() => useVista.setState({ mes: MES_INICIAL }));

  it("arranca en julio, como el prototipo", () => {
    expect(useVista.getState().mes).toBe(6);
  });

  it("después de diciembre vuelve a enero (botón ▶)", () => {
    useVista.getState().cambiarMes(12);
    expect(useVista.getState().mes).toBe(0);
  });

  it("antes de enero va a diciembre", () => {
    useVista.getState().cambiarMes(-1);
    expect(useVista.getState().mes).toBe(11);
  });
});
