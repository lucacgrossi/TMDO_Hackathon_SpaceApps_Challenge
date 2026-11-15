import { C } from "@/lib/calendario";
import type { CultivoMes } from "@/lib/contrato";
import { fmt, LETRA_CULTIVO, NOMBRE_LEYENDA, ORDEN_LEYENDA } from "@/lib/formato";
import { NDVI_COLORES, NDVI_CORTES } from "@/lib/linea";
import css from "./linea.module.css";

/**
 * Leyenda de la línea de la campaña, una sola vez arriba de la tabla. Primero,
 * qué es cada letra de los cuadrados de los meses (solo los cultivos que
 * aparecen en esta respuesta); después, las marcas de clima y la fila del
 * satélite.
 */
export default function LeyendaLinea({ cultivos = [] }: { cultivos?: readonly CultivoMes[] }) {
  const presentes = ORDEN_LEYENDA.filter((c) => cultivos.includes(c));
  return (
    <div className={`lgd ${css.leyenda}`}>
      {presentes.length > 0 && (
        <div className={css.letras}>
          {presentes.map((c) => (
            <span key={c}>
              <b className={css.muestraLetra} data-grupo={C[c].g} aria-hidden="true">
                {LETRA_CULTIVO[c]}
              </b>
              {NOMBRE_LEYENDA[c]}
            </span>
          ))}
        </div>
      )}
      {/* Mismos colores que el calendario de las cards; el barbecho con puntos */}
      <span>
        <i data-grupo="verano" className={css.muestraTramo} />
        Cultivo de verano
      </span>
      <span>
        <i data-grupo="invierno" className={css.muestraTramo} />
        Cultivo de invierno
      </span>
      <span>
        <i data-grupo="cobertura" className={css.muestraTramo} />
        Cobertura
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
