"use client";

import type { Salida } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import TarjetaEstrategia from "./TarjetaEstrategia";
import css from "./tarjetas.module.css";

/**
 * Vista de tarjetas de la hoja vieja (HojaComparacion). Se retira con la hoja
 * en la limpieza (PLAN.md, persona 5, paso 4); mientras tanto usa la card nueva.
 */
export default function TarjetasEstrategias({ salida }: { salida: Salida }) {
  const pesos = useEntradas((s) => s.objetivos);
  return (
    <div className={css.contenedor}>
      <div className={css.grilla}>
        {salida.estrategias.map((e) => (
          <TarjetaEstrategia key={e.id} estrategia={e} pesos={pesos} />
        ))}
      </div>
    </div>
  );
}
