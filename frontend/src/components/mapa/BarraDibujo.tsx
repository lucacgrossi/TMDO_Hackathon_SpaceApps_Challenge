"use client";

import Boton from "@/components/comunes/Boton";
import { evaluar, textosBarra, useDibujo } from "@/lib/dibujo";
import estilos from "./BarraDibujo.module.css";

/**
 * F5 · Barra de dibujo del lote, abajo al centro del mapa (DESIGN.md, S1):
 * cuánto va marcado y qué hacer, y los botones Deshacer, Cancelar y Listo.
 *
 * Está fuera del mapa (es parte de la interfaz, no del mapa); habla con la
 * capa del mapa (CapaDibujo) a través del store `useDibujo`.
 */
export default function BarraDibujo() {
  const dibujando = useDibujo((s) => s.dibujando);
  const puntos = useDibujo((s) => s.puntos);
  const deshacer = useDibujo((s) => s.deshacer);
  const cancelar = useDibujo((s) => s.cancelar);
  const terminar = useDibujo((s) => s.terminar);

  if (!dibujando) return null;

  const { titulo, ayuda, error } = textosBarra(puntos);
  const { valido, n } = evaluar(puntos);

  return (
    // role="status": el lector de pantalla anuncia los cambios de texto (ej. "Muy chico").
    <div className={estilos.barra} role="status">
      <div className={estilos.textos}>
        <b>{titulo}</b>
        <span className={error ? estilos.error : undefined}>{ayuda}</span>
      </div>
      <div className={estilos.botones}>
        <Boton variante="fantasma" onClick={deshacer} disabled={n === 0}>
          Deshacer
        </Boton>
        <Boton variante="secundario" onClick={cancelar}>
          Cancelar
        </Boton>
        {/* "Listo" se habilita con 3 esquinas o más y un lote válido (1 a 20.000 ha, sin cruces). */}
        <Boton variante="primario" onClick={terminar} disabled={!valido}>
          Listo
        </Boton>
      </div>
    </div>
  );
}
