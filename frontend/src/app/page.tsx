"use client";

import AtajoEtapa from "@/components/comunes/AtajoEtapa";
import PantallaPendiente from "@/components/comunes/PantallaPendiente";
import Toast from "@/components/comunes/Toast";
// Persona 5: la hoja de resultados del prototipo. Se va cuando llegue el dashboard.
import HojaComparacion from "@/components/resultados/HojaComparacion";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import PantallaMarcar from "@/components/marcar/PantallaMarcar";
import BarraDibujo from "@/components/mapa/BarraDibujo";
import BuscadorMapa from "@/components/mapa/BuscadorMapa";
import Leyenda from "@/components/mapa/Leyenda";
import LineaTiempo from "@/components/mapa/LineaTiempo";
import MapaDinamico from "@/components/mapa/MapaDinamico";
import SelectorCapas from "@/components/mapa/SelectorCapas";
import { useApp } from "@/lib/app";

/**
 * Elige la pantalla según la etapa del flujo (`useApp`, DESIGN.md):
 * marcar → configurar → cargando → dashboard.
 *
 * Dueños (PLAN.md): marcar, configurar y cargando son de la persona 4; el
 * dashboard, de la persona 5 (con las secciones de Luca adentro).
 */
export default function Inicio() {
  const etapa = useApp((s) => s.etapa);
  return (
    <>
      <AtajoEtapa />
      {etapa === "cargando" && <PantallaPendiente etapa="cargando" />}
      {/* Dashboard (persona 5): acá va <Dashboard /> cuando llegue a dev */}
      {etapa === "dashboard" && <PantallaPendiente etapa="dashboard" />}
      {/* El mapa es uno solo para S1 y S2: así no se recarga al pasar de una a otra. */}
      {(etapa === "marcar" || etapa === "configurar") && <MapaDinamico />}
      {etapa === "marcar" && <PantallaMarcar />}
      {etapa === "configurar" && <PantallaPrototipo />}
      <Toast />
    </>
  );
}

/**
 * El panel y las herramientas del prototipo sobre el mapa, mientras llega S2
 * (PanelEntradas nuevo), y la hoja de resultados.
 */
function PantallaPrototipo() {
  return (
    <>
      <PanelEntradas />
      {/* `.tools`: herramientas flotantes del mapa: buscador, línea de tiempo y capas. */}
      <div className="tools">
        <BuscadorMapa />
        <LineaTiempo />
        <SelectorCapas />
      </div>
      <Leyenda />
      <BarraDibujo />
      <HojaComparacion />
    </>
  );
}
