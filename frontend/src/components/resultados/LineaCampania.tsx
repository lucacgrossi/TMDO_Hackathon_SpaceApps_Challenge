"use client";

import type { CSSProperties } from "react";
import type { EstrategiaDisponible, Salida } from "@/lib/contrato";
import { fmt, MESES, mesesConAnios, NOMBRE_CULTIVO, rangoMeses, tramosCalendario } from "@/lib/formato";
import { colorNdvi, indiceCampania, mesesLinea } from "@/lib/linea";
import { useVista } from "@/lib/vista";
import css from "./linea.module.css";

/** Inicial de cada mes (0 = enero), como el eje del prototipo. */
const INICIAL = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Línea de la campaña (julio → junio), la del prototipo (`timelineHTML`):
 * - fila de meses: helada frecuente (fondo), helada con cultivo sensible
 *   (anillo) y calor ≥ 35 °C con cultivo de verano (raya arriba);
 * - fila de cultivos: un segmento por tramo, "Pelado" en el barbecho;
 * - en la actual, la fila fina de lo que vio el satélite, con la escala del NDVI del mapa;
 * - el cursor marca el mes que muestra el mapa (`useVista().mes`).
 * El color nunca es la única señal: cada marca tiene forma propia, título y
 * la línea entera tiene una descripción en texto.
 */
export default function LineaCampania({
  salida,
  estrategia,
  satelite = estrategia.id === "actual",
}: {
  salida: Salida;
  estrategia: EstrategiaDisponible;
  satelite?: boolean;
}) {
  const mes = useVista((s) => s.mes);
  const meses = mesesLinea(salida, estrategia);
  const tramos = tramosCalendario(estrategia.calendario);
  const sat = salida.visto_por_satelite;
  const n = salida.clima_mensual.n_anios;

  const heladas = meses.filter((m) => m.heladaFrecuente).map((m) => m.mes);
  const conflictos = estrategia.valores.conflictos_helada_calor;
  const descripcion = [
    `Campaña de julio a junio: ${tramos.map((t) => `${nombreTramo(t.cultivo)} ${rangoMeses(t)}`).join(", ")}.`,
    heladas.length ? `Helada frecuente en ${mesesConAnios(heladas, salida.clima_mensual.anios_con_helada, n)}.` : "",
    conflictos.meses_conflicto_helada.length
      ? `Cultivo sensible en meses con helada: ${mesesConAnios(conflictos.meses_conflicto_helada, salida.clima_mensual.anios_con_helada, n)}.`
      : "",
    conflictos.meses_calor.length
      ? `Máxima de 35 °C o más con cultivo de verano: ${mesesConAnios(conflictos.meses_calor, salida.clima_mensual.anios_con_35c, n)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`tlw ${css.linea}`}>
      <div className="tl" role="img" aria-label={descripcion}>
        <div className="r">
          <div className="mx">
            {meses.map((m) => (
              <span
                key={m.mes}
                className={[m.heladaFrecuente ? "fr" : "", m.conflictoHelada ? css.conflicto : "", m.calor ? css.calor : ""]
                  .filter(Boolean)
                  .join(" ")}
                title={tituloMes(m, n)}
              >
                {INICIAL[m.mes]}
              </span>
            ))}
          </div>
        </div>
        <div className="r">
          <div className="row2">
            {tramos.map((t) => {
              const pelado = t.cultivo === "barbecho";
              return (
                <span
                  key={t.desde}
                  className={`seg${pelado ? " bare" : ""}${t.meses < 2 ? " hide" : ""}`}
                  style={{ flex: t.meses }}
                  title={`${NOMBRE_CULTIVO[t.cultivo]}: ${MESES[t.desde]} a ${MESES[t.hasta]}`}
                >
                  {pelado ? "Pelado" : NOMBRE_CULTIVO[t.cultivo]}
                </span>
              );
            })}
          </div>
        </div>
        {satelite && (
          <div className="r">
            <div className="row2 sat">
              {meses.map(({ mes: m }) => {
                const v = sat.meses[m];
                return (
                  <i
                    key={m}
                    className={v ? undefined : css.sinEscena}
                    style={v ? { background: colorNdvi(v.ndvi_medio) } : undefined}
                    title={
                      v
                        ? `${MESES[m]}: NDVI ${fmt(v.ndvi_medio, 2)} (${v.ndvi_medio < sat.umbral ? "pelado" : "cubierto"}) · ${v.fecha} · ${v.fuente}`
                        : `${MESES[m]}: sin escena sin nubes`
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
        <span className="cur" style={{ "--i": indiceCampania(mes) } as CSSProperties} aria-hidden="true" />
      </div>
      {satelite && (
        <div className="satcap">
          {sat.meses_ndvi_bajo != null ? (
            <>
              <b>Visto por satélite{sat.campana ? ` ${sat.campana}` : ""}:</b> pelado {sat.meses_ndvi_bajo} de{" "}
              {sat.meses_con_dato} meses con escena
            </>
          ) : (
            "Visto por satélite: sin datos"
          )}
        </div>
      )}
    </div>
  );
}

function nombreTramo(c: keyof typeof NOMBRE_CULTIVO) {
  return c === "barbecho" ? "pelado" : NOMBRE_CULTIVO[c].toLowerCase();
}

function tituloMes(m: ReturnType<typeof mesesLinea>[number], n: number): string {
  const partes: string[] = [MESES[m.mes]];
  if (m.heladaFrecuente) partes.push(`helada en ${m.aniosHelada} de ${n} años`);
  if (m.conflictoHelada) partes.push("cultivo sensible a la helada");
  if (m.calor) partes.push(`máxima ≥ 35 °C en ${m.anios35} de ${n} años`);
  return partes.join(" · ");
}
