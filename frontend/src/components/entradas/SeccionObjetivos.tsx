/**
 * F7 · 4 barras de 0 a 5, por defecto 3 (RF4).
 * Pieza vacía creada en F0: la completa la rama de esa feature
 * (ver el plan de la persona 4). Mantener las clases del prototipo.
 */
export default function SeccionObjetivos() {
  return (
    <div className="blk" data-a="obj">
      <h3>Objetivos</h3>
      <p className="hint">Cuánto te importa cada uno: 0 nada, 5 mucho.</p>
    </div>
  );
}
