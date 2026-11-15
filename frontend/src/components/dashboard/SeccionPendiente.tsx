import css from "./SeccionPendiente.module.css";

/**
 * Lugar reservado de una sección del dashboard hasta que su dueño la monte
 * (Mapa y Clima histórico: Luca; Rotaciones: persona 5).
 */
export default function SeccionPendiente({ nombre }: { nombre: string }) {
  return (
    <div className={css.pendiente}>
      <p className={css.texto}>{nombre}: sección en construcción.</p>
    </div>
  );
}
