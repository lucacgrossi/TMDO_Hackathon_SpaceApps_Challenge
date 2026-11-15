/**
 * Encuadre del mapa del dashboard (S4) sin que los paneles flotantes tapen el
 * lote (H-020). Puro, sin Leaflet ni DOM: recibe las cajas en píxeles de
 * pantalla (como `getBoundingClientRect`) y devuelve el padding de `fitBounds`.
 *
 * Cada panel que cae sobre el mapa se "aparta" hacia uno de sus dos lados más
 * cercanos (la línea de tiempo, abajo; la leyenda, abajo o a la derecha). Se
 * prueban las combinaciones y gana la que deja el lote más grande, según su
 * forma (`aspecto` = ancho / alto en metros).
 */

export interface Caja {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Igual que las opciones de `fitBounds` de Leaflet: [x, y]. */
export interface Margenes {
  paddingTopLeft: [number, number];
  paddingBottomRight: [number, number];
}

type Lado = "top" | "right" | "bottom" | "left";

/** Lado libre mínimo (px) para que el lote se vea; si no alcanza, se ignoran los paneles. */
const LADO_MINIMO = 120;

function seSuperpone(c: Caja, mapa: Caja): boolean {
  const conTamanio = c.right > c.left && c.bottom > c.top; // display: none da una caja vacía
  return conTamanio && c.bottom > mapa.top && c.top < mapa.bottom && c.right > mapa.left && c.left < mapa.right;
}

/** Cuánto hay que correr el borde del mapa en cada lado para dejar el panel afuera. */
function insets(c: Caja, mapa: Caja): Record<Lado, number> {
  return {
    top: c.bottom - mapa.top,
    bottom: mapa.bottom - c.top,
    left: c.right - mapa.left,
    right: mapa.right - c.left,
  };
}

/**
 * Padding para `fitBounds` que deja el lote en la zona libre del mapa.
 * Los paneles que no caen sobre el mapa (ocultos o debajo, en celular) no cuentan.
 */
export function margenesLote(mapa: Caja, paneles: Caja[], aspecto: number, aire = 12): Margenes {
  const anchoMapa = mapa.right - mapa.left;
  const altoMapa = mapa.bottom - mapa.top;
  const forma = Number.isFinite(aspecto) && aspecto > 0 ? aspecto : 1;

  // Para cada panel, sus dos lados más baratos
  const opciones = paneles
    .filter((c) => seSuperpone(c, mapa))
    .map((c) => {
      const i = insets(c, mapa);
      return (Object.keys(i) as Lado[])
        .sort((a, b) => i[a] - i[b])
        .slice(0, 2)
        .map((lado) => ({ lado, px: i[lado] }));
    });

  let mejor: Record<Lado, number> | null = null;
  let mejorTamanio = -Infinity;
  for (let combo = 0; combo < 1 << opciones.length; combo++) {
    const pad: Record<Lado, number> = { top: aire, right: aire, bottom: aire, left: aire };
    opciones.forEach((op, k) => {
      const { lado, px } = op[(combo >> k) & 1] ?? op[0];
      pad[lado] = Math.max(pad[lado], px + aire);
    });
    const ancho = anchoMapa - pad.left - pad.right;
    const alto = altoMapa - pad.top - pad.bottom;
    if (ancho < LADO_MINIMO || alto < LADO_MINIMO) continue;
    // Alto que tendría el lote encajado en la zona libre
    const tamanio = Math.min(ancho / forma, alto);
    if (tamanio > mejorTamanio) {
      mejorTamanio = tamanio;
      mejor = pad;
    }
  }

  const p = mejor ?? { top: aire, right: aire, bottom: aire, left: aire };
  return { paddingTopLeft: [p.left, p.top], paddingBottomRight: [p.right, p.bottom] };
}

/** Ancho / alto del lote en metros (aprox.), desde sus límites [[sur, oeste], [norte, este]]. */
export function aspectoLote(sur: number, oeste: number, norte: number, este: number): number {
  const alto = norte - sur;
  const ancho = (este - oeste) * Math.cos((((sur + norte) / 2) * Math.PI) / 180);
  return alto > 0 && ancho > 0 ? ancho / alto : 1;
}
