/**
 * Barra para dibujar el lote marcando esquinas.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function BarraDibujo() {
  return (
    <>
      <div className="drawbar" id="drawbar" hidden role="status"><div className="tx"><b id="dw-a">Marcá las esquinas del lote</b><span id="dw-h">Tocá el mapa en cada esquina. Puede tener cualquier forma, por ejemplo una L.</span></div><button className="sm" id="dw-undo" type="button">Deshacer</button><button className="sm" id="dw-cancel" type="button">Cancelar</button><button className="sm pri" id="dw-ok" type="button" disabled>Listo</button></div>
    </>
  );
}
