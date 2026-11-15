"use client";

import Image from "next/image";
import { SECCIONES, type Seccion } from "@/lib/dashboard";
import css from "./BarraLateral.module.css";

interface Props {
  seccion: Seccion;
  onCambiarSeccion: (s: Seccion) => void;
  /** "Editar lote y entradas": vuelve a `configurar` sin perder el resultado. */
  onEditar: () => void;
  /** Aviso de apoyo, tal cual lo manda el back (`Salida.aviso`). */
  aviso: string;
  /** `lote.localidad_aprox`; null = no se muestra. */
  lugar: string | null;
}

/**
 * Barra lateral del dashboard (`--noche`, 232 px): logo, las 3 secciones,
 * "Editar lote y entradas" y el aviso de apoyo, siempre visible (RF22).
 * En celular pasa a una barra inferior fija (ver el CSS).
 *
 * Los íconos son un marcador hasta que llegue `IconoPixel` (paso 0 de persona 4).
 */
export default function BarraLateral({ seccion, onCambiarSeccion, onEditar, aviso, lugar }: Props) {
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
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={css.item}
                aria-current={s.id === seccion ? "page" : undefined}
                onClick={() => onCambiarSeccion(s.id)}
              >
                <span className={css.icono} aria-hidden="true" />
                {s.menu}
              </button>
            </li>
          ))}
        </ul>
        <div className={css.separador} role="presentation" />
        <button type="button" className={css.item} onClick={onEditar}>
          <span className={css.icono} aria-hidden="true" />
          Editar lote y entradas
        </button>
      </nav>
      <div className={css.relleno} />
      {lugar && <p className={css.lugar}>{lugar}</p>}
      <p className={css.aviso}>{aviso}</p>
    </aside>
  );
}
