"use client";

import { useState } from "react";
import { esDisponible, type IdEstrategia, type Salida } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import LeyendaLinea from "./LeyendaLinea";
import TarjetaEstrategia from "./TarjetaEstrategia";
import css from "./tarjetas.module.css";

/**
 * Vista resumen de la hoja: la leyenda de la línea de la campaña y las 4
 * tarjetas (actual, A, B, C) en la grilla `.cards` del prototipo. Una sola
 * tarjeta abierta a la vez; tocar la abierta la cierra. La cercanía se
 * recalcula con las barras del panel (`objetivos`), sin pedir datos (RF13).
 */
export default function TarjetasEstrategias({ salida }: { salida: Salida }) {
  const pesos = useEntradas((s) => s.objetivos);
  const [seleccionada, setSeleccionada] = useState<IdEstrategia | null>(null);
  const actual = esDisponible(salida.estrategias[0]) ? salida.estrategias[0] : null;

  return (
    <div className={css.contenedor}>
      <LeyendaLinea />
      <div className={`cards ${css.grilla}`}>
        {salida.estrategias.map((e, i) => (
          <TarjetaEstrategia
            key={e.id}
            orden={i}
            salida={salida}
            estrategia={e}
            actual={actual}
            pesos={pesos}
            seleccionada={seleccionada === e.id}
            onSeleccionar={() => setSeleccionada((s) => (s === e.id ? null : e.id))}
          />
        ))}
      </div>
    </div>
  );
}
