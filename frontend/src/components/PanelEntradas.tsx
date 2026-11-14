/**
 * Panel izquierdo: paso 1 (elegir lote) y entradas: rotación, objetivos, restricciones, datos del lote y mediciones. Persona 4.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function PanelEntradas() {
  return (
    <>
      <aside className="panel" aria-label="Datos del lote">
        <div className="scroll">
          <div className="brand"><b>Field Shift</b><span>Prototipo</span></div>
          <div className="onb-hd">
            <span className="kick">Paso 1 de 2 · tu caso</span>
            <h1>Contanos qué hacés hoy en tu lote</h1>
            <p>Elegí cómo marcar tu lote y cargá lo que hacés hoy. En el paso 2 lo ves en el mapa con los datos de NASA.</p>
          </div>
          <div className="entry" data-a="ent">
            <h3>¿Cómo marcás tu lote?</h3>
            <div className="opts" role="radiogroup">
              <button type="button" className="opt" role="radio" data-e="demo" aria-checked="true"><span className="ic" aria-hidden="true">◎</span><b>Usar el lote de ejemplo</b><span>Campo real cerca de Río Cuarto · 95 ha</span></button>
              <button type="button" className="opt" role="radio" data-e="draw" aria-checked="false"><span className="ic" aria-hidden="true">✎</span><b>Dibujar mi lote</b><span>Marcás las esquinas en el mapa · cualquier forma · mínimo 1 ha</span></button>
            </div>
          </div>
      
          <div className="lote">
            <h2 id="lote-t">Lote cerca de Río Cuarto</h2>
            <p id="lote-s">Tocá el mapa para mover el lote</p>
            <div className="seg2" role="radiogroup" aria-label="Cómo marcar el lote"><button type="button" role="radio" data-e="demo" aria-checked="true">Lote de ejemplo</button><button type="button" role="radio" data-e="draw" aria-checked="false" id="draw">Dibujar mi lote</button></div>
            <div className="facts">
              <div><div className="k">Superficie</div><div className="v num" id="f-ha">—</div></div>
              <div><div className="k">Pendiente</div><div className="v num" id="f-sl">—</div></div>
              <div><div className="k">Lluvia/año</div><div className="v num" id="f-pp">—</div></div>
            </div>
          </div>
      
          <div className="blk" data-a="rot">
            <h3>Rotación actual</h3>
            <div className="sel3">
              <label>Verano<select id="verano"><option value="soja">Soja</option><option value="maiz">Maíz</option><option value="girasol">Girasol</option><option value="sorgo">Sorgo</option><option value="mani">Maní</option></select></label>
              <label>Invierno<select id="invierno"><option value="barbecho">Barbecho</option><option value="trigo">Trigo</option><option value="cebada">Cebada</option><option value="vicia">Vicia</option><option value="centeno">Centeno</option></select></label>
              <label className="full">Verano de la campaña pasada<select id="pasada"><option value="soja">Soja</option><option value="maiz">Maíz</option><option value="girasol">Girasol</option><option value="sorgo">Sorgo</option><option value="mani">Maní</option></select></label>
            </div>
          </div>
      
          <div className="blk" data-a="obj">
            <h3>Objetivos</h3>
            <p className="hint">Cuánto te importa cada uno: 0 nada, 5 mucho.</p>
            <div id="sliders"></div>
          </div>
      
          <div className="blk" data-a="res">
            <h3>Restricciones</h3>
            <div className="chips">
              <button type="button" className="chip" aria-pressed="true" data-r="sinRiego">Sin riego</button>
              <button type="button" className="chip" aria-pressed="false" data-r="sinHacienda">Sin hacienda</button>
              <button type="button" className="chip" aria-pressed="false" data-r="maq">Maquinaria limitada</button>
            </div>
            <div className="sub">No sembrar</div>
            <div className="chips" id="nos"></div>
          </div>
      
          <details data-a="dl">
            <summary>Datos del lote</summary>
            <div className="sel3">
              <label>¿Se encharca?<select id="anegable"><option value="no">No</option><option value="a_veces">A veces</option><option value="si">Sí</option><option value="no_se">No sé</option></select></label>
              <label>Textura<select id="textura"><option value="franco">Franco</option><option value="arenoso">Arenoso</option><option value="arcilloso">Arcilloso</option><option value="no_se">No sé</option></select></label>
            </div>
          </details>
          <details data-a="mp">
            <summary>Mediciones propias</summary>
            <div className="sel3">
              <label>Pluviómetro (mm/año)<input type="number" id="lluvia" min="0" max="2000" step="10" placeholder="Ej. 820" /></label>
              <label>Materia orgánica (%)<input type="number" id="mo" min="0" max="10" step="0.1" placeholder="Ej. 1,8" /></label>
            </div>
          </details>
        </div>
        <div className="cta">
          <button type="button" className="btn" id="comparar">Ver mi lote en el mapa</button>
          <div className="note">Herramienta de apoyo. No reemplaza al agrónomo.</div>
        </div>
      </aside>
    </>
  );
}
