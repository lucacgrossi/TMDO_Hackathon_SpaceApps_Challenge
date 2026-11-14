"use client";

/**
 * F7 · Objetivos: 4 barras de 1 a 5, por defecto 3 (RF4 del MVP 4.3).
 *
 * Por qué desde 1 y no desde 0 (como el prototipo): desde el #57 el motor pesa
 * las prioridades al cuadrado en la cercanía y el contrato rechaza un 0 con
 * error 422. Pedido de Back 2 en el PR #12.
 *
 * Sale del prototipo final: `OBJ` y el armado de `#sliders` (un `.sl` por
 * objetivo con label, input range y output). Las barras solo cargan cuánto
 * le importa cada objetivo al productor; con eso la hoja de resultados
 * recalcula la cercanía sin volver a llamar a la API (RF13, persona 5).
 */
import { useEntradas } from "@/lib/store";
import type { Objetivo } from "@/lib/entradas";

/** Orden y nombre de cada barra (OBJ del prototipo). */
const OBJETIVOS: { k: Objetivo; n: string }[] = [
  { k: "agua", n: "Agua" },
  { k: "suelo", n: "Suelo" },
  { k: "erosion", n: "Erosión" },
  { k: "ingreso", n: "Ingreso" },
];

export default function SeccionObjetivos() {
  const objetivos = useEntradas((s) => s.objetivos);
  const cambiar = useEntradas((s) => s.cambiar);

  return (
    <div className="blk" data-a="obj">
      <h3>Objetivos</h3>
      <p className="hint">Cuánto te importa cada uno: 1 poco, 5 mucho.</p>
      <div id="sliders">
        {OBJETIVOS.map((o) => (
          <div className="sl" key={o.k}>
            <label htmlFor={`w-${o.k}`}>{o.n}</label>
            <input
              type="range"
              id={`w-${o.k}`}
              min={1}
              max={5}
              step={1}
              value={objetivos[o.k]}
              // Se copia el objeto entero: el store no se muta, se reemplaza (así React se entera del cambio).
              onChange={(e) => cambiar({ objetivos: { ...objetivos, [o.k]: Number(e.target.value) } })}
            />
            {/* El valor se ve al lado en número, no solo por la posición de la barra. */}
            <output htmlFor={`w-${o.k}`} id={`o-${o.k}`} className="num">
              {objetivos[o.k]}
            </output>
          </div>
        ))}
      </div>
    </div>
  );
}
