import type { LatLng } from "./entradas";

/**
 * Zona del dato de clima: la celda de la grilla de NASA POWER (0,5° de latitud
 * × 0,625° de longitud, ~50 km) que contiene al lote. Toda la celda tiene un
 * solo valor de lluvia y temperatura; por eso la capa "Lluvia y heladas" la
 * dibuja punteada y rotulada, para que no se confunda con el lote.
 *
 * Sale de `powerCell()` y `climaPos()` del prototipo (prototipo-app.js ~líneas 324-333).
 */

/** [[sur, oeste], [norte, este]] de la celda de POWER que contiene el punto. */
export function celdaPower([lat, lng]: LatLng): [[number, number], [number, number]] {
  const cl = Math.round(lat / 0.5) * 0.5;
  const cn = Math.round(lng / 0.625) * 0.625;
  return [
    [cl - 0.25, cn - 0.3125],
    [cl + 0.25, cn + 0.3125],
  ];
}

/**
 * Dónde cae el lote dentro de la celda, en palabras: "bien adentro" o "cerca
 * del borde sur-este". Si está cerca del borde, la celda vecina puede
 * representarlo igual de bien: el texto lo deja a la vista.
 */
export function posicionEnCelda(punto: LatLng): string {
  const [[s, o], [n, e]] = celdaPower(punto);
  const fy = (punto[0] - s) / (n - s);
  const fx = (punto[1] - o) / (e - o);
  const ns = fy < 0.15 ? "sur" : fy > 0.85 ? "norte" : "";
  const eo = fx < 0.15 ? "oeste" : fx > 0.85 ? "este" : "";
  return ns || eo ? `cerca del borde ${[ns, eo].filter(Boolean).join("-")}` : "bien adentro";
}
