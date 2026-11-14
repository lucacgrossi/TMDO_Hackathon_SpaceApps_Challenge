"use client";

import { useEffect } from "react";
import Intro from "@/components/Intro";
import MapaFondo from "@/components/MapaFondo";
import FondoInicio from "@/components/FondoInicio";
import PanelEntradas from "@/components/PanelEntradas";
import BarraCapas from "@/components/BarraCapas";
import Leyenda from "@/components/Leyenda";
import HojaComparacion from "@/components/HojaComparacion";
import Toast from "@/components/Toast";
import BarraDibujo from "@/components/BarraDibujo";
import AvisoSinConexion from "@/components/AvisoSinConexion";

/**
 * Port del prototipo v2 (docs/prototipo). Los componentes dibujan el mismo
 * HTML y, una vez montados, iniciarPrototipo() le agrega el mapa y la
 * lógica. Leaflet se importa adentro del efecto porque usa window.
 */
export default function Inicio() {
  useEffect(() => {
    let vivo = true;
    Promise.all([import("leaflet"), import("@/prototipo/iniciar")]).then(([L, p]) => {
      if (vivo) p.iniciarPrototipo(L.default);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <>
      <Intro />
      <MapaFondo />
      <FondoInicio />
      <PanelEntradas />
      <BarraCapas />
      <Leyenda />
      <HojaComparacion />
      <Toast />
      <BarraDibujo />
      <AvisoSinConexion />
    </>
  );
}
