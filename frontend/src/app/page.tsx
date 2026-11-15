"use client";

import ErrorAnalisis from "@/components/carga/ErrorAnalisis";
import PantallaCarga from "@/components/carga/PantallaCarga";
import AtajoEtapa from "@/components/comunes/AtajoEtapa";
import PantallaPendiente from "@/components/comunes/PantallaPendiente";
import Toast from "@/components/comunes/Toast";
// Persona 5: la hoja de resultados del prototipo. Se va cuando llegue el dashboard.
import HojaComparacion from "@/components/resultados/HojaComparacion";
import PanelEntradas from "@/components/entradas/PanelEntradas";
import BarraDibujo from "@/components/mapa/BarraDibujo";
import BuscadorMapa from "@/components/mapa/BuscadorMapa";
import Leyenda from "@/components/mapa/Leyenda";
import LineaTiempo from "@/components/mapa/LineaTiempo";
import MapaDinamico from "@/components/mapa/MapaDinamico";
import SelectorCapas from "@/components/mapa/SelectorCapas";
import { analizarLote, analizarLoteEjemplo, lugarDelLote } from "@/lib/analisis";
import { useApp } from "@/lib/app";
import { areaHa } from "@/lib/geo";
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
      {/* Dashboard (persona 5): acá va <Dashboard /> cuando llegue a dev */}
      {etapa === "dashboard" && <PantallaPendiente etapa="dashboard" />}
      {(etapa === "marcar" || etapa === "configurar") && <PantallaPrototipo />}
      {etapa === "configurar" && <ErrorDelAnalisis />}
      <Toast />
    </>
  );
}

/**
 * Las pantallas del prototipo, mientras llegan S1 (PantallaMarcar) y S2
 * (PanelEntradas nuevo): el mapa, el panel y la hoja de resultados.
 */
function PantallaPrototipo() {
  return (
    <>
      <MapaDinamico />
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

/** S3 · Carga: la superficie y el lugar salen de las entradas, sin pedir nada. */
function Carga() {
  const poligono = useEntradas((s) => s.poligono);
  const modoLote = useEntradas((s) => s.modoLote);
  const ubicacion = useEntradas((s) => s.ubicacion);
  const superficie = poligono.length >= 3 ? areaHa(poligono) : null;
  return <PantallaCarga superficieHa={superficie} lugar={lugarDelLote({ modoLote, poligono, ubicacion })} />;
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
        onEjemplo={analizarLoteEjemplo}
        onCerrar={cerrarError}
      />
    </div>
  );
}
