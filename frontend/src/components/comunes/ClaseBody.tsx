"use client";

import { useEffect } from "react";
import { ANCHO_CELU } from "@/lib/encuadre";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";

/**
 * El CSS del prototipo cambia todo el layout según `body.onb` (paso 1:
 * formulario centrado y mapa oculto). Este componente mantiene esa clase
 * sincronizada con el paso del estado, así el CSS se usa tal cual.
 *
 * También `body.sheet-open` (placeLegend del prototipo): con la hoja de
 * resultados abierta en la compu, el CSS sube la atribución del mapa para que
 * la hoja no la tape. En celu la hoja va debajo del mapa y no hace falta.
 */
export default function ClaseBody() {
  const paso = useEntradas((s) => s.paso);
  useEffect(() => {
    document.body.classList.toggle("onb", paso === "inicio");
  }, [paso]);

  const hojaAbierta = useVista((s) => s.hojaAbierta);
  useEffect(() => {
    const aplicar = () => document.body.classList.toggle("sheet-open", hojaAbierta && window.innerWidth > ANCHO_CELU);
    aplicar();
    // Al cambiar el ancho de la ventana puede pasar de compu a celu o al revés.
    window.addEventListener("resize", aplicar);
    return () => window.removeEventListener("resize", aplicar);
  }, [hojaAbierta]);
  return null;
}
