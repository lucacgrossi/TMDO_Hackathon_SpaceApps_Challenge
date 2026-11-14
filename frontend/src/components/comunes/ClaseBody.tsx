"use client";

import { useEffect } from "react";
import { useEntradas } from "@/lib/store";

/**
 * El CSS del prototipo cambia todo el layout según `body.onb` (paso 1:
 * formulario centrado y mapa oculto). Este componente mantiene esa clase
 * sincronizada con el paso del estado, así el CSS se usa tal cual.
 */
export default function ClaseBody() {
  const paso = useEntradas((s) => s.paso);
  useEffect(() => {
    document.body.classList.toggle("onb", paso === "inicio");
  }, [paso]);
  return null;
}
