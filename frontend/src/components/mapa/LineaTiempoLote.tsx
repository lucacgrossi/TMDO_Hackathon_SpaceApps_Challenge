"use client";

import { useEffect, useMemo, useState } from "react";
import type { Capas, VistoPorSatelite } from "@/lib/contrato";
import { fmt } from "@/lib/formato";
import { lineaTiempo, NOTA_MODIS } from "@/lib/lineaTiempo";
import css from "./LineaTiempoLote.module.css";

/**
 * Línea de tiempo del mapa del lote (S4, RF17): ▶ y una barrita por mes, de
 * julio a junio, con el NDVI medio del lote que manda el back
 * (`visto_por_satelite.meses`). El mes elegido es `useVista().mes` (0 = enero).
 * El mes con MODIS lleva asterisco y la nota de confianza baja; el mes sin
 * escena dice "sin dato" con el motivo.
 */

/** Tiempo entre un mes y el siguiente al reproducir. */
const MS_POR_MES = 1200;
/** Alto máximo de la barrita (NDVI 1), px. */
const ALTO_MAX = 44;

export default function LineaTiempoLote({
  visto,
  capas,
  mes,
  onMes,
}: {
  visto: VistoPorSatelite;
  capas: Capas;
  mes: number;
  onMes: (mes: number) => void;
}) {
  const meses = useMemo(() => lineaTiempo(visto, capas), [visto, capas]);
  const [reproduciendo, setReproduciendo] = useState(false);

  // Un paso por mes: cada cambio de mes vuelve a armar el temporizador.
  useEffect(() => {
    if (!reproduciendo) return;
    const t = setTimeout(() => {
      const i = meses.findIndex((m) => m.mes === mes);
      onMes(meses[(i + 1) % 12].mes);
    }, MS_POR_MES);
    return () => clearTimeout(t);
  }, [reproduciendo, mes, meses, onMes]);

  const hayModis = meses.some((m) => m.modis);
  const etiqueta = reproduciendo ? "Pausar" : "Pasar los 12 meses";
  return (
    <div className={css.linea}>
      <div className={css.fila}>
        <button
          type="button"
          className={css.play}
          aria-label={etiqueta}
          title={etiqueta}
          aria-pressed={reproduciendo}
          onClick={() => setReproduciendo((r) => !r)}
        >
          {reproduciendo ? "❚❚" : "▶"}
        </button>
        <div className={css.meses} role="group" aria-label={`NDVI medio del lote por mes, campaña ${visto.campana ?? "sin dato"}`}>
          {meses.map((m) => (
            <button
              key={m.mes}
              type="button"
              className={css.mes}
              aria-pressed={m.mes === mes}
              aria-label={m.texto}
              title={m.texto}
              onClick={() => {
                setReproduciendo(false);
                onMes(m.mes);
              }}
            >
              <span className={css.valor}>{m.ndvi == null ? "–" : fmt(m.ndvi, 2)}</span>
              <span
                className={m.ndvi == null ? `${css.barra} ${css.sinDato}` : css.barra}
                style={{
                  height: m.ndvi == null ? 4 : Math.max(2, Math.round(m.alto * ALTO_MAX)),
                  background: m.color ?? undefined,
                }}
                aria-hidden="true"
              />
              <span className={css.etiqueta}>{m.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>
      <p className={css.pie}>
        NDVI medio del lote, {visto.fuente}, campaña {visto.campana ?? "sin dato"}.
        {hayModis && ` * ${NOTA_MODIS}`}
      </p>
    </div>
  );
}
