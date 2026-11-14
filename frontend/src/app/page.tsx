import ClaseBody from "@/components/comunes/ClaseBody";
import Toast from "@/components/comunes/Toast";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import BarraDibujo from "@/components/mapa/BarraDibujo";
import BuscadorMapa from "@/components/mapa/BuscadorMapa";
import MapaDinamico from "@/components/mapa/MapaDinamico";

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
      {/* `.tools`: herramientas flotantes del mapa (paso 2). El buscador va
          primero; la línea de tiempo y las capas se suman después, en este orden. */}
      <div className="tools">
        <BuscadorMapa />
      </div>
      <BarraDibujo />
      {/* Hoja de resultados (persona 5): <HojaComparacion /> va acá. */}
      <Toast />
    </>
  );
}
