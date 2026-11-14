/**
 * Cuentas de geometría sobre el lote, sin Leaflet ni React (funciones puras).
 * Salen de `areaHa`, `center`, `distKm`, `inPoly`, `segX` y `selfX` del
 * prototipo (prototipo-app.js ~líneas 64-82).
 *
 * Todos los puntos son [lat, lng] en grados, igual que `poligono` en el estado.
 * Por qué no usamos una librería (turf, etc.): son 6 fórmulas cortas, el lote
 * mide unos km y con esto alcanza; una dependencia más no se justifica.
 */
import type { LatLng } from "./entradas";

const RAD = Math.PI / 180;

/**
 * Superficie del polígono en hectáreas.
 *
 * Fórmula de área de un polígono sobre la esfera (la que usa Leaflet.draw y
 * Google): suma, lado por lado, la diferencia de longitudes por
 * (2 + sen(lat1) + sen(lat2)). Por qué no la fórmula plana del "cordón de
 * zapato" con grados: un grado de longitud mide distinto según la latitud
 * (en Río Cuarto ~93 km, en el ecuador ~111 km) y el área saldría inflada.
 * R = radio ecuatorial de la Tierra (WGS84) en metros; 1 ha = 10 000 m².
 */
export function areaHa(puntos: LatLng[]): number {
  const R = 6378137;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p1 = puntos[i];
    const p2 = puntos[(i + 1) % puntos.length]; // el último lado cierra contra el primero
    suma += (p2[1] - p1[1]) * RAD * (2 + Math.sin(p1[0] * RAD) + Math.sin(p2[0] * RAD));
  }
  // El signo depende del sentido en que se marcaron las esquinas: se descarta.
  return Math.abs((suma * R * R) / 2) / 1e4;
}

/**
 * Centro del lote (centroide del área, no promedio de las esquinas).
 *
 * Por qué el centroide: si el lote es una L, el promedio de las esquinas
 * puede caer en un rincón; el centroide pesa cada parte por su superficie.
 * Si el polígono no tiene área (menos de 3 puntos o todos en línea), la
 * fórmula divide por cero: ahí se usa el promedio simple.
 * A la escala de un lote (pocos km) tratar los grados como plano no cambia nada.
 */
export function centro(puntos: LatLng[]): LatLng {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, n = puntos.length; i < n; i++) {
    const [p0, p1] = puntos[i];
    const [q0, q1] = puntos[(i + 1) % n];
    const k = p1 * q0 - q1 * p0; // producto cruzado: el área (con signo) de cada triángulo
    a += k;
    x += (p0 + q0) * k;
    y += (p1 + q1) * k;
  }
  if (Math.abs(a) < 1e-12) {
    const n = puntos.length || 1;
    return [puntos.reduce((s, p) => s + p[0], 0) / n, puntos.reduce((s, p) => s + p[1], 0) / n];
  }
  return [x / (3 * a), y / (3 * a)];
}

/**
 * Distancia en km entre dos puntos, por la fórmula de haversine.
 *
 * Por qué haversine: mide sobre la esfera y es estable para distancias
 * cortas (otras fórmulas con coseno pierden precisión con pocos km).
 * R = radio medio de la Tierra, 6371 km.
 */
export function distanciaKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * ¿El punto (lat, lng) cae dentro del polígono?
 *
 * Método del rayo: desde el punto se tira una línea horizontal y se cuentan
 * los lados que cruza. Impar = adentro, par = afuera. Funciona con lotes
 * cóncavos (una L) sin casos especiales.
 */
export function dentroDelPoligono(lat: number, lng: number, puntos: LatLng[]): boolean {
  let adentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [yi, xi] = puntos[i];
    const [yj, xj] = puntos[j];
    // El lado cruza la altura del punto y el cruce queda a su derecha → cuenta.
    const cruza = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) adentro = !adentro;
  }
  return adentro;
}

/**
 * ¿Se cruzan los segmentos p1-p2 y p3-p4?
 *
 * Prueba de orientación: `giro(a, b, c)` dice si c queda a la izquierda o a la
 * derecha de la recta a→b (signo del producto cruzado). Dos segmentos se
 * cruzan si los extremos de cada uno quedan a lados opuestos del otro.
 * Se usa "< 0" estricto: tocarse en un extremo (esquinas vecinas) no cuenta.
 */
export function segmentosSeCruzan(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const giro = (a: LatLng, b: LatLng, c: LatLng) => (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  const o1 = giro(p1, p2, p3);
  const o2 = giro(p1, p2, p4);
  const o3 = giro(p3, p4, p1);
  const o4 = giro(p3, p4, p2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * ¿El contorno del lote se cruza consigo mismo (forma de moño)?
 *
 * Un lote así no tiene un área bien definida, por eso al dibujar se rechaza.
 * Compara cada lado contra todos los que no son vecinos (los vecinos comparten
 * una esquina y siempre "se tocan"). Con `cerrado`, también el lado que va del
 * último punto al primero.
 */
export function seCruza(puntos: LatLng[], cerrado: boolean): boolean {
  const n = puntos.length;
  const lados: [LatLng, LatLng][] = [];
  for (let i = 0; i < n - 1; i++) lados.push([puntos[i], puntos[i + 1]]);
  if (cerrado && n > 2) lados.push([puntos[n - 1], puntos[0]]);
  for (let i = 0; i < lados.length; i++) {
    for (let j = i + 1; j < lados.length; j++) {
      const vecinos = j === i + 1 || (cerrado && i === 0 && j === lados.length - 1);
      if (vecinos) continue;
      if (segmentosSeCruzan(lados[i][0], lados[i][1], lados[j][0], lados[j][1])) return true;
    }
  }
  return false;
}

/** Mueve el polígono entero para que su centro quede en `destino`, sin cambiarle la forma. */
export function moverPoligono(puntos: LatLng[], destino: LatLng): LatLng[] {
  const [cLat, cLng] = centro(puntos);
  return puntos.map(([lat, lng]) => [lat + destino[0] - cLat, lng + destino[1] - cLng]);
}

/** ¿Es el mismo polígono, esquina por esquina? (para saber si sigue siendo el de ejemplo). */
export function mismoPoligono(a: LatLng[], b: LatLng[]): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

/** Número con formato argentino: 1.234,5 (fmt del prototipo). */
export function formatoNumero(n: number, decimales = 0): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
