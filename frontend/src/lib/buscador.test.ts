/**
 * Pruebas chicas del parseo de coordenadas del buscador (F4).
 * Se corren con:  npx tsx src/lib/buscador.test.ts   (desde frontend/)
 * Sin framework de tests a propósito: assert de Node alcanza y no suma dependencias.
 */
import assert from "node:assert/strict";
import { limpiarTexto, parsearCoordenadas } from "./buscador";

let ok = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  ok++;
  console.log(`ok  ${nombre}`);
}

/** Compara con 4 decimales (≈ 10 m): más precisión no cambia nada para un lote. */
function cerca(texto: string, lat: number, lng: number) {
  const p = parsearCoordenadas(texto);
  assert.ok(p, `no reconoció: ${texto}`);
  assert.equal(p.lat.toFixed(4), lat.toFixed(4), `lat de ${texto}`);
  assert.equal(p.lng.toFixed(4), lng.toFixed(4), `lng de ${texto}`);
}

prueba("lat, lng suelto con signo", () => cerca("-33.2477, -64.2325", -33.2477, -64.2325));
prueba("separado por espacio o punto y coma", () => {
  cerca("-33.2477 -64.2325", -33.2477, -64.2325);
  cerca("-33.2477;-64.2325", -33.2477, -64.2325);
});
prueba("sin signo en Argentina va al sur y oeste", () =>
  cerca("33.2477, 64.2325", -33.2477, -64.2325),
);
prueba("link de Google Maps con @", () =>
  cerca("https://www.google.com/maps/@-33.2477,-64.2325,15z", -33.2477, -64.2325),
);
prueba("link con ?q= y coma codificada", () => {
  cerca("https://maps.google.com/?q=-33.2477,-64.2325", -33.2477, -64.2325);
  cerca("https://www.google.com/maps/search/?api=1&query=-33.2477%2C-64.2325", -33.2477, -64.2325);
});
prueba("link con ll= (Apple Maps)", () =>
  cerca("https://maps.apple.com/?ll=-33.2477,-64.2325", -33.2477, -64.2325),
);
prueba("grados, minutos y segundos (W y O)", () => {
  cerca(`33°14'51.7"S 64°13'57.0"W`, -33.247694, -64.2325);
  cerca("33º14’51,7”S 64º13’57”O", -33.247694, -64.2325);
});
prueba("fuera de rango o texto común no es coordenada", () => {
  assert.equal(parsearCoordenadas("Río Cuarto"), null);
  assert.equal(parsearCoordenadas("Ruta 8 km 600"), null);
  assert.equal(parsearCoordenadas("95.5, 200.1"), null);
});
prueba("etiqueta con coma decimal y S/O", () => {
  const p = parsearCoordenadas("-33.2477, -64.2325");
  assert.equal(p?.etiqueta, "33,2477° S · 64,2325° O");
});
prueba("limpiarTexto saca ', ARG'", () =>
  assert.equal(limpiarTexto("Río Cuarto, Córdoba, ARG"), "Río Cuarto, Córdoba"),
);

console.log(`\n${ok} pruebas en verde`);
