"use client";

import { useEffect, useRef, useState } from "react";
import { DURACION_ENTRADA_MS, DURACION_TWEEN_MS, pasoTween, sinMovimiento } from "@/lib/animacion";
import { fmt } from "@/lib/formato";
import { useEntradaHoja } from "./EntradaHoja";

/**
 * Número que pasa al valor nuevo cuando cambia (RF13: la cercanía se recalcula
 * al mover las barras). Es el `tween()` del prototipo: ~380 ms con salida
 * cúbica. Al montarse muestra el valor tal cual; al abrir la hoja (`EntradaHoja`)
 * cuenta desde 0 en ~700 ms, como el prototipo. Con
 * `prefers-reduced-motion: reduce` cambia de golpe. `null` se muestra "—".
 * Si llega otro valor a mitad de camino, sigue desde el número que se ve.
 */
export default function NumeroAnimado({ valor, duracion = DURACION_TWEEN_MS }: { valor: number | null; duracion?: number }) {
  const entrada = useEntradaHoja();
  const [mostrado, setMostrado] = useState(valor);
  // Lo que se ve ahora, también a mitad de una animación
  const visible = useRef(valor);
  const entradaAnterior = useRef(entrada);

  useEffect(() => {
    // Al abrir la hoja, cuenta desde 0 (solo en el cuadro en que arranca la entrada)
    const arrancaEntrada = entrada && !entradaAnterior.current;
    entradaAnterior.current = entrada;
    const desde = arrancaEntrada && valor != null ? 0 : visible.current;
    const ms = arrancaEntrada ? DURACION_ENTRADA_MS : duracion;
    if (valor == null || desde == null || desde === valor || sinMovimiento()) {
      visible.current = valor;
      setMostrado(valor);
      return;
    }
    const t0 = performance.now();
    let cuadro = requestAnimationFrame(function paso(t) {
      const { valor: v, fin } = pasoTween(desde, valor, t - t0, ms);
      visible.current = v;
      setMostrado(v);
      if (!fin) cuadro = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(cuadro);
  }, [valor, duracion, entrada]);

  return <>{mostrado == null ? "—" : fmt(mostrado)}</>;
}
