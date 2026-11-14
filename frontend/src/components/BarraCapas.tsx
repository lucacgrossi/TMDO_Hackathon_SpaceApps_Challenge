/**
 * Línea de tiempo y selector de capas (vista aérea, vegetación, pendiente, lluvia y heladas). Persona 4.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function BarraCapas() {
  return (
    <>
      <div className="tools">
        <div className="timeline" id="timeline" hidden></div>
        <div className="layers" role="group" aria-label="Capas">
          <button type="button" aria-pressed="true" data-ly="sat" title="Imagen satelital de fondo">Vista aérea</button>
          <button type="button" aria-pressed="false" data-ly="ndvi" title="Qué tan cubierto de vegetación está cada lote, mes a mes (NDVI de NASA)">Vegetación</button>
          <button type="button" aria-pressed="false" data-ly="slope" title="Inclinación del terreno dentro del lote: más pendiente, más riesgo de erosión">Pendiente</button>
          <button type="button" aria-pressed="false" data-ly="clima" title="Lluvia, temperaturas y heladas de cada mes (30 campañas de NASA)">Lluvia y heladas</button>
        </div>
      </div>
    </>
  );
}
