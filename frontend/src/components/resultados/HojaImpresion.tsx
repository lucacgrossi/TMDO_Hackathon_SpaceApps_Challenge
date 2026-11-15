"use client";

import { useEffect, useState } from "react";
import AvisoApoyo from "@/components/comunes/AvisoApoyo";
import { useComparacion } from "@/lib/comparacion";
import type { Salida } from "@/lib/contrato";
import { TEXTO_PRECALCULADO } from "@/lib/dashboard";
import { centro } from "@/lib/geo";
import { NOTA_MOTOR, TITULO_HOJA, fechaGeneracion, fichaImpresion, fuentesDelAnalisis } from "@/lib/hojaImpresion";
import { useEntradas } from "@/lib/store";
import TablaTecnica from "./TablaTecnica";
import css from "./HojaImpresion.module.css";

/**
 * S6b · Hoja de impresión (RF20): lo que sale al tocar "Exportar PDF"
 * (`window.print()`). En pantalla no se ve; en `@media print` (A4 apaisada)
 * reemplaza al dashboard: logo y título, ficha del lote, la tabla comparativa
 * completa, las fuentes con sus años y resoluciones, la fecha de generación y
 * el aviso de apoyo al pie. Sin librerías de PDF.
 *
 * El centro sale del polígono con que se analizó (la foto de `useComparacion`),
 * no del que se esté editando. La cercanía de la tabla usa las prioridades
 * actuales, que van impresas en la ficha.
 */
export default function HojaImpresion({ salida }: { salida: Salida }) {
  const pesos = useEntradas((s) => s.objetivos);
  const poligono = useComparacion((s) => s.foto?.poligono ?? null);
  const [fecha, setFecha] = useState<Date | null>(null);

  // La fecha se toma en el cliente y se renueva justo antes de imprimir
  useEffect(() => {
    const ahora = () => setFecha(new Date());
    ahora();
    window.addEventListener("beforeprint", ahora);
    return () => window.removeEventListener("beforeprint", ahora);
  }, []);

  const ficha = fichaImpresion(salida, poligono && poligono.length >= 3 ? centro(poligono) : null, pesos);

  return (
    <div className={css.hoja}>
      <header className={css.cabecera}>
        {/* eslint-disable-next-line @next/next/no-img-element -- en papel conviene la imagen tal cual, sin el optimizador */}
        <img className={css.logo} src="/img/agropixel-logo.png" alt="AgroPixel" width={72} height={68} />
        <div>
          <h1 className={css.titulo}>{TITULO_HOJA}</h1>
          <dl className={css.ficha}>
            {ficha.map((p) => (
              <div key={p.etiqueta} className={css.par}>
                <dt>{p.etiqueta}</dt>
                <dd>{p.valor}</dd>
              </div>
            ))}
          </dl>
          {salida.es_mock && <p className={css.precalculado}>{TEXTO_PRECALCULADO}</p>}
        </div>
      </header>

      <TablaTecnica salida={salida} />

      <section className={css.fuentes}>
        <h2 className={css.subtitulo}>Fuentes</h2>
        <ul>
          {fuentesDelAnalisis(salida).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p>{NOTA_MOTOR}</p>
      </section>

      <footer className={css.pie}>
        <AvisoApoyo />
        <span>Generado el {fecha ? fechaGeneracion(fecha) : "—"}</span>
      </footer>
    </div>
  );
}
