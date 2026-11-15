"use client";

import type { ReactNode } from "react";
import { MESES, useCapas } from "@/lib/capas";
import type { CapaRaster } from "@/lib/capaRaster";
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
 * si todavía no hay dato (principio "trazable" y "nada inventado"). Con "Vista aérea"
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
          NDVI de NASA HLS · {HLS_SENSOR[ndvi.coleccion] ?? ndvi.coleccion} · píxel de 30 m{ndvi.nubes != null ? ` · nubes en la escena: ${fmt(ndvi.nubes)} %` : ""}. Servido por Microsoft Planetary Computer. Dato real.
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
  const capa = useCapas((s) => s.pendiente);
  // Sin dato del backend no se muestra ningún número (nada inventado).
  if (!capa)
    return (
      <>
        <b>Pendiente del lote · sin dato</b>
        <div className="src">
          La calcula el backend con NASADEM (30 m), la misma que usa la tabla. Aparece al comparar, si el backend la
          pudo calcular para este lote.
        </div>
      </>
    );
  return <LeyendaRaster capa={capa} />;
}

/**
 * Leyenda genérica de una capa raster del backend: título con la media del
 * lote, la escala que viene en la capa (no se repite en el front) y la fuente
 * con resolución, fecha o campaña y confianza (principio "técnico por defecto").
 */
function LeyendaRaster({ capa }: { capa: CapaRaster }) {
  const { cortes, colores, etiquetas } = capa.escala;
  const cuando = capa.fecha ? formatoFecha(capa.fecha) : capa.campana;
  // El valor del lote (el de la tabla) si viene; si no, la media por píxel. Puede no haber ninguno.
  const { valor_lote: lote, media } = capa.resumen;
  const titulo =
    lote != null
      ? `valor del lote ${fmt(lote, 1)} ${capa.unidad}`
      : media != null
        ? `media ${fmt(media, 1)} ${capa.unidad}`
        : "sin dato";
  return (
    <>
      <b>
        {capa.titulo} · {titulo}
      </b>
      <div className="ramp" style={{ background: `linear-gradient(90deg,${colores.join(",")})` }} />
      <div className="row">
        {(etiquetas.length ? etiquetas : cortes.map((c) => fmt(c, 1))).map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="src">
        {capa.fuente} · píxel de {capa.resolucion_nativa}
        {cuando ? ` · ${cuando}` : ""} · confianza {capa.confianza}.{capa.nota ? ` ${capa.nota}` : ""}
      </div>
    </>
  );
}

function LeyendaClima({ mes }: { mes: number }) {
  const poligono = useEntradas((s) => s.poligono);
  // Climatología real de NASA POWER que manda el backend (`clima_mensual`).
  // Sin conexión es null: no se muestra ningún número (nada inventado).
  const clima = useCapas((s) => s.clima);
  const fila = (k: string, v: ReactNode) => (
    <div className="row">
      <span>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
  const zona = (
    <>
      El recuadro punteado es la zona del dato (~50 km): toda la zona tiene un solo valor. Tu lote está adentro,{" "}
      {posicionEnCelda(centro(poligono))}.
    </>
  );
  if (!clima)
    return (
      <>
        <b>Lluvia y heladas · {MESES[mes].toLowerCase()} · sin dato</b>
        <div className="src">
          Lluvia, temperaturas y heladas salen de NASA POWER (últimas 30 campañas) y las manda el backend. Llegan
          al comparar. {zona}
        </div>
      </>
    );
  return (
    <>
      <b>Lluvia y heladas · {MESES[mes].toLowerCase()}</b>
      {fila("Lluvia media", `${fmt(clima.lluvia[mes])} mm`)}
      {fila("Mínima del mes", `${fmt(clima.tmin[mes], 1)} °C`)}
      {fila("Máxima del mes", `${fmt(clima.tmax[mes], 1)} °C`)}
      {fila("Años con helada", `${clima.heladas[mes]} de ${clima.anios}`)}
      {fila("Años con 35 °C o más", `${clima.calor[mes]} de ${clima.anios}`)}
      <div className="src">
        NASA POWER mensual, campañas {clima.periodo}. Mínima y máxima: el extremo de cada mes, promediado. {zona}
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
