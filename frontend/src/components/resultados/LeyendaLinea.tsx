import { fmt } from "@/lib/formato";
import { NDVI_COLORES, NDVI_CORTES } from "@/lib/linea";
import css from "./linea.module.css";

/** Leyenda de la línea de la campaña, una sola vez arriba de la tabla o de las tarjetas. */
export default function LeyendaLinea() {
  return (
    <div className={`lgd ${css.leyenda}`}>
      <span>
        <i style={{ background: "var(--cover)" }} />
        Con cultivo o cobertura
      </span>
      <span>
        <i style={{ background: "var(--barbecho)" }} />
        Pelado
      </span>
      <span>
        <i className={css.muestraHelada} />
        Mes con helada frecuente
      </span>
      <span>
        <i className={css.muestraConflicto} />
        Cultivo sensible en mes con helada
      </span>
      <span>
        <i className={css.muestraCalor} />
        Máxima ≥ 35 °C con cultivo de verano
      </span>
      <span className={css.escalaNdvi}>
        Fila fina: NDVI visto por satélite (misma escala que el mapa)
        <span className={css.rampa} aria-hidden="true">
          {NDVI_COLORES.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        {fmt(NDVI_CORTES[0], 1)} a {fmt(0.9, 1)}; pelado debajo de {fmt(NDVI_CORTES[2], 1)}
      </span>
    </div>
  );
}
