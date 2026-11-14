/**
 * Hoja de resultados: rotación actual y 3 alternativas. Persona 5.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function HojaComparacion() {
  return (
    <>
      <section className="sheet" id="sheet" aria-label="Comparación">
        <header>
          <h2>Rotación actual y 3 alternativas</h2>
          <span className="meta" id="sheet-meta"></span>
          <div className="sp">
            <button type="button" className="ghost" id="share">Compartir</button>
            <button type="button" className="ghost" id="close" aria-label="Cerrar comparación">Cerrar</button>
            <div className="menu" id="menu" hidden>
              <a id="mailto" href="#">Enviar por mail</a>
              <button type="button" id="copy">Copiar resumen</button>
              <button type="button" id="print">Guardar PDF</button>
            </div>
          </div>
        </header>
        <div className="clash" id="clash" hidden></div>
        <div id="serie"></div>
        <div className="lgd" id="lgd"></div>
        <div className="cards" id="cards"></div>
        <div className="foot"><span>Compara datos: no indica qué hacer. Decide el productor con su agrónomo.</span><span>Capas de NASA reales · puntajes de las alternativas ilustrativos (prototipo)</span></div>
      </section>
    </>
  );
}
