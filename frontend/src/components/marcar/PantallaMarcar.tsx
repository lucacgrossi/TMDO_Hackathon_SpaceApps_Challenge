"use client";

import { useEffect, useRef } from "react";
import BuscadorLote from "@/components/entradas/BuscadorLote";
import BarraDibujo from "@/components/mapa/BarraDibujo";
import { useApp } from "@/lib/app";
import { useDibujo } from "@/lib/dibujo";
import { useMapa } from "@/lib/mapa";
import estilos from "./PantallaMarcar.module.css";

/**
 * S1 · Marcar lote (DESIGN.md): el mapa a pantalla completa (lo pone
 * page.tsx, compartido con S2 para no recargarlo), la caja de arriba a la
 * izquierda y la barra de dibujo abajo al centro.
 *
 * El dibujo está activo desde que se entra: cada clic en el mapa marca una
 * esquina. Buscar un lugar solo mueve el mapa hasta ahí (Encuadre).
 *
 * Sale a `configurar` (S2) al cerrar un lote válido (Listo, tocar la primera
 * esquina o Enter): `useDibujo.cierres` sube y acá se escucha. No hay lote de
 * ejemplo: el productor siempre marca el suyo.
 */
export default function PantallaMarcar() {
  const loteListo = useApp((s) => s.loteListo);
  const dibujando = useDibujo((s) => s.dibujando);
  const cierres = useDibujo((s) => s.cierres);

  // Mientras se está en S1 el dibujo siempre está activo: al entrar y después
  // de "Cancelar" (que borra las esquinas) vuelve a arrancar vacío.
  // Si el dibujo terminó por un cierre válido, no se reinicia: se pasa al panel.
  const cierresAlEntrar = useRef(cierres);
  useEffect(() => {
    if (dibujando || useDibujo.getState().cierres > cierresAlEntrar.current) return;
    useMapa.getState().cambiarMapa({ loteVisible: false });
    useDibujo.getState().iniciar(null);
  }, [dibujando]);

  // Un cierre válido nuevo (no uno de antes de entrar a S1) pasa al panel.
  useEffect(() => {
    if (cierres > cierresAlEntrar.current) loteListo();
  }, [cierres, loteListo]);

  return (
    <>
      <section className={estilos.caja} aria-labelledby="titulo-marcar">
        <div className={estilos.marca}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo chico y fijo, sin optimizar */}
          <img src="/img/agropixel-logo.png" alt="" width={40} height={38} className={estilos.logo} />
          <span>AgroPixel</span>
        </div>
        <h1 id="titulo-marcar" className={estilos.titulo}>
          Marcá tu lote
        </h1>
        <p className={estilos.bajada}>
          Hacé clic en el mapa en cada esquina del lote. Si está lejos, buscalo primero.
        </p>
        <BuscadorLote />
        <p className={estilos.fuente}>Imagen satelital y búsqueda de lugares: Esri.</p>
      </section>
      <BarraDibujo />
    </>
  );
}
