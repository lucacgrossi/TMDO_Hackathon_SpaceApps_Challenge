"use client";

import { useEffect } from "react";
import { ESTADO_INICIAL, SECCIONES, useApp, type Seccion } from "@/lib/app";
import { useComparacion } from "@/lib/comparacion";
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
