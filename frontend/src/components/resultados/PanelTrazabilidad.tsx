"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Boton from "@/components/comunes/Boton";
import { esDisponible, type IdEstrategia, type Salida } from "@/lib/contrato";
import { destinoTab, SELECTOR_ENFOCABLES } from "@/lib/focoAtrapado";
import { textoEfecto } from "@/lib/formato";
import { BADGE } from "@/lib/rotaciones";
import InsigniaEstrategia from "./InsigniaEstrategia";
import css from "./PanelTrazabilidad.module.css";

interface Props {
  salida: Salida;
  /** Estrategia que se muestra; null = panel cerrado. */
  id: IdEstrategia | null;
  onCambiar: (id: IdEstrategia) => void;
  onCerrar: () => void;
}

function Bloque({ titulo, items, vacio }: { titulo: string; items: readonly ReactNode[]; vacio: string }) {
  return (
    <section className={css.bloque}>
      <h3 className={css.subtitulo}>
        {titulo}
        {items.length > 0 && <span className={css.cuenta}>{items.length}</span>}
      </h3>
      {items.length ? (
        <ul className={css.lista}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className={css.vacio}>{vacio}</p>
      )}
    </section>
  );
}

/**
 * Trazabilidad de una estrategia, en un panel lateral que se abre desde la
 * tabla comparativa ("Ver trazabilidad"): de dónde sale cada número y los
 * 5 puntos de la columna. Está a un clic para quien lo necesite y no carga la
 * tabla. Pestañas para pasar de una estrategia a otra sin cerrar.
 *
 * En el PDF no hace falta abrir nada: la hoja de impresión imprime la tabla
 * con estas mismas filas (`TablaTecnica` con `impresion`).
 *
 * Accesibilidad: `role="dialog"` con `aria-modal`, foco atrapado, Esc o clic
 * en el fondo cierran, y el foco vuelve al botón que lo abrió.
 */
export default function PanelTrazabilidad({ salida, id, onCambiar, onCerrar }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const abierto = id !== null;

  useEffect(() => {
    if (!abierto) return;
    const disparador = document.activeElement as HTMLElement | null;
    caja.current?.focus();
    return () => {
      if (disparador && document.contains(disparador)) disparador.focus();
    };
  }, [abierto]);

  if (!abierto) return null;
  const e = salida.estrategias.find((x) => x.id === id);
  if (!e) return null;

  const teclado = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      onCerrar();
      return;
    }
    if (ev.key !== "Tab" || !caja.current) return;
    const enfocables = Array.from(caja.current.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
    const destino = destinoTab(enfocables.indexOf(document.activeElement as HTMLElement), enfocables.length, ev.shiftKey);
    ev.preventDefault();
    (destino >= 0 ? enfocables[destino] : caja.current).focus();
  };

  return createPortal(
    <div
      className={css.fondo}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onCerrar();
      }}
    >
      <div
        ref={caja}
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={teclado}
      >
        <header className={css.encabezado}>
          <div className={css.titulos}>
            <p className={css.antetitulo}>Trazabilidad</p>
            <h2 id={idTitulo} className={css.titulo}>
              <InsigniaEstrategia id={e.id} descartada={!e.disponible} />
              {e.nombre}
            </h2>
            <p className={css.especies}>{e.especies}</p>
          </div>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Boton>
        </header>

        <div className={css.pestanas} role="group" aria-label="Estrategia">
          {salida.estrategias.map((x) => (
            <button
              key={x.id}
              type="button"
              className={css.pestana}
              data-id={x.id}
              aria-pressed={x.id === e.id}
              onClick={() => onCambiar(x.id)}
            >
              {BADGE[x.id]}
            </button>
          ))}
        </div>

        <div className={css.cuerpo}>
          {esDisponible(e) ? (
            <>
              <p className={css.resumen}>{e.resumen}</p>
              <Bloque titulo="Por qué aparece" items={e.por_que} vacio="Sin detalle" />
              <Bloque
                titulo="Reglas aplicadas"
                items={e.reglas_aplicadas.map((r) => (
                  <>
                    <b>{textoEfecto(r.efecto)}</b> <span className={css.dato}>{r.dato}</span>
                  </>
                ))}
                vacio="Sin reglas registradas"
              />
              <Bloque titulo="Evidencia" items={e.evidencia} vacio="Sin detalle" />
              <Bloque
                titulo="Beneficios frente a la actual"
                items={e.beneficios}
                vacio={e.id === "actual" ? "Es la base de la comparación" : "Sin valores a favor frente a la actual"}
              />
              {e.que_le_falta.length > 0 && (
                <Bloque titulo="Lejos de tus prioridades" items={e.que_le_falta} vacio="" />
              )}
              <Bloque titulo="Información que falta" items={e.vacios} vacio="Sin faltantes informados" />
              <Bloque titulo="A revisar con el agrónomo" items={e.riesgos} vacio="Sin alertas" />
            </>
          ) : (
            <>
              <p className={css.descartada}>
                <b>Descartada.</b> {e.motivo_descarte}
              </p>
              <Bloque titulo="Por qué aparece" items={e.por_que} vacio="Sin detalle" />
              <Bloque titulo="Información que falta" items={e.vacios} vacio="Sin faltantes informados" />
              <Bloque titulo="A revisar con el agrónomo" items={e.riesgos} vacio="Sin alertas" />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
