"use client";

import { useRef, useState } from "react";
import { leerPlanilla, resumenPlanilla, URL_PLANTILLA } from "@/lib/planilla";
import { useEntradas } from "@/lib/store";

/**
 * RF26 · "Subir planilla (CSV)" dentro de Mediciones propias, con la vista
 * previa y el link "Descargar plantilla" (`docs/plan-planilla-lluvia.md` 4.2).
 *
 * Flujo: el productor elige el archivo → `leerPlanilla()` → vista previa
 * ("Lluvia: 6 campañas completas (2018/19 a 2023/24) · …"), con los avisos y
 * errores por fila. Si sale bien, queda en `useEntradas.mediciones.planilla`;
 * si trae lluvia, el campo manual del pluviómetro se deshabilita
 * (lo hace SeccionMediciones). "Quitar planilla" vuelve a la carga a mano.
 *
 * Con la API conectada, `leerPlanilla()` manda el archivo al back. Con el mock
 * devuelve una respuesta de ejemplo y la vista previa avisa en grande que NO es
 * el contenido del archivo.
 */
export default function SubirPlanilla() {
  const planilla = useEntradas((s) => s.mediciones.planilla);
  const cambiar = useEntradas((s) => s.cambiar);
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);

  const guardar = (p: typeof planilla) => {
    // Leer lo último del store para no pisar los otros campos de mediciones.
    const actual = useEntradas.getState().mediciones;
    cambiar({ mediciones: { ...actual, planilla: p } });
  };

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setLeyendo(true);
    try {
      const resultado = await leerPlanilla(archivo);
      guardar({ nombre: archivo.name, resultado });
    } finally {
      setLeyendo(false);
      // Vaciar el input: así se puede volver a elegir el mismo archivo.
      if (input.current) input.current.value = "";
    }
  };

  const r = planilla?.resultado;

  return (
    <div className="planilla">
      <div className="planilla-acc">
        <button type="button" className="sm" onClick={() => input.current?.click()} disabled={leyendo}>
          {leyendo ? "Leyendo…" : planilla ? "Cambiar planilla (CSV)" : "Subir planilla (CSV)"}
        </button>
        {/* download: el navegador la baja en vez de abrirla. */}
        <a className="planilla-link" href={URL_PLANTILLA} download="plantilla-mediciones.csv">
          Descargar plantilla
        </a>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.txt"
          hidden
          onChange={(e) => elegir(e.currentTarget.files?.[0])}
          aria-label="Planilla CSV con tu registro de lluvia y temperaturas"
        />
      </div>
      <small className="wsrc">
        Tu registro diario o mensual de lluvia y, si tenés estación, de temperaturas mínima y máxima. Excel y Google
        Sheets lo exportan como CSV.
      </small>

      {planilla && r && (
        <div className="planilla-prev" role="status">
          {r.ejemplo && (
            // Nada inventado: con el mock (sin backend), la vista
            // previa es un EJEMPLO y no lo que trae el archivo.
            <p className="planilla-ej">
              Vista previa de ejemplo: la app está con datos de prueba, sin backend, y no leyó el archivo. Estos
              números no son de tu planilla.
            </p>
          )}
          <b>{planilla.nombre}</b>
          {r.ok && r.serie ? (
            <>
              <ul>
                {resumenPlanilla(r.serie).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {r.serie.avisos.length > 0 && (
                <details>
                  <summary>Ver avisos ({r.serie.avisos.length})</summary>
                  <ul>
                    {r.serie.avisos.map((a, i) => (
                      <li key={i}>{a.fila != null ? `Fila ${a.fila}: ${a.motivo}` : a.motivo}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <>
              <p className="planilla-err">No se pudo usar la planilla. Podés corregirla o seguir con la carga a mano.</p>
              <ul>
                {r.errores.map((a, i) => (
                  <li key={i}>{a.fila != null ? `Fila ${a.fila}: ${a.motivo}` : a.motivo}</li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="sm" onClick={() => guardar(null)}>
            Quitar planilla
          </button>
        </div>
      )}
    </div>
  );
}
