"use client";

import { useEffect, useRef, useState } from "react";
import { DURACION_TWEEN_MS, pasoTween } from "@/lib/animacion";
import { fmt } from "@/lib/formato";

const sinMovimiento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Número que pasa al valor nuevo cuando cambia (RF13: la cercanía se recalcula
 * al mover las barras). Es el `tween()` del prototipo: ~380 ms con salida
 * cúbica. Al montarse muestra el valor tal cual, sin animar desde 0. Con
 * `prefers-reduced-motion: reduce` cambia de golpe. `null` se muestra "—".
 * Si llega otro valor a mitad de camino, sigue desde el número que se ve.
 */
export default function NumeroAnimado({ valor, duracion = DURACION_TWEEN_MS }: { valor: number | null; duracion?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  // Lo que se ve ahora, también a mitad de una animación
  const visible = useRef(valor);

  useEffect(() => {
    const desde = visible.current;
    if (valor == null || desde == null || desde === valor || sinMovimiento()) {
      visible.current = valor;
      setMostrado(valor);
      return;
    }
    const t0 = performance.now();
    let cuadro = requestAnimationFrame(function paso(t) {
      const { valor: v, fin } = pasoTween(desde, valor, t - t0, duracion);
      visible.current = v;
      setMostrado(v);
      if (!fin) cuadro = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(cuadro);
  }, [valor, duracion]);

  return <>{mostrado == null ? "—" : fmt(mostrado)}</>;
}
