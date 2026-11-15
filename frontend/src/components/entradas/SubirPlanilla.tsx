"use client";

import { useRef, useState } from "react";
import {
  esPlantillaDeEjemplo,
  leerPlanilla,
  resumenPlanilla,
  URL_PLANTILLA,
  type AvisoFila,
  type ResultadoPlanilla,
} from "@/lib/planilla";
import Boton from "@/components/comunes/Boton";
import { useEntradas } from "@/lib/store";
import estilos from "./SubirPlanilla.module.css";

/**
 * RF26 · "Subir planilla (CSV)" dentro de Mediciones propias, con la vista
 * previa y el link "Descargar plantilla" (`docs/plan-planilla-lluvia.md` 4.2).
 *
 * Flujo: el productor elige el archivo → `leerPlanilla()` → vista previa
 * ("Lluvia: 6 campañas completas (2018/19 a 2023/24) · …"), con los avisos y
 * errores por fila. Las mediciones se cargan solo por planilla: no hay carga a
 * mano. Si sale bien, queda en `useEntradas.mediciones.planilla`; "Quitar
 * planilla" la saca y el análisis sigue solo con NASA.
 *
 * Un archivo que falla no borra la planilla válida anterior: el error se
 * muestra aparte (`fallo`) y la anterior sigue cargada hasta que llegue otra
 * válida. Si el que falla es el servidor, el texto lo dice y no pide corregir
 * el archivo (H-024).
 *
 * Con la API conectada, `leerPlanilla()` manda el archivo al back. Con el mock
 * devuelve una respuesta de ejemplo y la vista previa avisa en grande que NO es
 * el contenido del archivo.
 */
/** La plantilla subida tal cual: sus números son de ejemplo, no del productor. */
const PLANTILLA_SIN_CAMBIOS: AvisoFila = {
  fila: null,
  motivo:
    "Es la plantilla con los 12 meses de ejemplo, sin cambios: esos números no son mediciones de tu lote. Reemplazalos por tus datos y volvé a subirla.",
};

interface Props {
  /** Abre el modal "Formato de la planilla" (S2b). Sin esto, el botón no se muestra. */
  alVerFormato?: () => void;
}

/** Zona de planilla CSV (Figma: Vacía · Cargada): soltar el archivo o elegirlo. */
export default function SubirPlanilla({ alVerFormato }: Props) {
  const planilla = useEntradas((s) => s.mediciones.planilla);
  const cambiar = useEntradas((s) => s.cambiar);
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [encima, setEncima] = useState(false);
  /** Último archivo que no se pudo usar. No toca la planilla válida del store. */
  const [fallo, setFallo] = useState<{ nombre: string; resultado: ResultadoPlanilla } | null>(null);

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
      if (resultado.ok && resultado.serie && esPlantillaDeEjemplo(resultado.serie)) {
        // Nada inventado: los 12 meses de la plantilla no son mediciones del productor.
        const rechazo = { ...resultado, ok: false, serie: null, errores: [PLANTILLA_SIN_CAMBIOS] };
        setFallo({ nombre: archivo.name, resultado: rechazo });
      } else if (resultado.ok) {
        guardar({ nombre: archivo.name, resultado });
        setFallo(null);
      } else {
        setFallo({ nombre: archivo.name, resultado });
      }
    } finally {
      setLeyendo(false);
      // Vaciar el input: así se puede volver a elegir el mismo archivo.
      if (input.current) input.current.value = "";
    }
  };

  const r = planilla?.resultado;

  return (
    <div className={estilos.planilla}>
      <div
        className={estilos.zona}
        data-encima={encima}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          elegir(e.dataTransfer.files?.[0]);
        }}
      >
        <p className={estilos.titulo}>{planilla ? "Soltá otra planilla para cambiarla" : "Soltá acá tu planilla CSV"}</p>
        <p className={estilos.texto}>
          Tu registro diario o mensual de lluvia y, si tenés estación, de temperaturas mínima y máxima, con al menos
          12 meses. Hasta 1 MB. La plantilla trae 12 meses de ejemplo: reemplazalos por tus datos.
        </p>
        <div className={estilos.acciones}>
          <Boton variante="secundario" onClick={() => input.current?.click()} disabled={leyendo}>
            {leyendo ? "Leyendo…" : planilla ? "Elegir otro archivo" : "Elegir archivo"}
          </Boton>
          {alVerFormato && (
            <Boton variante="fantasma" onClick={alVerFormato}>
              Ver formato del archivo
            </Boton>
          )}
          {/* download: el navegador la baja en vez de abrirla. */}
          <a className={estilos.link} href={URL_PLANTILLA} download="plantilla-mediciones.csv">
            Descargar plantilla
          </a>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.txt"
          hidden
          onChange={(e) => elegir(e.currentTarget.files?.[0])}
          aria-label="Planilla CSV con tu registro de lluvia y temperaturas"
        />
      </div>

      {fallo && (
        <div className={estilos.vista} role="alert">
          <b>{fallo.nombre}</b>
          {fallo.resultado.sinServidor ? (
            <>
              <p className={estilos.error}>No se pudo revisar el archivo: el servidor no responde.</p>
              <p className={estilos.detalle}>{fallo.resultado.errores[0]?.motivo}</p>
            </>
          ) : (
            <>
              <p className={estilos.error}>No se pudo usar esta planilla. Corregila y volvé a subirla.</p>
              <ListaFilas avisos={fallo.resultado.errores} />
            </>
          )}
          {planilla && <p className={estilos.detalle}>Sigue cargada la planilla anterior: {planilla.nombre}.</p>}
          <Boton variante="fantasma" onClick={() => setFallo(null)}>
            Cerrar aviso
          </Boton>
        </div>
      )}

      {planilla && r?.ok && r.serie && (
        <div className={estilos.vista} role="status">
          {r.ejemplo && (
            // Nada inventado: con el mock (sin backend), la vista
            // previa es un EJEMPLO y no lo que trae el archivo.
            <p className={estilos.ejemplo}>
              Vista previa de ejemplo: la app está con datos de prueba, sin backend, y no leyó el archivo. Estos
              números no son de tu planilla.
            </p>
          )}
          <b>{planilla.nombre}</b>
          <ul>
            {resumenPlanilla(r.serie).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {r.serie.avisos.length > 0 && (
            <details className={estilos.avisos}>
              <summary>Ver avisos ({r.serie.avisos.length})</summary>
              <ListaFilas avisos={r.serie.avisos} />
            </details>
          )}
          <Boton
            variante="fantasma"
            onClick={() => {
              guardar(null);
              setFallo(null);
            }}
          >
            Quitar planilla
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Avisos o errores del parser, con su fila cuando la tienen. Los textos del back se muestran tal cual. */
function ListaFilas({ avisos }: { avisos: AvisoFila[] }) {
  return (
    <ul>
      {avisos.map((a, i) => (
        <li key={i}>{a.fila != null ? `Fila ${a.fila}: ${a.motivo}` : a.motivo}</li>
      ))}
    </ul>
  );
}
