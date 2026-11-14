import type { ReactNode } from "react";
import AvisoApoyo from "./AvisoApoyo";

/**
 * Hoja de resultados que sube desde abajo (DESIGN.md: alto min(56vh, 560px),
 * entre el panel y el borde, 450 ms). El contenido (tabla de 4 columnas)
 * lo arma la persona 5 en front-tabla.
 */
export default function HojaResultados({
  abierta,
  onCerrar,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label="Comparación de rotaciones"
      aria-hidden={!abierta}
      className={`flex flex-col bg-panel shadow-panel backdrop-blur transition-transform duration-[450ms] ease-suave
                  max-[900px]:w-full ${abierta ? "" : "max-[900px]:hidden"}
                  min-[901px]:absolute min-[901px]:bottom-4 min-[901px]:left-[372px] min-[901px]:right-4
                  min-[901px]:z-[1000] min-[901px]:h-[min(56vh,560px)] min-[901px]:rounded-panel
                  ${abierta ? "min-[901px]:translate-y-0" : "min-[901px]:translate-y-[calc(100%+32px)]"}`}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-bold">Rotación actual y 3 alternativas</h2>
        <button
          type="button"
          onClick={onCerrar}
          tabIndex={abierta ? 0 : -1}
          className="rounded-[10px] px-3 py-1 text-[12px] font-semibold text-muted hover:bg-soft"
        >
          Cerrar
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {children ?? <p className="text-[12px] text-muted">Acá va la tabla comparativa.</p>}
      </div>
      <footer className="border-t border-line px-4 py-2">
        <AvisoApoyo />
      </footer>
    </section>
  );
}
