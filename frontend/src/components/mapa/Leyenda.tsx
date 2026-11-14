"use client";

import type { ReactNode } from "react";
import { MESES, useCapas } from "@/lib/capas";
import { CLIMA_ILUSTRATIVO } from "@/lib/datosDemo";
import { centro, formatoNumero } from "@/lib/geo";
import { useMapa } from "@/lib/mapa";
import { anioCampania, formatoFecha, HLS_SENSOR, NDVI_COLORES, NDVI_CORTES, NDVI_MAX, UMBRAL_PELADO } from "@/lib/ndvi";
import { useEntradas } from "@/lib/store";
import { useVista } from "@/lib/vista";
import { posicionEnCelda } from "@/lib/zonaClima";

/**
 * F9 · Leyenda `#legend` de la capa activa (abajo a la derecha del mapa).
 * Sale de `legend()`, `ndviScale()` y `placeLegend()` del prototipo final
 * (prototipo-app.js ~líneas 345-355). Los textos son los del prototipo.
 *
 * Cada leyenda dice de dónde sale el dato, a qué resolución y si es real o
 * ilustrativo (principio "trazable" y "nada inventado"). Con "Vista aérea"
 * no hay leyenda.
 *
 * Con la hoja de resultados abierta (compu) la leyenda sube para no quedar
 * tapada. En celu el CSS la fija arriba (`bottom: auto !important`).
 */

const fmt = formatoNumero;

/** Escala de 6 clases del NDVI con el umbral de pelado y, si hay, la marca "Lote" (ndviScale). */
function EscalaNdvi({ valor }: { valor: number | null }) {
  // Posición en % sobre la escala 0–0,9.
  const p = (x: number) => Math.max(0, Math.min(1, x / NDVI_MAX)) * 100;
  return (
    <div className="nscale" style={{ marginTop: valor != null ? 22 : 6 }}>
      <div className="sw">
        {NDVI_COLORES.map((c, i) => (
          <i
            key={c}
            // El ancho de cada clase es proporcional a su rango de NDVI.
            style={{ background: c, flex: (i < NDVI_CORTES.length - 1 ? NDVI_CORTES[i + 1] : NDVI_MAX) - NDVI_CORTES[i] }}
          />
        ))}
      </div>
      <span className="th" style={{ left: `${p(UMBRAL_PELADO)}%` }} title="Umbral de pelado: 0,3" />
      {[0, 0.3, 0.6, 0.9].map((t) => (
        <span key={t} className="tk" style={{ left: `${p(t)}%` }}>
          {fmt(t, 1)}
        </span>
      ))}
      {valor != null && (
        <span className="lt" style={{ left: `${p(valor)}%` }}>
          Lote
        </span>
      )}
    </div>
  );
}

function LeyendaNdvi({ mes }: { mes: number }) {
  const ndvi = useCapas((s) => s.ndvi);
  if (ndvi?.tipo === "hls") {
    return (
      <>
        <b>Vegetación · {formatoFecha(ndvi.fecha)}</b>
        <EscalaNdvi valor={ndvi.media} />
        <div className="row">
          <span>Pelado</span>
          <span>Vegetación</span>
        </div>
        {ndvi.media != null && (
          <div className="row">
            <span>Promedio del lote</span>
            <b className="num">
              {fmt(ndvi.media, 2)} · {ndvi.media < UMBRAL_PELADO ? "pelado" : "cubierto"}
            </b>
          </div>
        )}
        <div className="src">
          NDVI de NASA HLS · {HLS_SENSOR[ndvi.coleccion] ?? ndvi.coleccion} · píxel de 30 m · nubes en la escena:{" "}
          {fmt(ndvi.nubes)} %. Servido por Microsoft Planetary Computer. Dato real.
        </div>
      </>
    );
  }
  return (
    <>
      <b>
        Vegetación · {MESES[mes].toLowerCase()} {ndvi ? ndvi.anio : anioCampania(mes)}
      </b>
      <div className="ramp" style={{ background: "linear-gradient(90deg,#f7e8c6,#c9d58a,#67ab4d,#1f6b2b)" }} />
      <div className="row">
        <span>pelado</span>
        <span>verde</span>
      </div>
      <div className="src">
        NDVI de NASA MODIS (GIBS) · 16 días · píxel de 250 m. Dato real.
        {/* Solo si ya se buscó la escena de 30 m y no hubo (ndvi no es null). */}
        {ndvi ? " Sin escena de 30 m sin nubes para este mes." : ""}
      </div>
    </>
  );
}

function LeyendaPendiente() {
  const pendiente = useCapas((s) => s.pendiente);
  return (
    <>
      <b>Pendiente del lote{pendiente ? ` · media ${fmt(pendiente.media, 1)} %` : ""}</b>
      <div className="ramp" style={{ background: "linear-gradient(90deg,#2e7d32,#7cb342,#fdd835,#f57c00,#c62828)" }} />
      <div className="row">
        <span>0 %</span>
        <span>2,5 %</span>
        <span>6 %+</span>
      </div>
      <div className="src">
        {/* Mientras calcula (pendiente null) no se afirma nada. */}
        {pendiente == null
          ? "Calculando con la elevación de AWS Terrain Tiles…"
          : pendiente.real
            ? "Elevación real: AWS Terrain Tiles (incluye SRTM) · ~8 m"
            : "No se pudo leer la elevación: valor ilustrativo"}
      </div>
    </>
  );
}

function LeyendaClima({ mes }: { mes: number }) {
  const poligono = useEntradas((s) => s.poligono);
  // TODO(auditoría): reemplazar por la climatología real de NASA POWER que mande el backend.
  const clima = CLIMA_ILUSTRATIVO;
  const fila = (k: string, v: ReactNode) => (
    <div className="row">
      <span>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
  return (
    <>
      <b>Lluvia y heladas · {MESES[mes].toLowerCase()}</b>
      {fila("Lluvia media", `${fmt(clima.lluvia[mes])} mm`)}
      {clima.real ? (
        <>
          {fila("Mínima del mes", `${fmt(clima.tmin[mes], 1)} °C`)}
          {fila("Máxima del mes", `${fmt(clima.tmax[mes], 1)} °C`)}
          {clima.heladas && fila("Años con helada", `${clima.heladas[mes]} de ${clima.anios}`)}
        </>
      ) : (
        <>
          {fila("Mínima media", `${fmt(clima.tmin[mes], 1)} °C`)}
          {fila("Máxima media", `${fmt(clima.tmax[mes], 1)} °C`)}
        </>
      )}
      <div className="src">
        {clima.real
          ? `NASA POWER mensual, campañas ${clima.periodo}. Mínima y máxima: el extremo de cada mes, promediado. Dato real.`
          : "Sin conexión a NASA POWER: valores ilustrativos."}{" "}
        El recuadro punteado es la zona del dato (~50 km): toda la zona tiene un solo valor. Tu lote está adentro,{" "}
        {posicionEnCelda(centro(poligono))}.
      </div>
    </>
  );
}

export default function Leyenda() {
  const capa = useMapa((s) => s.capa);
  const mes = useVista((s) => s.mes);
  const hojaAbierta = useVista((s) => s.hojaAbierta);

  const contenido =
    capa === "ndvi" ? (
      <LeyendaNdvi mes={mes} />
    ) : capa === "slope" ? (
      <LeyendaPendiente />
    ) : capa === "clima" ? (
      <LeyendaClima mes={mes} />
    ) : null;

  return (
    <div
      className="legend"
      id="legend"
      hidden={!contenido}
      // placeLegend(): sobre la hoja abierta (62 % del alto, hasta 620 px) + aire.
      style={{ bottom: hojaAbierta ? "calc(min(62vh, 620px) + 46px)" : 36 }}
    >
      {contenido}
    </div>
  );
}
