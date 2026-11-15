"use client";

import { useEffect, useState } from "react";
import { CONSULTAS, textoLote, textoTiempo } from "@/lib/carga";
import { fotogramaPlanta } from "@/lib/planta";
import PlantaPixel from "./PlantaPixel";
import estilos from "./PantallaCarga.module.css";

interface Props {
  /** Superficie del lote en ha (la que muestra el panel). `null` si no se sabe. */
  superficieHa: number | null;
  /** Dónde está, ya armado: "cerca de Río Cuarto". `null` si no se sabe. */
  lugar: string | null;
  /** `Date.now()` del momento en que se disparó `/analizar`. Sin él, cuenta desde que se monta. */
  inicio?: number;
}

/** Cada cuánto se actualizan la planta y el contador. */
const MS_TICK = 100;

/**
 * S3 · Pantalla de carga mientras `/analizar` responde. Centrada sobre
 * `--rastrojo`: la planta pixel que crece (un fotograma cada 0,3 s, el último
 * queda fijo), "Analizando tu lote", el lote y el tiempo transcurrido, y la
 * lista de lo que se consulta en un solo pedido.
 *
 * Sin barra, sin porcentaje y sin tildes por fuente: la API no informa
 * progreso, así que mostrar avance sería inventar (DESIGN.md).
 */
export default function PantallaCarga({ superficieHa, lugar, inicio }: Props) {
  const [desde] = useState(() => inicio ?? Date.now());
  const [ahora, setAhora] = useState(desde);
  const quieto = useMovimientoReducido();

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), MS_TICK);
    return () => window.clearInterval(id);
  }, []);

  const ms = ahora - desde;

  return (
    <main className={estilos.pantalla} aria-busy="true">
      <div className={estilos.centro}>
        <PlantaPixel fotograma={fotogramaPlanta(ms, quieto)} escala={12} className={estilos.planta} />

        <h1 className={estilos.titulo}>Analizando tu lote…</h1>
        <p className={estilos.lote}>
          {textoLote(superficieHa, lugar)} <span className={estilos.tiempo}>{textoTiempo(ms)}</span>
        </p>

        <section className={estilos.consultas} aria-labelledby="carga-consultas">
          <h2 id="carga-consultas" className={estilos.subtitulo}>
            Qué se consulta, en un solo pedido
          </h2>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th scope="col">Dato</th>
                <th scope="col">Fuente</th>
                <th scope="col">Resolución</th>
              </tr>
            </thead>
            <tbody>
              {CONSULTAS.map((c) => (
                <tr key={c.dato}>
                  <th scope="row">
                    <span className={estilos.dato}>{c.dato}</span>
                    <span className={estilos.detalle}>{c.detalle}</span>
                  </th>
                  <td>{c.fuente}</td>
                  <td className={estilos.resolucion}>{c.resolucion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

/** true si el sistema pide menos movimiento (`prefers-reduced-motion: reduce`). */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducido(consulta.matches);
    const cambio = (e: MediaQueryListEvent) => setReducido(e.matches);
    consulta.addEventListener("change", cambio);
    return () => consulta.removeEventListener("change", cambio);
  }, []);
  return reducido;
}
