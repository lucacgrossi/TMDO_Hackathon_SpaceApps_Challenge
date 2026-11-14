"use client";

import { useEffect, useState } from "react";
import { MESES } from "@/lib/capas";
import { capaUsaMes, useMapa } from "@/lib/mapa";
import { useVista } from "@/lib/vista";

/**
 * F10 · Línea de tiempo `.timeline`: botón ▶/❚❚ y selector de mes.
 * Sale de `timeline()`, `setMonth()` y sus listeners en el prototipo final
 * (prototipo-app.js ~líneas 358-363).
 *
 * - El mes vive en `useVista.mes` (compartido): lo leen las capas, la leyenda
 *   y el cursor de la línea de la campaña en la hoja de resultados (persona 5).
 *   Acá no hay otro estado de mes.
 * - ▶ pasa los 12 meses, uno cada 1,3 s, en ronda (diciembre → enero).
 * - Elegir un mes a mano corta la reproducción (como el prototipo).
 * - Solo se ve con las capas que cambian por mes (Vegetación y Lluvia y heladas).
 */

/** Tiempo entre un mes y el siguiente al reproducir (1300 ms del prototipo). */
const MS_POR_MES = 1300;

export default function LineaTiempo() {
  const capa = useMapa((s) => s.capa);
  const mes = useVista((s) => s.mes);
  const cambiarMes = useVista((s) => s.cambiarMes);
  const [reproduciendo, setReproduciendo] = useState(false);
  const visible = capaUsaMes(capa);

  // El intervalo vive mientras `reproduciendo` sea true; al cortarse (o al
  // desmontar) React corre la limpieza y se apaga. Se lee el mes con
  // getState() para sumar siempre sobre el actual, no sobre uno viejo.
  useEffect(() => {
    if (!reproduciendo) return;
    const t = setInterval(() => {
      const v = useVista.getState();
      v.cambiarMes(v.mes + 1); // cambiarMes da la vuelta de 11 a 0
    }, MS_POR_MES);
    return () => clearInterval(t);
  }, [reproduciendo]);

  // Si se pasa a una capa sin mes, la línea se oculta y la reproducción se
  // corta: si no, seguiría cambiando el mes sin un botón a la vista para pararla.
  useEffect(() => {
    if (!visible) setReproduciendo(false);
  }, [visible]);

  const etiqueta = reproduciendo ? "Pausar" : "Pasar los 12 meses";
  return (
    <div className="timeline" id="timeline" hidden={!visible}>
      <button
        type="button"
        className="play"
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setReproduciendo((r) => !r)}
      >
        {reproduciendo ? "❚❚" : "▶"}
      </button>
      <select
        aria-label="Mes"
        value={mes}
        onChange={(e) => {
          setReproduciendo(false);
          cambiarMes(Number(e.target.value));
        }}
      >
        {MESES.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
