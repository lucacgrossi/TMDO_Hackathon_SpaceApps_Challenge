"use client";

import { useEffect, useRef, useState } from "react";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";

/**
 * F1 · El botón de abajo del panel, que cambia según el paso.
 * Sale de `ctaOnb()`, `goMap()` y el click de `#comparar` del prototipo final.
 *
 * Paso 1 (inicio):
 *   - Lote de ejemplo → "Ver el lote de ejemplo en el mapa".
 *   - Marcar mi lote sin ubicación → deshabilitado, "Elegí dónde está tu lote".
 *     Por qué: sin saber dónde está el lote, el mapa abriría en cualquier lado.
 *   - Marcar mi lote con ubicación → "Ir al mapa y marcar mi lote".
 * Paso 2 (mapa): "Comparar alternativas" abre la hoja de la persona 5.
 *
 * El vuelo del mapa hasta el lote lo hace Mapa.tsx al ver que `paso`
 * cambió: así el botón no necesita saber nada de Leaflet.
 */
export default function BotonPrincipal() {
  const paso = useEntradas((s) => s.paso);
  const modoLote = useEntradas((s) => s.modoLote);
  const ubicacion = useEntradas((s) => s.ubicacion);
  const cambiar = useEntradas((s) => s.cambiar);
  const abrirHoja = useVista((s) => s.abrirHoja);

  // El prototipo cambia el texto 300 ms después de arrancar la animación,
  // para que no salte antes de que el panel empiece a moverse.
  const [textoMapa, setTextoMapa] = useState(paso === "mapa");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const enInicio = paso === "inicio";
  const faltaUbicacion = enInicio && modoLote === "dibujo" && !ubicacion;

  let texto = "Comparar alternativas";
  if (enInicio || !textoMapa) {
    if (modoLote === "dibujo") texto = ubicacion ? "Ir al mapa y marcar mi lote" : "Elegí dónde está tu lote";
    else texto = "Ver el lote de ejemplo en el mapa";
  }

  function irAlMapa() {
    // Clase "morph" del CSS del prototipo: anima el panel del centro a la
    // derecha durante 950 ms. Se saca sola al terminar.
    const panel = document.querySelector(".panel");
    panel?.classList.add("morph");
    timers.current.push(window.setTimeout(() => panel?.classList.remove("morph"), 950));
    timers.current.push(window.setTimeout(() => setTextoMapa(true), 300));
    // En el celu el panel queda abajo del mapa: subimos para que se vea el mapa.
    if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: "smooth" });
    cambiar({ paso: "mapa" });
  }

  function comparar() {
    abrirHoja();
    // En el celu la hoja queda abajo: la llevamos a la vista si existe.
    if (window.innerWidth <= 900) document.getElementById("sheet")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <button
      type="button"
      className="btn"
      id="comparar"
      disabled={faltaUbicacion}
      onClick={enInicio ? irAlMapa : comparar}
    >
      {texto}
    </button>
  );
}
