/**
 * Intro animada (paso 0): foto de campo con nubes; se va sola a los 3,5 s.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function Intro() {
  return (
    <>
      <div id="intro" aria-hidden="true" hidden><div className="ph"></div><div className="oc oc1"></div><div className="sky" id="sky"></div><div className="sun"></div><div className="vg"></div><div className="cr">Nubes: Berrucomons, CC BY-SA 3.0 · Campo: Seba864, dominio público (Wikimedia Commons)</div><div className="wm"><b>Field Shift</b><span>Datos de NASA para decidir la rotación de tu lote</span></div></div>
    </>
  );
}
