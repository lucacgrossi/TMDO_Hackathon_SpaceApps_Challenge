"use client";

import { useEffect, useId, useRef, useState } from "react";
import { linkMail, resumenComparacion, resumenMail } from "@/lib/compartir";
import type { Salida } from "@/lib/contrato";
import { useEntradas } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useVista } from "@/lib/vista";
import css from "./compartir.module.css";

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
 * Menú Compartir del encabezado de la hoja (RF20, CU5): el `.menu` del prototipo.
 * - Enviar por mail: `mailto:` con la versión corta (`resumenMail`), para que
 *   el link no pase de `LARGO_MAX_MAILTO` y Outlook no lo corte.
 * - Copiar resumen: el resumen completo al portapapeles, con aviso.
 * - Guardar PDF: `window.print()`; la hoja de impresión está en compartir.module.css.
 * - Nueva comparación: vuelve al paso 1 con las entradas iniciales.
 *
 * Teclado: Enter o flecha abajo abre y enfoca la primera opción; flechas,
 * Inicio y Fin recorren; Escape cierra y devuelve el foco al botón.
 * Sin `salida` (cargando o error) solo queda "Nueva comparación".
 */
export default function MenuCompartir({ salida }: { salida: Salida | null }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const objetivos = useEntradas((s) => s.objetivos);
  const reiniciar = useEntradas((s) => s.reiniciar);
  const cerrarHoja = useVista((s) => s.cerrarHoja);

  // El texto se arma con las barras actuales: si se mueven, el resumen cambia (RF13)
  const resumen = salida && abierto ? resumenComparacion(salida, objetivos, new Date()) : "";
  const mail = salida && abierto ? linkMail(resumenMail(salida, objetivos)) : "";

  const opciones = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;
    opciones()[0]?.focus();
    const alClickAfuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar(false);
    };
    // Escape en captura: cierra el menú sin cerrar también la hoja (que escucha Escape en window)
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
      boton.current?.focus();
    }
    useToast.getState().mostrar(ok ? "Resumen copiado" : "No se pudo copiar");
  }

  function imprimir() {
    cerrar();
    window.print();
  }

  function nuevaComparacion() {
    setAbierto(false);
    cerrarHoja();
    reiniciar();
  }

  return (
    <div ref={raiz} className={css.raiz}>
      <button
        ref={boton}
        type="button"
        className="ghost"
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
      </button>
      {abierto && (
        <div ref={menu} id={idMenu} className="menu" role="menu" aria-label="Compartir la comparación" onKeyDown={alTeclaMenu}>
          {salida && (
            <>
              <a role="menuitem" tabIndex={-1} href={mail} onClick={() => cerrar()}>
                Enviar por mail
              </a>
              <button role="menuitem" tabIndex={-1} type="button" onClick={copiar}>
                Copiar resumen
              </button>
              <button role="menuitem" tabIndex={-1} type="button" onClick={imprimir}>
                Guardar PDF
              </button>
              <hr className={css.separador} />
            </>
          )}
          <button role="menuitem" tabIndex={-1} type="button" onClick={nuevaComparacion}>
            Nueva comparación
          </button>
        </div>
      )}
    </div>
  );
}
