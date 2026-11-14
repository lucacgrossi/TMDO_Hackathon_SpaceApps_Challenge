/**
 * Pruebas chicas del parseo de coordenadas del buscador (F4).
 * Se corren con vitest, el corredor del front:  npm test   (desde frontend/)
 */
import { describe, expect, it } from "vitest";
import { limpiarTexto, parsearCoordenadas } from "./buscador";

/** Compara con 4 decimales (≈ 10 m): más precisión no cambia nada para un lote. */
function cerca(texto: string, lat: number, lng: number) {
  const p = parsearCoordenadas(texto);
  expect(p, `no reconoció: ${texto}`).not.toBeNull();
  expect(p!.lat.toFixed(4), `lat de ${texto}`).toBe(lat.toFixed(4));
  expect(p!.lng.toFixed(4), `lng de ${texto}`).toBe(lng.toFixed(4));
}

describe("parsearCoordenadas", () => {
  it("lat, lng suelto con signo", () => cerca("-33.2477, -64.2325", -33.2477, -64.2325));

  it("separado por espacio o punto y coma", () => {
    cerca("-33.2477 -64.2325", -33.2477, -64.2325);
    cerca("-33.2477;-64.2325", -33.2477, -64.2325);
  });

  it("sin signo en Argentina va al sur y oeste", () =>
    cerca("33.2477, 64.2325", -33.2477, -64.2325));

  it("link de Google Maps con @", () =>
    cerca("https://www.google.com/maps/@-33.2477,-64.2325,15z", -33.2477, -64.2325));

  it("link con ?q= y coma codificada", () => {
    cerca("https://maps.google.com/?q=-33.2477,-64.2325", -33.2477, -64.2325);
    cerca(
      "https://www.google.com/maps/search/?api=1&query=-33.2477%2C-64.2325",
      -33.2477,
      -64.2325,
    );
  });

  it("link con ll= (Apple Maps)", () =>
    cerca("https://maps.apple.com/?ll=-33.2477,-64.2325", -33.2477, -64.2325));

  it("grados, minutos y segundos (W y O)", () => {
    cerca(`33°14'51.7"S 64°13'57.0"W`, -33.247694, -64.2325);
    cerca("33º14’51,7”S 64º13’57”O", -33.247694, -64.2325);
  });

  it("fuera de rango o texto común no es coordenada", () => {
    expect(parsearCoordenadas("Río Cuarto")).toBeNull();
    expect(parsearCoordenadas("Ruta 8 km 600")).toBeNull();
    expect(parsearCoordenadas("95.5, 200.1")).toBeNull();
  });

  it("etiqueta con coma decimal y S/O", () => {
    expect(parsearCoordenadas("-33.2477, -64.2325")?.etiqueta).toBe("33,2477° S · 64,2325° O");
  });
});

describe("limpiarTexto", () => {
  it("saca ', ARG'", () =>
    expect(limpiarTexto("Río Cuarto, Córdoba, ARG")).toBe("Río Cuarto, Córdoba"));
});
