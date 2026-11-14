"use client";

import { useState } from "react";
import HojaResultados from "@/components/HojaResultados";
import MapaDinamico from "@/components/MapaDinamico";
import PanelIzquierdo from "@/components/PanelIzquierdo";

/**
 * Layout base (DESIGN.md): mapa a pantalla completa, panel izquierdo fijo
 * y hoja de resultados desde abajo. En pantallas de 900 px o menos, el mapa
 * ocupa 52vh y el panel y la hoja se apilan debajo.
 */
export default function Inicio() {
  const [hojaAbierta, setHojaAbierta] = useState(false);

  return (
    <main className="relative min-h-screen min-[901px]:h-screen min-[901px]:overflow-hidden">
      <div className="h-[52vh] min-[901px]:absolute min-[901px]:inset-0 min-[901px]:h-full">
        <MapaDinamico />
      </div>
      <PanelIzquierdo onComparar={() => setHojaAbierta(true)} />
      <HojaResultados abierta={hojaAbierta} onCerrar={() => setHojaAbierta(false)} />
    </main>
  );
}
