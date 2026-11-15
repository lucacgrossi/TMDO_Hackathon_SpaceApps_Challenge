"use client";

/**
 * F6 · Rotación actual: verano, invierno y verano de la campaña pasada, más
 * el calendario de 12 meses que se arma solo (RF2).
 *
 * Sale del prototipo final: el bloque `data-a="rot"` con `.sel3` y el
 * calendario de las tarjetas (`timelineHTML` + `segs`), que acá se muestra
 * sin helada ni satélite porque esos datos llegan recién con la comparación.
 */
import { useEntradas } from "@/lib/store";
import { INVIERNOS, VERANOS, type Invierno, type Verano } from "@/lib/entradas";
import { C, INICIALES_MES, MESES, ORDEN_CAMPANA, calendario, notaCalendario } from "@/lib/calendario";
import type { CultivoMes } from "@/lib/contrato";
import { LETRA_CULTIVO, NOMBRE_LEYENDA, ORDEN_LEYENDA } from "@/lib/formato";
import linea from "@/components/resultados/linea.module.css";
import estilos from "./Campos.module.css";
import "./calendario.css";

export default function SeccionRotacion() {
  // Cada selector se suscribe solo a su campo: cambiar el verano no redibuja el resto del panel.
  const verano = useEntradas((s) => s.verano);
  const invierno = useEntradas((s) => s.invierno);
  const pasada = useEntradas((s) => s.pasada);
  const cambiar = useEntradas((s) => s.cambiar);

  // El calendario no se guarda: se deriva de verano + invierno en cada render (es barato, 12 meses).
  const meses = calendario(verano, invierno) as CultivoMes[];
  // La leyenda dice solo las letras que aparecen, en el mismo orden que la de la tabla.
  const presentes = ORDEN_LEYENDA.filter((c) => meses.includes(c));
  // Si un cultivo sale de su ventana típica (verano de 2ª, cobertura que se seca antes), se dice (QA H-003).
  const nota = notaCalendario(verano, invierno);

  return (
    <div>
      <div className={estilos.grilla}>
        <label className={estilos.campo}>
          Verano
          <select
            className={estilos.control}
            id="verano"
            value={verano}
            onChange={(e) => cambiar({ verano: e.target.value as Verano })}
          >
            {VERANOS.map((k) => (
              <option key={k} value={k}>
                {C[k].n}
              </option>
            ))}
          </select>
        </label>
        <label className={estilos.campo}>
          Invierno
          <select
            className={estilos.control}
            id="invierno"
            value={invierno}
            onChange={(e) => cambiar({ invierno: e.target.value as Invierno })}
          >
            {INVIERNOS.map((k) => (
              <option key={k} value={k}>
                {C[k].n}
              </option>
            ))}
          </select>
        </label>
        {/* La campaña pasada sirve para detectar si se repite el mismo cultivo de verano. */}
        <label className={`${estilos.campo} ${estilos.completo}`}>
          Verano de la campaña pasada
          <select
            className={estilos.control}
            id="pasada"
            value={pasada}
            onChange={(e) => cambiar({ pasada: e.target.value as Verano })}
          >
            {VERANOS.map((k) => (
              <option key={k} value={k}>
                {C[k].n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Calendario de solo lectura. Estructura de .tl del prototipo: eje de meses arriba, tramos abajo. */}
      <div className="cal-rot">
        <div className="tl">
          <div className="r">
            <div className="mx" aria-hidden="true">
              {ORDEN_CAMPANA.map((m) => (
                <span key={m} title={MESES[m]}>
                  {INICIALES_MES[m]}
                </span>
              ))}
            </div>
          </div>
          <div className="r">
            {/* Un cuadrado por mes con la letra del cultivo, como en la tabla de Rotaciones.
                role="list": un lector de pantalla lee cada mes con su cultivo, no solo el color. */}
            <div className={linea.mesesCultivo} role="list" aria-label="Calendario de la rotación, de julio a junio">
              {ORDEN_CAMPANA.map((m) => {
                const c = meses[m];
                return (
                  <span
                    key={m}
                    role="listitem"
                    className={linea.mesCultivo}
                    data-grupo={C[c].g}
                    title={`${MESES[m]}: ${NOMBRE_LEYENDA[c]}`}
                    aria-label={`${MESES[m]}: ${NOMBRE_LEYENDA[c]}`}
                  >
                    {LETRA_CULTIVO[c]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className={`${linea.letras} letras-rot`} aria-hidden="true">
          {presentes.map((c) => (
            <span key={c}>
              <b className={linea.muestraLetra} data-grupo={C[c].g}>
                {LETRA_CULTIVO[c]}
              </b>
              {NOMBRE_LEYENDA[c]}
            </span>
          ))}
        </div>
        <div className="cap">Campaña de julio a junio, armada con lo que elegiste.</div>
      </div>
      {nota && (
        <p className={estilos.nota} role="status">
          {nota}
        </p>
      )}
    </div>
  );
}
