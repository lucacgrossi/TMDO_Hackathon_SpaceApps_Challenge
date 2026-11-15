import type { ButtonHTMLAttributes } from "react";
import type { NombreIcono } from "@/lib/pixel";
import estilos from "./Boton.module.css";
import IconoPixel from "./IconoPixel";

export type VarianteBoton = "primario" | "secundario" | "fantasma";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Primario: una sola acción principal por pantalla (DESIGN.md). */
  variante?: VarianteBoton;
  icono?: NombreIcono;
  /** "completo" ocupa todo el ancho del contenedor (el pie del panel). */
  ancho?: "auto" | "completo";
}

/**
 * Botón de la app (Figma: Botón · Primario, Secundario, Fantasma).
 * Sin flechas en la etiqueta: el verbo describe la acción ("Analizar lote").
 *
 * El primario tiene esquinas escalonadas (`clip-path`) y sombra pixel. Como
 * `clip-path` recorta la sombra y el contorno de foco, los dos van en un
 * envoltorio que no se recorta.
 */
export default function Boton({
  variante = "secundario",
  icono,
  ancho = "auto",
  className,
  children,
  type = "button",
  ...resto
}: Props) {
  const clases = [estilos.boton, estilos[variante], ancho === "completo" ? estilos.completo : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const boton = (
    <button type={type} className={clases} {...resto}>
      {icono && <IconoPixel nombre={icono} />}
      {children}
    </button>
  );
  if (variante !== "primario") return boton;
  return <span className={`${estilos.marco} ${ancho === "completo" ? estilos.completo : ""}`}>{boton}</span>;
}
