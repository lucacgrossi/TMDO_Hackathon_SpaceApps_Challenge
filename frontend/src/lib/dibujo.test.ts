import { beforeEach, describe, expect, it } from "vitest";
import { LOTE_DEMO, ENTRADAS_INICIALES, type LatLng } from "@/lib/entradas";
import { evaluar, textosBarra, useDibujo } from "@/lib/dibujo";
import { useMapa } from "@/lib/mapa";
import { useEntradas } from "@/lib/store";

// Un cuadrado de ~1 km de lado (≈ 100 ha) cerca del lote de ejemplo.
const CUADRADO: LatLng[] = [
  [-33.24, -64.24],
  [-33.24, -64.229],
  [-33.249, -64.229],
  [-33.249, -64.24],
];

describe("dibujo · reglas y textos de la barra", () => {
  it("con menos de 3 puntos pide marcar esquinas", () => {
    expect(textosBarra([]).titulo).toBe("Marcá las esquinas del lote: 0 esquinas");
    expect(textosBarra([CUADRADO[0]]).titulo).toBe("Marcá las esquinas del lote: 1 esquina");
    expect(evaluar(CUADRADO.slice(0, 2)).valido).toBe(false);
  });

  it("un cuadrado de ~100 ha es válido y muestra la superficie", () => {
    const t = textosBarra(CUADRADO);
    expect(evaluar(CUADRADO).valido).toBe(true);
    expect(t.titulo).toMatch(/^Lote de \d+ ha, 4 esquinas$/);
    expect(t.error).toBe(false);
  });

  it("un moño se marca como error", () => {
    const mono: LatLng[] = [CUADRADO[0], CUADRADO[2], CUADRADO[1], CUADRADO[3]];
    const t = textosBarra(mono);
    expect(t.titulo).toBe("4 esquinas");
    expect(t.ayuda).toContain("se cruzan");
    expect(t.error).toBe(true);
  });

  it("menos de 1 ha es muy chico", () => {
    const chico: LatLng[] = [
      [-33.24, -64.24],
      [-33.24, -64.2399],
      [-33.2401, -64.2399],
    ];
    expect(textosBarra(chico).ayuda).toBe("Muy chico: el mínimo es 1 ha.");
  });
});

describe("dibujo · store", () => {
  beforeEach(() => {
    useEntradas.setState({ ...ENTRADAS_INICIALES, poligono: LOTE_DEMO.map((p) => [...p] as LatLng) });
    useDibujo.setState({ dibujando: false, puntos: [], arrastrando: false });
  });

  it("marcar, deshacer y terminar guarda el polígono en las entradas", () => {
    const d = useDibujo.getState();
    d.iniciar(null);
    expect(useEntradas.getState().modoLote).toBe("dibujo");
    CUADRADO.forEach((p) => useDibujo.getState().agregar(p));
    useDibujo.getState().deshacer();
    expect(useDibujo.getState().puntos).toHaveLength(3);
    useDibujo.getState().agregar(CUADRADO[3]);
    expect(useDibujo.getState().terminar()).toBe(true);
    expect(useEntradas.getState().poligono).toEqual(CUADRADO);
    expect(useDibujo.getState().dibujando).toBe(false);
    expect(useMapa.getState().loteVisible).toBe(true);
  });

  it("no termina con un lote inválido", () => {
    useDibujo.getState().iniciar(CUADRADO.slice(0, 2));
    expect(useDibujo.getState().terminar()).toBe(false);
    expect(useDibujo.getState().dibujando).toBe(true);
  });

  it("cada cierre válido suma uno a `cierres` (lo escucha la pantalla de marcar); cancelar no", () => {
    const antes = useDibujo.getState().cierres;
    useDibujo.getState().iniciar(CUADRADO);
    useDibujo.getState().cancelar();
    expect(useDibujo.getState().cierres).toBe(antes);
    useDibujo.getState().iniciar(CUADRADO);
    useDibujo.getState().terminar();
    expect(useDibujo.getState().cierres).toBe(antes + 1);
  });

  it("cancelar con el lote de ejemplo vuelve al modo ejemplo", () => {
    useDibujo.getState().iniciar(null);
    useDibujo.getState().agregar(CUADRADO[0]);
    useDibujo.getState().cancelar();
    expect(useEntradas.getState().modoLote).toBe("demo");
    expect(useEntradas.getState().poligono).toEqual(LOTE_DEMO);
  });
});
