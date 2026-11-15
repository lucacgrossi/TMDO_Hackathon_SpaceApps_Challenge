"use client";

import { useCapas } from "@/lib/capas";
import { useMapa } from "@/lib/mapa";
import CapaRasterLote from "./CapaRasterLote";

/**
 * F9 · Capa "Pendiente": la inclinación del terreno dentro del lote.
 *
 * Cambio pedido por Back 2 (PR #25): el navegador ya NO calcula la pendiente
 * (antes: AWS Terrain Tiles + suavizado) ni muestra el 1,6 % ilustrativo del
 * prototipo. La pendiente la calcula el backend con NASADEM a 30 m, la misma
 * que va a la tabla, así el mapa y la tabla no pueden dar números distintos.
 *
 * `useCapas.pendiente` la llena `lib/resultado.ts` con `capas.pendiente_mapa` de
 * /analizar. Sin ella no se dibuja nada y la leyenda dice "sin dato" y por qué.
 */
export default function CapaPendiente() {
  const activa = useMapa((s) => s.capa === "slope");
  const capa = useCapas((s) => s.pendiente);
  if (!activa) return null;
  return <CapaRasterLote capa={capa} />;
}
