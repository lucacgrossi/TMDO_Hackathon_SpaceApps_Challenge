"use client";

import { useEffect } from "react";
import { ESTADO_INICIAL, SECCIONES, useApp, type Seccion } from "@/lib/app";
import { useComparacion } from "@/lib/comparacion";
import { LOTE_DEMO, type LatLng } from "@/lib/entradas";
import { useEntradas } from "@/lib/store";
import "@/lib/resultado"; // registra el pedido de /analizar al cambiar la foto

/**
 * Solo en desarrollo: `?etapa=dashboard` (y opcionalmente `&seccion=clima`)
 * abre el dashboard con el resultado del mock, sin pasar por el panel. Sirve
 * para que cada dueño trabaje su sección mientras el flujo se completa.
 */
export default function AtajoEtapa() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("etapa") !== "dashboard") return;
    const pedida = q.get("seccion") as Seccion | null;
    // La app ya no trae un lote cargado: el atajo usa el lote del mock (Río
    // Cuarto) para que el mapa del dashboard tenga contorno. Solo en desarrollo.
    useEntradas.getState().cambiar({ poligono: LOTE_DEMO.map((p) => [...p] as LatLng) });
    useComparacion.getState().volverAComparar();
    useApp.setState({
      ...ESTADO_INICIAL,
      etapa: "dashboard",
      seccion: pedida && SECCIONES.includes(pedida) ? pedida : "mapa",
      hayResultado: true,
    });
  }, []);
  return null;
}
