import { describe, expect, it } from "vitest";
import { CIUDAD_REFERENCIA, LOTE_DEMO, type LatLng } from "@/lib/entradas";
import { areaHa, centro, dentroDelPoligono, distanciaKm, moverPoligono, seCruza } from "@/lib/geo";

describe("geo · cuentas sobre el lote", () => {
  it("el lote de ejemplo mide unas 95 ha (lo que dice el prototipo)", () => {
    expect(Math.round(areaHa(LOTE_DEMO))).toBe(95);
  });

  it("el centro del lote de ejemplo es el punto de la demo", () => {
    const [lat, lng] = centro(LOTE_DEMO);
    expect(lat).toBeCloseTo(-33.2477, 3);
    expect(lng).toBeCloseTo(-64.2325, 3);
  });

  it("el lote de ejemplo queda a 17 km de Río Cuarto", () => {
    expect(Math.round(distanciaKm(centro(LOTE_DEMO), CIUDAD_REFERENCIA.punto))).toBe(17);
  });

  it("mover el lote no cambia su forma ni su superficie", () => {
    const movido = moverPoligono(LOTE_DEMO, [-33.3, -64.1]);
    const [lat, lng] = centro(movido);
    expect(lat).toBeCloseTo(-33.3, 6);
    expect(lng).toBeCloseTo(-64.1, 6);
    expect(areaHa(movido)).toBeCloseTo(areaHa(LOTE_DEMO), 0);
  });

  it("detecta un punto adentro y uno afuera", () => {
    expect(dentroDelPoligono(-33.2477, -64.2325, LOTE_DEMO)).toBe(true);
    expect(dentroDelPoligono(-33.2, -64.2325, LOTE_DEMO)).toBe(false);
  });

  it("un moño (lados cruzados) se rechaza; el rectángulo no", () => {
    const mono: LatLng[] = [LOTE_DEMO[0], LOTE_DEMO[2], LOTE_DEMO[1], LOTE_DEMO[3]];
    expect(seCruza(mono, true)).toBe(true);
    expect(seCruza(LOTE_DEMO, true)).toBe(false);
  });
});
