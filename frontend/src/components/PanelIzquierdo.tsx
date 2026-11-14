import AvisoApoyo from "./AvisoApoyo";
import SeccionPanel from "./SeccionPanel";

/**
 * Panel de entradas (pantallas 2 a 4 del MVP juntas, como el prototipo).
 * Cada sección se completa en su rama: front-mapa-lote, front-rotacion
 * y front-objetivos.
 */
export default function PanelIzquierdo({ onComparar }: { onComparar: () => void }) {
  return (
    <aside
      className="flex flex-col overflow-hidden bg-panel shadow-panel backdrop-blur
                 max-[900px]:w-full
                 min-[901px]:absolute min-[901px]:bottom-4 min-[901px]:left-4 min-[901px]:top-4
                 min-[901px]:z-[1000] min-[901px]:w-[340px] min-[901px]:rounded-panel"
      aria-label="Datos del lote"
    >
      <header className="px-4 pb-2 pt-4">
        <p className="text-[20px] font-black tracking-tight">Field Shift</p>
        <p className="text-[12px] text-muted">
          Compará rotaciones para un lote con 20 a 30 años de observaciones de NASA.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <SeccionPanel titulo="Lote">
          <p className="text-[12px] text-muted">Marcá el lote en el mapa.</p>
        </SeccionPanel>
        <SeccionPanel titulo="Rotación actual">
          <p className="text-[12px] text-muted">Cultivo de verano, de invierno y campaña pasada.</p>
        </SeccionPanel>
        <SeccionPanel titulo="Objetivos">
          <p className="text-[12px] text-muted">Agua, suelo, erosión e ingreso, de 0 a 5.</p>
        </SeccionPanel>
        <SeccionPanel titulo="Restricciones">
          <p className="text-[12px] text-muted">Sin riego, sin hacienda, maquinaria limitada, no sembrar.</p>
        </SeccionPanel>
      </div>

      <footer className="space-y-2 border-t border-line p-4">
        <button
          type="button"
          onClick={onComparar}
          className="w-full rounded-[12px] bg-accent px-4 py-3 font-bold text-accent-ink transition hover:opacity-90"
        >
          Comparar alternativas
        </button>
        <AvisoApoyo />
      </footer>
    </aside>
  );
}
