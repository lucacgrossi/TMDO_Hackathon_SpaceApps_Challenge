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
import {
  C,
  INICIALES_MES,
  MESES,
  ORDEN_CAMPANA,
  calendario,
  describirSegmento,
  nombreTramo,
  segmentos,
  solapamiento,
  textoSolapamiento,
} from "@/lib/calendario";
import estilos from "./Campos.module.css";
import "./calendario.css";

export default function SeccionRotacion() {
  // Cada selector se suscribe solo a su campo: cambiar el verano no redibuja el resto del panel.
  const verano = useEntradas((s) => s.verano);
  const invierno = useEntradas((s) => s.invierno);
  const pasada = useEntradas((s) => s.pasada);
  const cambiar = useEntradas((s) => s.cambiar);

  // El calendario no se guarda: se deriva de verano + invierno en cada render (es barato, 12 meses).
  const tramos = segmentos(calendario(verano, invierno));
  // Si el verano pisa al invierno, el calendario lo recorta: se avisa en vez de hacerlo en silencio (QA H-003).
  const pisa = solapamiento(verano, invierno);

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
            {/* role="list": un lector de pantalla lee cada tramo con su nombre y meses, no solo el color. */}
            <div className="row2" role="list" aria-label="Calendario de la rotación, de julio a junio">
              {tramos.map((t) => {
                const g = C[t.cultivo].g;
                // "Barbecho (pelado)": el mismo término en el rótulo, el title y el aria-label (QA H-027).
                const nombre = nombreTramo(t.cultivo);
                return (
                  <span
                    key={t.desde}
                    role="listitem"
                    className={`seg ${g}`}
                    style={{ flex: t.meses }}
                    title={describirSegmento(t)}
                    aria-label={describirSegmento(t)}
                  >
                    {nombre}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="cap">Campaña de julio a junio, armada con lo que elegiste.</div>
      </div>
      {pisa && (
        <p className={estilos.aviso} role="status">
          <b>Ciclos superpuestos.</b> {textoSolapamiento(pisa)}
        </p>
      )}
    </div>
  );
}
