import ClaseBody from "@/components/comunes/ClaseBody";
import Toast from "@/components/comunes/Toast";
// Persona 5: la hoja de resultados. El import va acá, lejos de los de la persona 4, para no chocar en los merges
import HojaComparacion from "@/components/resultados/HojaComparacion";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import BarraDibujo from "@/components/mapa/BarraDibujo";
import BuscadorMapa from "@/components/mapa/BuscadorMapa";
import Leyenda from "@/components/mapa/Leyenda";
import LineaTiempo from "@/components/mapa/LineaTiempo";
import MapaDinamico from "@/components/mapa/MapaDinamico";
import SelectorCapas from "@/components/mapa/SelectorCapas";

/**
 * Pantalla única, como el prototipo: el mapa de fondo, el panel de entradas
 * y, en el paso 2, la hoja de resultados.
 *
 * Dueños: todo lo de acá es de la persona 4, salvo la hoja de resultados
 * (persona 5), que se monta en el lugar marcado abajo.
 */
export default function Inicio() {
  return (
    <>
      <ClaseBody />
      <MapaDinamico />
      <div className="onb-bg" aria-hidden="true" />
      <PanelEntradas />
      {/* `.tools`: herramientas flotantes del mapa (paso 2), en el orden del
          prototipo: buscador, línea de tiempo (solo con capas por mes) y capas. */}
      <div className="tools">
        <BuscadorMapa />
        <LineaTiempo />
        <SelectorCapas />
      </div>
      <Leyenda />
      <BarraDibujo />
      {/* Hoja de resultados (persona 5) */}
      <HojaComparacion />
      <Toast />
    </>
  );
}
