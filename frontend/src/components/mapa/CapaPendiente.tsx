"use client";

import { useEffect } from "react";
import { ImageOverlay } from "react-leaflet";
import { useCapas } from "@/lib/capas";
import { PENDIENTE_ILUSTRATIVA } from "@/lib/datosDemo";
import { useMapa } from "@/lib/mapa";
import { cargarPendiente } from "@/lib/pendiente";
import { useEntradas } from "@/lib/store";

/**
 * F9 · Capa "Pendiente": la inclinación del terreno dentro del lote, pintada
 * de verde (plano) a rojo (6 % o más).
 * Sale de `loadSlope()` y del `slopeOverlay` del prototipo final (prototipo-app.js ~líneas 227-254).
 *
 * La pendiente se calcula cada vez que cambia el lote, aunque la capa no esté
 * a la vista (como `onLoteChange` del prototipo): así al elegir "Pendiente"
 * la imagen ya está lista. El cálculo está en `lib/pendiente.ts`.
 *
 * Si no se pudo bajar la elevación (sin internet, AWS caído), queda el valor
 * ilustrativo del prototipo (1,6 %) y la leyenda lo dice: "valor ilustrativo".
 */
export default function CapaPendiente() {
  const poligono = useEntradas((s) => s.poligono);
  const activa = useMapa((s) => s.capa === "slope");
  const pendiente = useCapas((s) => s.pendiente);

  useEffect(() => {
    const { cambiarCapas } = useCapas.getState();
    // null = calculando: la leyenda muestra el título sin valor hasta que llega.
    cambiarCapas({ pendiente: null });
    // Si el lote cambia de nuevo antes de terminar, el resultado viejo se descarta (slopeToken).
    let vigente = true;
    cargarPendiente(poligono)
      .then((r) => {
        if (vigente) cambiarCapas({ pendiente: { ...r, real: true } });
      })
      .catch(() => {
        if (vigente)
          cambiarCapas({ pendiente: { media: PENDIENTE_ILUSTRATIVA, real: false, imagen: null, limites: null } });
      });
    return () => {
      vigente = false;
    };
  }, [poligono]);

  if (!activa || !pendiente?.imagen || !pendiente.limites) return null;
  return <ImageOverlay url={pendiente.imagen} bounds={pendiente.limites} opacity={0.85} interactive={false} />;
}
