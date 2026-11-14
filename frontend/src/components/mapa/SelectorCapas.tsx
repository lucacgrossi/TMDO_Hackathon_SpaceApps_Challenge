"use client";

import { type Capa, useMapa } from "@/lib/mapa";

/**
 * F9 · Barra de capas `.layers` (arriba a la derecha del mapa).
 * Sale del bloque `.layers` de prototipo-body.html y del click de `setLayer()`
 * (prototipo-app.js ~línea 343). Los `title` son los del prototipo: explican
 * cada capa en una línea al pasar el mouse.
 *
 * Solo cambia `useMapa.capa`: cada capa del mapa, la leyenda, la línea de
 * tiempo y EncuadreCapa reaccionan solas a ese cambio.
 */
const CAPAS: { id: Capa; nombre: string; titulo: string }[] = [
  { id: "sat", nombre: "Vista aérea", titulo: "Imagen satelital de fondo" },
  {
    id: "ndvi",
    nombre: "Vegetación",
    titulo: "Qué tan cubierto de vegetación está cada lote, mes a mes (NDVI de NASA)",
  },
  {
    id: "slope",
    nombre: "Pendiente",
    titulo: "Inclinación del terreno dentro del lote: más pendiente, más riesgo de erosión",
  },
  { id: "clima", nombre: "Lluvia y heladas", titulo: "Lluvia, temperaturas y heladas de cada mes (30 campañas de NASA)" },
];

export default function SelectorCapas() {
  const capa = useMapa((s) => s.capa);
  const cambiarCapa = useMapa((s) => s.cambiarCapa);
  return (
    <div className="layers" role="group" aria-label="Capas">
      {CAPAS.map((c) => (
        <button
          key={c.id}
          type="button"
          // aria-pressed: el lector de pantalla anuncia cuál está activa; el CSS la pinta con el acento.
          aria-pressed={capa === c.id}
          title={c.titulo}
          onClick={() => cambiarCapa(c.id)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}
