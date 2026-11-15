"use client";

import { useShallow } from "zustand/react/shallow";
import ErrorAnalisis from "@/components/carga/ErrorAnalisis";
import PantallaCarga from "@/components/carga/PantallaCarga";
import AtajoEtapa from "@/components/comunes/AtajoEtapa";
import Toast from "@/components/comunes/Toast";
import Dashboard from "@/components/dashboard/Dashboard";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import PantallaMarcar from "@/components/marcar/PantallaMarcar";
import MapaDinamico from "@/components/mapa/MapaDinamico";
import { analizarLote, lugarDelLote } from "@/lib/analisis";
import { useApp } from "@/lib/app";
import { cambiosDesdeLaComparacion, useComparacion } from "@/lib/comparacion";
import { areaHa } from "@/lib/geo";
import { useSalidaDashboard } from "@/lib/salidaDashboard";
import { useEntradas } from "@/lib/store";
import estilos from "./page.module.css";

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
      {etapa === "cargando" && <Carga />}
      {etapa === "dashboard" && <DashboardDelAnalisis />}
      {/* El mapa es uno solo para S1 y S2: así no se recarga al pasar de una a otra. */}
      {(etapa === "marcar" || etapa === "configurar") && <MapaDinamico />}
      {etapa === "marcar" && <PantallaMarcar />}
      {etapa === "configurar" && <PanelEntradas />}
      {etapa === "configurar" && <ErrorDelAnalisis />}
      <Toast />
    </>
  );
}

/** S3 · Carga: la superficie y el lugar salen de las entradas, sin pedir nada. */
function Carga() {
  const poligono = useEntradas((s) => s.poligono);
  const ubicacion = useEntradas((s) => s.ubicacion);
  const superficie = poligono.length >= 3 ? areaHa(poligono) : null;
  return <PantallaCarga superficieHa={superficie} lugar={lugarDelLote({ ubicacion })} />;
}

/**
 * Dashboard con la última respuesta de /analizar. `desactualizado`: las
 * entradas cambiaron desde la foto del análisis (los objetivos no cuentan:
 * la cercanía se recalcula sola, RF13).
 */
function DashboardDelAnalisis() {
  const seccion = useApp((s) => s.seccion);
  const irA = useApp((s) => s.irA);
  const volverAEditar = useApp((s) => s.volverAEditar);
  const salida = useSalidaDashboard();
  const foto = useComparacion((s) => s.foto);
  const cambios = useEntradas(useShallow((s) => (foto ? cambiosDesdeLaComparacion(foto, s) : [])));
  if (!salida) return null;
  return (
    <Dashboard
      seccion={seccion}
      onCambiarSeccion={irA}
      onEditar={volverAEditar}
      salida={salida}
      desactualizado={cambios.length > 0}
    />
  );
}

/** S3b · Error de /analizar sobre el mapa, al lado del panel, hasta que se cierre o se elija cómo seguir. */
function ErrorDelAnalisis() {
  const error = useApp((s) => s.error);
  const volverAMarcar = useApp((s) => s.volverAMarcar);
  const cerrarError = useApp((s) => s.cerrarError);
  if (!error) return null;
  return (
    <div className={estilos.capaError}>
      <ErrorAnalisis
        codigo={error.estado ?? 0}
        mensaje={error.mensaje}
        deLaApp={error.deLaApp}
        onMarcarOtro={volverAMarcar}
        onReintentar={analizarLote}
        onCerrar={cerrarError}
      />
    </div>
  );
}
