"use client";

import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import { useEntradas } from "@/lib/store";
import ElegirLote from "./ElegirLote";
import ResumenLote from "./ResumenLote";
import SeccionDatosLote from "./SeccionDatosLote";
import SeccionMediciones from "./SeccionMediciones";
import SeccionObjetivos from "./SeccionObjetivos";
import SeccionRestricciones from "./SeccionRestricciones";
import SeccionRotacion from "./SeccionRotacion";

/**
 * Panel izquierdo (pantallas 2 a 4 del MVP juntas, como el prototipo).
 * En el paso 1 el CSS (body.onb) lo muestra centrado y en dos columnas;
 * en el paso 2 queda a la derecha del mapa. Cada sección es su propio
 * archivo para que las ramas de cada feature no se pisen.
 *
 * F1 (paso 1 y paso al mapa) completa el botón: hoy solo cambia de paso.
 */
export default function PanelEntradas() {
  const paso = useEntradas((s) => s.paso);
  const cambiar = useEntradas((s) => s.cambiar);

  return (
    <aside className="panel" aria-label="Datos del lote">
      <div className="scroll">
        <div className="brand">
          <b>Field Shift</b>
          <span>Prototipo</span>
        </div>
        <div className="onb-hd">
          <span className="kick">Paso 1 de 2 · tu caso</span>
          <h1>Contanos qué hacés hoy en tu lote</h1>
          <p>
            Elegí cómo marcar tu lote y cargá lo que hacés hoy. En el paso 2 lo ves en el mapa con
            los datos de NASA.
          </p>
        </div>
        <ElegirLote />
        <ResumenLote />
        <SeccionRotacion />
        <SeccionObjetivos />
        <SeccionRestricciones />
        <SeccionDatosLote />
        <SeccionMediciones />
      </div>
      <div className="cta">
        <button
          type="button"
          className="btn"
          id="comparar"
          onClick={() => paso === "inicio" && cambiar({ paso: "mapa" })}
        >
          {paso === "inicio" ? "Ver mi lote en el mapa" : "Comparar alternativas"}
        </button>
        <AvisoApoyo />
      </div>
    </aside>
  );
}
