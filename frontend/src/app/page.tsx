"use client";

import AtajoEtapa from "@/components/comunes/AtajoEtapa";
import PantallaPendiente from "@/components/comunes/PantallaPendiente";
import Toast from "@/components/comunes/Toast";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import PantallaMarcar from "@/components/marcar/PantallaMarcar";
import MapaDinamico from "@/components/mapa/MapaDinamico";
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
      {etapa === "configurar" && <PanelEntradas />}
      <Toast />
    </>
  );
}
