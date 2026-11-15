"use client";

import { SECCIONES, useApp, type Seccion } from "@/lib/app";
import AvisoApoyo from "./AvisoApoyo";
import Boton from "./Boton";
import estilos from "./PantallaPendiente.module.css";

const NOMBRE: Record<Seccion, string> = { mapa: "Mapa", clima: "Clima histórico", rotaciones: "Rotaciones" };

/**
 * Lugar provisorio para las pantallas que todavía no llegaron a `dev`
 * (PLAN.md, paso 0): la carga (persona 4) y el dashboard (persona 5).
 * Deja recorrer el flujo de punta a punta. Se borra cuando lleguen las dos.
 */
export default function PantallaPendiente({ etapa }: { etapa: "cargando" | "dashboard" }) {
  const seccion = useApp((s) => s.seccion);
  const irA = useApp((s) => s.irA);
  const volverAEditar = useApp((s) => s.volverAEditar);

  if (etapa === "cargando") {
    return (
      <main className={estilos.pantalla}>
        <h1 className={estilos.titulo}>Analizando tu lote</h1>
        <p>Pantalla de carga en construcción.</p>
      </main>
    );
  }

  return (
    <main className={estilos.pantalla}>
      <h1 className={estilos.titulo}>{NOMBRE[seccion]}</h1>
      <p>Dashboard en construcción (persona 5).</p>
      <nav className={estilos.secciones} aria-label="Secciones del dashboard">
        {SECCIONES.map((s) => (
          <Boton key={s} variante="secundario" aria-current={s === seccion ? "page" : undefined} onClick={() => irA(s)}>
            {NOMBRE[s]}
          </Boton>
        ))}
        <Boton variante="fantasma" icono="editar" onClick={volverAEditar}>
          Editar lote y entradas
        </Boton>
      </nav>
      <AvisoApoyo />
    </main>
  );
}
