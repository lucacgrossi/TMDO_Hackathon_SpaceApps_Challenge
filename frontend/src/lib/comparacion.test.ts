import { beforeEach, describe, expect, it } from "vitest";
import { cambiosDesdeLaComparacion, fotoDe, listaDeCambios, useComparacion } from "@/lib/comparacion";
import { ENTRADAS_INICIALES, type Entradas } from "@/lib/entradas";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";

const base: Entradas = structuredClone(ENTRADAS_INICIALES);
const con = (parcial: Partial<Entradas>): Entradas => ({ ...structuredClone(base), ...parcial });

describe("cambiosDesdeLaComparacion", () => {
  it("sin cambios: vacío", () => {
    expect(cambiosDesdeLaComparacion(base, structuredClone(base))).toEqual([]);
  });

  it("los objetivos no cuentan: mover las barras recalcula la cercanía sin pedir datos (RF13)", () => {
    expect(cambiosDesdeLaComparacion(base, con({ objetivos: { agua: 5, suelo: 0, erosion: 1, ingreso: 4 } }))).toEqual([]);
  });

  it("el paso y la ubicación del buscador no cuentan", () => {
    expect(cambiosDesdeLaComparacion(base, con({ paso: "inicio", ubicacion: { lat: -33, lng: -64, etiqueta: "x" } }))).toEqual([]);
  });

  it("lote: cambia el modo o un vértice del polígono", () => {
    expect(cambiosDesdeLaComparacion(base, con({ modoLote: "dibujo" }))).toEqual(["lote"]);
    const poligono = base.poligono.map((p) => [...p] as [number, number]);
    poligono[2][0] += 0.001;
    expect(cambiosDesdeLaComparacion(base, con({ poligono }))).toEqual(["lote"]);
    expect(cambiosDesdeLaComparacion(base, con({ poligono: poligono.slice(0, 3) }))).toEqual(["lote"]);
  });

  it("el mismo polígono en un array nuevo no es un cambio", () => {
    expect(cambiosDesdeLaComparacion(base, con({ poligono: base.poligono.map((p) => [p[0], p[1]]) }))).toEqual([]);
  });

  it("rotación: verano, invierno o campaña pasada", () => {
    expect(cambiosDesdeLaComparacion(base, con({ verano: "maiz" }))).toEqual(["rotacion"]);
    expect(cambiosDesdeLaComparacion(base, con({ invierno: "trigo" }))).toEqual(["rotacion"]);
    expect(cambiosDesdeLaComparacion(base, con({ pasada: "maiz" }))).toEqual(["rotacion"]);
  });

  it("restricciones: las de la lista o No sembrar", () => {
    expect(
      cambiosDesdeLaComparacion(base, con({ restricciones: { ...base.restricciones, sinHacienda: true } })),
    ).toEqual(["restricciones"]);
    expect(cambiosDesdeLaComparacion(base, con({ noSembrar: ["trigo"] }))).toEqual(["restricciones"]);
  });

  it("No sembrar es un conjunto: el orden no importa", () => {
    const foto = con({ noSembrar: ["trigo", "cebada"] });
    expect(cambiosDesdeLaComparacion(foto, con({ noSembrar: ["cebada", "trigo"] }))).toEqual([]);
  });

  it("datos del lote: anegable o textura", () => {
    expect(cambiosDesdeLaComparacion(base, con({ anegable: "si" }))).toEqual(["datosLote"]);
    expect(cambiosDesdeLaComparacion(base, con({ textura: "arenoso" }))).toEqual(["datosLote"]);
  });

  it("mediciones: pluviómetro o materia orgánica, también al borrarlas", () => {
    expect(cambiosDesdeLaComparacion(base, con({ mediciones: { ...base.mediciones, lluviaAnualMm: 650, materiaOrganicaPct: null } }))).toEqual([
      "mediciones",
    ]);
    const foto = con({ mediciones: { ...base.mediciones, lluviaAnualMm: null, materiaOrganicaPct: 2.4 } });
    expect(cambiosDesdeLaComparacion(foto, base)).toEqual(["mediciones"]);
  });

  it("mediciones: compara todas las claves, también campos que no están en el tipo (años de registro, serie)", () => {
    // Sin depender de entradas.ts: un campo extra como el que suma el PR #18
    const med = (extra: object) =>
      ({ lluviaAnualMm: 650, materiaOrganicaPct: null, ...extra }) as unknown as Entradas["mediciones"];
    const foto = con({ mediciones: med({ aniosRegistro: 10 }) });
    expect(cambiosDesdeLaComparacion(foto, con({ mediciones: med({ aniosRegistro: 10 }) }))).toEqual([]);
    expect(cambiosDesdeLaComparacion(foto, con({ mediciones: med({ aniosRegistro: 4 }) }))).toEqual(["mediciones"]);
    // Una clave que está solo de un lado también es un cambio
    expect(cambiosDesdeLaComparacion(foto, con({ mediciones: med({}) }))).toEqual(["mediciones"]);
    // Arrays: se comparan por contenido, no por referencia
    const conSerie = con({ mediciones: med({ serieMensual: [10, 20, 30] }) });
    expect(cambiosDesdeLaComparacion(conSerie, con({ mediciones: med({ serieMensual: [10, 20, 30] }) }))).toEqual([]);
    expect(cambiosDesdeLaComparacion(conSerie, con({ mediciones: med({ serieMensual: [10, 25, 30] }) }))).toEqual([
      "mediciones",
    ]);
  });

  it("varios cambios, siempre en el mismo orden", () => {
    const actuales = con({ mediciones: { ...base.mediciones, lluviaAnualMm: 650, materiaOrganicaPct: null }, verano: "maiz", modoLote: "dibujo" });
    expect(cambiosDesdeLaComparacion(base, actuales)).toEqual(["lote", "rotacion", "mediciones"]);
  });
});

describe("listaDeCambios", () => {
  it("une con comas y una y final", () => {
    expect(listaDeCambios(["mediciones"])).toBe("tus mediciones");
    expect(listaDeCambios(["lote", "rotacion"])).toBe("el lote y la rotación");
    expect(listaDeCambios(["lote", "restricciones", "mediciones"])).toBe("el lote, las restricciones y tus mediciones");
  });
});

describe("useComparacion · foto de las entradas", () => {
  beforeEach(() => {
    useEntradas.getState().reiniciar();
    useVista.setState({ hojaAbierta: false });
    useComparacion.setState({ foto: null });
  });

  it("la foto tiene solo datos, sin las acciones del store", () => {
    const foto = fotoDe(useEntradas.getState());
    expect(Object.keys(foto).sort()).toEqual(Object.keys(ENTRADAS_INICIALES).sort());
  });

  it("abrir la hoja (Comparar) saca la foto; con la hoja abierta, los cambios no la tocan", () => {
    useEntradas.getState().cambiar({ noSembrar: ["trigo", "cebada"] });
    useVista.getState().abrirHoja();
    expect(useComparacion.getState().foto?.noSembrar).toEqual(["trigo", "cebada"]);

    useEntradas.getState().cambiar({ noSembrar: [] });
    expect(useComparacion.getState().foto?.noSembrar).toEqual(["trigo", "cebada"]);
  });

  it("volver a comparar saca una foto nueva", () => {
    useVista.getState().abrirHoja();
    useEntradas.getState().cambiar({ mediciones: { ...base.mediciones, lluviaAnualMm: 620, materiaOrganicaPct: null } });
    useComparacion.getState().volverAComparar();
    expect(useComparacion.getState().foto?.mediciones.lluviaAnualMm).toBe(620);
  });

  it("cerrar y abrir de nuevo también es comparar", () => {
    useVista.getState().abrirHoja();
    useVista.getState().cerrarHoja();
    useEntradas.getState().cambiar({ verano: "maiz" });
    useVista.getState().abrirHoja();
    expect(useComparacion.getState().foto?.verano).toBe("maiz");
  });
});
