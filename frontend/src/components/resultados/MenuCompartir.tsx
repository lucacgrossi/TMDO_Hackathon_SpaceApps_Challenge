"use client";

import { useEffect, useId, useRef, useState } from "react";
import Boton from "@/components/comunes/Boton";
import { pausarAvisoRecarga } from "@/lib/avisoRecarga";
import { linkMail, resumenComparacion, resumenMail } from "@/lib/compartir";
import type { Salida } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import { useToast } from "@/lib/toast";
import css from "./MenuCompartir.module.css";

/**
 * Respaldo para cuando el navegador bloquea la API del portapapeles (permiso
 * denegado, página embebida o sin HTTPS): el método viejo, con un textarea oculto.
 */
function copiarConTextarea(texto: string): boolean {
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Menú Compartir del encabezado de Rotaciones (RF20, CU5), al lado de
 * "Exportar PDF":
 * - Enviar por mail: `mailto:` con la versión corta (`resumenMail`), para que
 *   el link no pase de `LARGO_MAX_MAILTO` y Outlook no lo corte.
 * - Copiar resumen: el resumen completo al portapapeles, con aviso.
 * Los dos textos se arman con las prioridades actuales (RF13).
 *
 * Teclado: Enter o flecha abajo abre y enfoca la primera opción; flechas,
 * Inicio y Fin recorren; Escape cierra y devuelve el foco al botón.
 */
export default function MenuCompartir({ salida }: { salida: Salida }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const objetivos = useEntradas((s) => s.objetivos);

  const resumen = abierto ? resumenComparacion(salida, objetivos, new Date()) : "";
  const mail = abierto ? linkMail(resumenMail(salida, objetivos)) : "";

  const opciones = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
  // El botón es el `Boton` común (no expone ref): se lo busca dentro de la raíz
  const enfocarBoton = () => raiz.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) enfocarBoton();
  }

  useEffect(() => {
    if (!abierto) return;
    opciones()[0]?.focus();
    const alClickAfuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cerrar();
    };
    document.addEventListener("pointerdown", alClickAfuera);
    window.addEventListener("keydown", alEscape, true);
    return () => {
      document.removeEventListener("pointerdown", alClickAfuera);
      window.removeEventListener("keydown", alEscape, true);
    };
  }, [abierto]);

  function alTeclaMenu(e: React.KeyboardEvent) {
    const items = opciones();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const ir = (j: number) => items[(j + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(items.length - 1);
    else if (e.key === "Tab") cerrar(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  async function copiar() {
    cerrar();
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(resumen);
      ok = true;
    } catch {
      ok = copiarConTextarea(resumen);
      // El textarea se lleva el foco: vuelve al botón
      enfocarBoton();
    }
    useToast.getState().mostrar(ok ? "Resumen copiado" : "No se pudo copiar");
  }

  return (
    <div ref={raiz} className={css.raiz}>
      <Boton
        variante="secundario"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
      >
        Compartir
      </Boton>
      {abierto && (
        <div ref={menu} id={idMenu} className={css.menu} role="menu" aria-label="Compartir la comparación" onKeyDown={alTeclaMenu}>
          <a
            role="menuitem"
            tabIndex={-1}
            className={css.opcion}
            href={mail}
            onClick={() => {
              // El mailto: no sale de la página: que no salte el aviso de recarga
              pausarAvisoRecarga();
              cerrar();
            }}
          >
            Enviar por mail
          </a>
          <button role="menuitem" tabIndex={-1} type="button" className={css.opcion} onClick={copiar}>
            Copiar resumen
          </button>
        </div>
      )}
    </div>
  );
}
