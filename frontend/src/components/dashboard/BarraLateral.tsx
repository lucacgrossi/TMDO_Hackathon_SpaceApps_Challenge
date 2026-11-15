"use client";

import Image from "next/image";
import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import IconoPixel from "@/components/comunes/IconoPixel";
import type { Seccion } from "@/lib/app";
import { MENU_SECCIONES } from "@/lib/dashboard";
import css from "./BarraLateral.module.css";

interface Props {
  seccion: Seccion;
  onCambiarSeccion: (s: Seccion) => void;
  /** "Editar lote y entradas": vuelve a `configurar` sin perder el resultado. */
  onEditar: () => void;
  /** `lote.localidad_aprox`; null = no se muestra. */
  lugar: string | null;
}

/**
 * Barra lateral del dashboard (`--noche`, 232 px): logo, las 3 secciones,
 * "Editar lote y entradas" y el aviso de apoyo, siempre visible (RF22).
 * En celular pasa a una barra inferior fija (ver el CSS).
 */
export default function BarraLateral({ seccion, onCambiarSeccion, onEditar, lugar }: Props) {
  return (
    <aside className={css.barra}>
      <Image
        className={css.logo}
        src="/img/agropixel-logo.png"
        alt="AgroPixel"
        width={200}
        height={154}
        priority
      />
      <nav className={css.nav} aria-label="Secciones del análisis">
        <ul className={css.lista}>
          {MENU_SECCIONES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={css.item}
                aria-current={s.id === seccion ? "page" : undefined}
                onClick={() => onCambiarSeccion(s.id)}
              >
                <IconoPixel nombre={s.icono} className={css.icono} />
                {s.menu}
              </button>
            </li>
          ))}
        </ul>
        <div className={css.separador} role="presentation" />
        <button type="button" className={css.item} onClick={onEditar}>
          <IconoPixel nombre="editar" className={css.icono} />
          Editar lote y entradas
        </button>
      </nav>
      <div className={css.relleno} />
      {lugar && <p className={css.lugar}>{lugar}</p>}
      <AvisoApoyo tono="oscuro" className={css.aviso} />
    </aside>
  );
}
