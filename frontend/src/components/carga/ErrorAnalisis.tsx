"use client";

import { useEffect } from "react";
import Boton from "@/components/comunes/Boton";
import { navegadorSinConexion } from "@/lib/api";
import { ETIQUETAS_ACCION, textosError, type AccionError } from "@/lib/carga";
import PlantaPixel from "./PlantaPixel";
import estilos from "./ErrorAnalisis.module.css";

interface Props {
  /** Código HTTP de `/analizar`: 422, 503 u otro (500, o 0 si no hubo respuesta). */
  codigo: number;
  /** El `mensaje` del back, tal cual. `null` si no llegó (red caída). */
  mensaje: string | null;
  /** "Marcar otro lote" (422): vuelve a marcar el polígono. */
  onMarcarOtro: () => void;
  /** "Probar de nuevo" (503 y otros): repite `/analizar` con las mismas entradas. */
  onReintentar: () => void;
  /** El back rechazó el pedido por el esquema (422 con `{detail}`): error de la app, no del lote. */
  deLaApp?: boolean;
  /** "Cerrar" (y Esc): oculta el error y deja el panel como estaba. Sin él, no hay botón. */
  onCerrar?: () => void;
}

/**
 * S3b · Error del análisis: card con borde superior `--bad`, la semilla pixel,
 * qué pasó y cómo seguir, con una o dos acciones. Qué pasó: la explicación de
 * `textosError` si la hay (NASA POWER caído, sin internet) o el `mensaje` del
 * back tal cual. Sin el código HTTP a la vista (QA H-028). Errores sin
 * disculpas (DESIGN.md, "Lenguaje"). No llama a la API ni al store: las
 * acciones llegan por props.
 */
export default function ErrorAnalisis({
  codigo,
  mensaje,
  onMarcarOtro,
  onReintentar,
  deLaApp = false,
  onCerrar,
}: Props) {
  // Sin respuesta: si el navegador dice que está sin conexión, es internet;
  // si no, el que no responde es el servidor de AgroPixel.
  const sinInternet = codigo === 0 && navegadorSinConexion();
  const textos = textosError(codigo, deLaApp, sinInternet);
  const quepaso = textos.explicacion ?? mensaje;
  const acciones: Record<AccionError, () => void> = {
    marcar: onMarcarOtro,
    reintentar: onReintentar,
  };

  useEffect(() => {
    if (!onCerrar) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <section className={estilos.card} role="alert" aria-labelledby="error-analisis-titulo">
      {onCerrar && (
        <Boton variante="fantasma" className={estilos.cerrar} onClick={onCerrar}>
          Cerrar
        </Boton>
      )}
      <PlantaPixel fotograma={0} escala={5} desdeFila={11} className={estilos.semilla} />
      <div className={estilos.texto}>
        <h2 id="error-analisis-titulo" className={estilos.titulo}>
          {textos.titulo}
        </h2>
        {quepaso && <p className={estilos.mensaje}>{quepaso}</p>}
        <p className={estilos.seguir}>{textos.comoSeguir}</p>
        <div className={estilos.acciones}>
          {textos.acciones.map((a, i) => (
            <Boton key={a} variante={i === 0 ? "primario" : "secundario"} onClick={acciones[a]}>
              {ETIQUETAS_ACCION[a]}
            </Boton>
          ))}
        </div>
      </div>
    </section>
  );
}
