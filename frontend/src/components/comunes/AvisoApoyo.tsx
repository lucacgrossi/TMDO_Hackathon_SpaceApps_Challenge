import estilos from "./AvisoApoyo.module.css";

interface Props {
  /** "oscuro" sobre la barra lateral (`--noche`); "claro" sobre papel o en el PDF. */
  tono?: "claro" | "oscuro";
  className?: string;
}

/** RF22: aviso de apoyo, siempre visible y sin botón de cerrar (DESIGN.md, principio 5). */
export default function AvisoApoyo({ tono = "claro", className }: Props) {
  return (
    <p role="note" className={`${estilos.aviso} ${estilos[tono]} ${className ?? ""}`}>
      <b>Herramienta de apoyo:</b> no reemplaza el criterio del productor ni del agrónomo.
    </p>
  );
}
