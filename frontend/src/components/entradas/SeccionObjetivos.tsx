"use client";

/**
 * F7 · Prioridades: 4 sliders de 1 a 5 en bloques, por defecto 3 (RF4).
 * Figma: Slider de prioridad. Lo usan el panel de entradas (S2) y Rotaciones
 * (S6, persona 5): mismo componente y mismo estado (`useEntradas`), así mover
 * una prioridad recalcula la cercanía sin volver a llamar a la API (RF13).
 *
 * Por qué desde 1 y no desde 0: el motor pesa las prioridades al cuadrado en
 * la cercanía y el contrato rechaza un 0 con error 422.
 *
 * Cada slider es un grupo de 5 radios con forma de bloque: el teclado los
 * recorre con las flechas (comportamiento nativo del radio) y el valor se ve
 * en número al lado, no solo por cuántos bloques están llenos.
 */
import type { Objetivo } from "@/lib/entradas";
import { PRIORIDADES } from "@/lib/resumenEntradas";
import { useEntradas } from "@/lib/store";
import estilos from "./SeccionObjetivos.module.css";

const NIVELES = [1, 2, 3, 4, 5] as const;

export default function SeccionObjetivos() {
  const objetivos = useEntradas((s) => s.objetivos);
  const cambiar = useEntradas((s) => s.cambiar);

  // Se copia el objeto entero: el store no se muta, se reemplaza (así React se entera del cambio).
  const elegir = (k: Objetivo, v: number) =>
    cambiar({ objetivos: { ...useEntradas.getState().objetivos, [k]: v } });

  return (
    <div>
      <p className={estilos.ayuda}>Cuánto te importa cada una: 1 poco, 5 mucho.</p>
      <div className={estilos.lista}>
        {PRIORIDADES.map((o) => (
          <div className={estilos.slider} key={o.k} role="radiogroup" aria-labelledby={`prioridad-${o.k}-t`}>
            <span className={estilos.etiqueta} id={`prioridad-${o.k}-t`}>
              {o.n}
            </span>
            <div className={estilos.bloques}>
              {NIVELES.map((v) => (
                <label key={v} className={estilos.bloque} data-lleno={v <= objetivos[o.k]}>
                  <input
                    type="radio"
                    name={`prioridad-${o.k}`}
                    value={v}
                    checked={objetivos[o.k] === v}
                    onChange={() => elegir(o.k, v)}
                    aria-label={`${o.n}: ${v} de 5`}
                  />
                  <span aria-hidden="true" />
                </label>
              ))}
            </div>
            <output className={estilos.valor} aria-hidden="true">
              {objetivos[o.k]}
            </output>
          </div>
        ))}
      </div>
    </div>
  );
}
