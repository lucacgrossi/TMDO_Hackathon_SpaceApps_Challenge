"use client";

import { clasesLeyenda, type DibujoNdvi, type IdCapaLote, numero } from "@/lib/capasLote";
import type { CapaRaster, Salida } from "@/lib/contrato";
import { fmtNdvi, MESES, textoResolucion } from "@/lib/formato";
import { escalaNdvi, fechaCorta } from "@/lib/lineaTiempo";
import css from "./LeyendaLote.module.css";

/**
 * Leyenda del mapa del lote (S4, RF18): título, clases desde `capa.escala` (las
 * escalas son del back, no tokens del front), fuente, fecha, resolución y el
 * valor del lote. La nota del back va plegada, tal cual.
 */

function Clases({ escala }: { escala: CapaRaster["escala"] }) {
  return (
    <ul className={css.clases}>
      {clasesLeyenda({ escala }).map((c) => (
        <li key={c.etiqueta + c.color}>
          <i style={{ background: c.color }} aria-hidden="true" />
          <span>{c.etiqueta}</span>
        </li>
      ))}
    </ul>
  );
}

function fecha(f: string | null): string | null {
  return f && /^\d{4}-\d{2}-\d{2}/.test(f) ? fechaCorta(f) : f;
}

function DeRaster({ capa }: { capa: CapaRaster }) {
  const lote = capa.resumen.valor_lote ?? capa.resumen.media;
  const pie = [capa.fuente, fecha(capa.fecha), textoResolucion(capa.fuente, capa.resolucion_nativa, capa.resolucion_grilla)]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <b className={css.titulo}>{capa.titulo}</b>
      <Clases escala={capa.escala} />
      <p className={css.pie}>{pie}.</p>
      {lote != null && (
        <p className={css.lote}>
          Valor del lote: {capa.unidad === "NDVI" ? `NDVI ${fmtNdvi(lote)}` : `${numero(lote)} ${capa.unidad}`}
        </p>
      )}
      {capa.nota && (
        <details className={css.nota}>
          <summary>Nota de la capa</summary>
          {capa.nota}
        </details>
      )}
    </>
  );
}

export default function LeyendaLote({
  salida,
  capa,
  mes,
  raster,
  ndvi,
}: {
  salida: Salida;
  capa: IdCapaLote;
  mes: number;
  raster: CapaRaster | null;
  ndvi: DibujoNdvi | null;
}) {
  let contenido: React.ReactNode;
  if (raster) {
    contenido = <DeRaster capa={raster} />;
  } else if (capa === "satelite") {
    contenido = (
      <>
        <b className={css.titulo}>Imagen satelital</b>
        <p className={css.pie}>Esri World Imagery, solo de fondo: no es un dato del lote.</p>
      </>
    );
  } else if (capa === "celda") {
    const c = salida.clima_celda;
    contenido = (
      <>
        <b className={css.titulo}>Celda de NASA POWER</b>
        <p className={css.pie}>
          {c.resolucion}. Todo el recuadro comparte un solo dato de clima; el lote está {c.posicion_lote}.
        </p>
      </>
    );
  } else if (capa === "ndvi" && ndvi && ndvi.tipo !== "raster") {
    const visto = salida.visto_por_satelite.meses[mes];
    const escala = escalaNdvi(salida.capas);
    contenido = (
      <>
        <b className={css.titulo}>NDVI, {MESES[mes]}</b>
        {ndvi.tipo === "hls" && escala && <Clases escala={escala} />}
        <p className={css.pie}>
          {ndvi.tipo === "hls" && `Escena NASA HLS del back por teselas de Planetary Computer, ${fechaCorta(ndvi.fecha)}, 30 m.`}
          {ndvi.tipo === "gibs" &&
            `Imagen de NASA GIBS (MODIS Terra, 250 m, compuesto de 16 días al ${ndvi.fecha}) con sus propios colores: más verde, más vegetación. Es contexto regional, no la escena del lote.`}
          {ndvi.tipo === "nada" && ndvi.motivo}
        </p>
        <p className={css.lote}>
          NDVI medio del lote: {visto ? `${fmtNdvi(visto.ndvi_medio)} (${visto.fuente})` : "sin dato"}
        </p>
      </>
    );
  } else {
    contenido = <p className={css.pie}>Esta respuesta no trae la capa.</p>;
  }
  return (
    <div className={css.leyenda} aria-live="polite">
      {contenido}
    </div>
  );
}
