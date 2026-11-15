"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Boton from "@/components/comunes/Boton";
import { destinoTab, SELECTOR_ENFOCABLES } from "@/lib/focoAtrapado";
import { URL_PLANTILLA } from "@/lib/planilla";
import estilos from "./ModalFormatoPlanilla.module.css";

type Granularidad = "diaria" | "mensual";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * S2b · Modal "Formato de la planilla" (RF26). Explica qué CSV acepta
 * `POST /mediciones/planilla`: pestañas Diaria / Mensual con un ejemplo, qué
 * acepta, valores válidos por variable, límites y "Descargar plantilla".
 * Todo el texto sale de `docs/plan-planilla-lluvia.md` §2–3; si el parser
 * cambia, se cambia ahí y acá.
 *
 * Accesibilidad: `role="dialog"` con `aria-modal`, foco atrapado
 * (`lib/focoAtrapado.ts`), cierre con Esc o clic en el fondo, y al cerrar el
 * foco vuelve al control que lo abrió.
 */
export default function ModalFormatoPlanilla({ abierto, onCerrar }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>("diaria");
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  // Al abrir: guardar quién tenía el foco y llevarlo al modal. Al cerrar
  // (o desmontar), devolverlo.
  useEffect(() => {
    if (!abierto) return;
    const disparador = document.activeElement as HTMLElement | null;
    caja.current?.focus();
    return () => {
      if (disparador && document.contains(disparador)) disparador.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== "Tab" || !caja.current) return;
    const enfocables = Array.from(caja.current.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
    const destino = destinoTab(enfocables.indexOf(document.activeElement as HTMLElement), enfocables.length, e.shiftKey);
    e.preventDefault();
    (destino >= 0 ? enfocables[destino] : caja.current).focus();
  };

  const ejemplo = EJEMPLOS[granularidad];

  return createPortal(
    <div
      className={estilos.fondo}
      onMouseDown={(e) => {
        // Solo el clic en el fondo cierra, no el que empieza dentro de la caja.
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={caja}
        className={estilos.caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={teclado}
      >
        <header className={estilos.encabezado}>
          <h2 id={idTitulo} className={estilos.titulo}>
            Formato de la planilla
          </h2>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Boton>
        </header>

        <div className={estilos.cuerpo}>
          <p className={estilos.intro}>
            Un archivo CSV con tu registro diario o mensual de lluvia y, si tenés estación, de temperaturas mínima y
            máxima. Excel y Google Sheets lo exportan como CSV. Las columnas de medición son opcionales, pero tiene que
            venir al menos una. El archivo se lee en el momento y no se guarda.
          </p>

          <div className={estilos.pestanas} role="group" aria-label="Tipo de registro">
            {(["diaria", "mensual"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={estilos.chip}
                aria-pressed={granularidad === g}
                onClick={() => setGranularidad(g)}
              >
                {g === "diaria" ? "Diaria" : "Mensual"}
              </button>
            ))}
          </div>

          <section aria-label={`Ejemplo de planilla ${granularidad}`}>
            <table className={estilos.tabla}>
              <caption className={estilos.leyenda}>{ejemplo.leyenda}</caption>
              <thead>
                <tr>
                  {ejemplo.columnas.map((c) => (
                    <th key={c} scope="col">
                      <code>{c}</code>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ejemplo.filas.map((fila) => (
                  <tr key={fila[0]}>
                    {fila.map((celda, i) => (
                      <td key={i} className={i > 0 ? estilos.num : undefined}>
                        {celda === "" ? <span className={estilos.vacio}>vacía</span> : celda}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={estilos.notas}>
              {ejemplo.notas.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>

          <section className={estilos.bloque} aria-labelledby={`${idTitulo}-acepta`}>
            <h3 id={`${idTitulo}-acepta`} className={estilos.subtitulo}>
              Qué acepta
            </h3>
            <dl className={estilos.pares}>
              {ACEPTA.map(([k, v]) => (
                <div key={k} className={estilos.par}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={estilos.bloque} aria-labelledby={`${idTitulo}-valores`}>
            <h3 id={`${idTitulo}-valores`} className={estilos.subtitulo}>
              Valores válidos por variable
            </h3>
            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Diaria</th>
                  <th scope="col">Mensual</th>
                  <th scope="col">De diaria a mensual</th>
                </tr>
              </thead>
              <tbody>
                {VARIABLES.map((v) => (
                  <tr key={v.nombre}>
                    <th scope="row">
                      <code>{v.nombre}</code>
                    </th>
                    <td>{v.unidad}</td>
                    <td className={estilos.num}>{v.diaria}</td>
                    <td className={estilos.num}>{v.mensual}</td>
                    <td>{v.pasaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={estilos.pie}>
              Un valor fuera de rango, una mínima mayor que la máxima el mismo día o una fecha futura se descartan, con
              aviso. Una celda vacía o con <code>-</code> es un día o mes sin registro de esa variable; las otras
              columnas de la fila se usan igual.
            </p>
          </section>

          <section className={estilos.bloque} aria-labelledby={`${idTitulo}-limites`}>
            <h3 id={`${idTitulo}-limites`} className={estilos.subtitulo}>
              Límites
            </h3>
            <dl className={estilos.pares}>
              {LIMITES.map(([k, v]) => (
                <div key={k} className={estilos.par}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <footer className={estilos.pieModal}>
          {/* download: el navegador la baja en vez de abrirla. */}
          <a className={estilos.descargar} href={URL_PLANTILLA} download="plantilla-mediciones.csv">
            Descargar plantilla
          </a>
          <span className={estilos.pie}>
            CSV con el encabezado <code>fecha;lluvia_mm;t_min_c;t_max_c</code> y tres filas de ejemplo.
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* Contenido: docs/plan-planilla-lluvia.md §2–3 */

const EJEMPLOS: Record<
  Granularidad,
  { leyenda: string; columnas: string[]; filas: string[][]; notas: string[] }
> = {
  diaria: {
    leyenda: "Planilla diaria, separada por punto y coma y con coma decimal (como la exporta Excel en español).",
    columnas: ["fecha", "lluvia_mm", "t_min_c", "t_max_c"],
    filas: [
      ["15/01/2023", "32,5", "18,2", "34,1"],
      ["16/01/2023", "", "17,5", "35,8"],
      ["17/01/2023", "0", "16,9", "36,2"],
    ],
    notas: [
      "Fecha siempre día/mes: dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd o d/m/aa (de 00 a 69 son años 2000).",
      "Alcanza con anotar los días que llueve: un mes sin filas de lluvia dentro del período cuenta como 0 mm, con aviso. Más de 6 meses seguidos en 0 se avisan como posible hueco del registro.",
      "Varios registros de lluvia del mismo día se suman (son varias lluvias).",
      "Temperaturas: un mes vale si tiene registros en al menos 20 días. Con menos, ese mes queda sin dato y se avisa; no cuenta como 0.",
    ],
  },
  mensual: {
    leyenda: "Planilla mensual, separada por punto y coma y con coma decimal.",
    columnas: ["mes", "lluvia_mm", "t_min_c", "t_max_c"],
    filas: [
      ["2023-01", "120,5", "12,1", "37,4"],
      ["2023-02", "98", "11,8", "35,0"],
    ],
    notas: [
      "Mes en formato aaaa-mm, mm/aaaa o mm-aaaa.",
      "t_min_c es la mínima más baja del mes y t_max_c la máxima más alta, lo mismo que entrega NASA POWER mensual.",
      "Un mes repetido es un error: no se suma, porque no se sabe cuál vale.",
    ],
  },
};

const ACEPTA: [string, string][] = [
  ["Codificación", "UTF-8 (con o sin BOM) y Latin-1 / Windows-1252."],
  ["Separador", "Punto y coma, coma o tabulación. Con empate al detectarlo, gana el punto y coma."],
  ["Decimales", "Coma o punto. Si el separador es la coma, solo punto."],
  ["Fechas", "Diarias o mensuales, sin mezclar: un archivo con las dos da error. Siempre día antes que mes."],
  [
    "Encabezado",
    "Opcional. Sin encabezado, la columna 1 es la fecha y la 2 la lluvia. Nombres reconocidos, sin distinguir mayúsculas ni tildes: fecha, dia, mes o periodo; lluvia, lluvia_mm, mm, precipitacion o pp; t_min_c, tmin, minima o temp_min; t_max_c, tmax, maxima o temp_max.",
  ],
  ["Columnas extra", "Se ignoran, con aviso."],
];

const VARIABLES = [
  { nombre: "lluvia_mm", unidad: "mm", diaria: "0 a 300", mensual: "0 a 1.000", pasaje: "Suma" },
  { nombre: "t_min_c", unidad: "°C", diaria: "−20 a 40", mensual: "−20 a 40", pasaje: "Mínimo del mes" },
  { nombre: "t_max_c", unidad: "°C", diaria: "−10 a 50", mensual: "−10 a 50", pasaje: "Máximo del mes" },
];

const LIMITES: [string, string][] = [
  ["Tamaño", "Hasta 1 MB."],
  ["Filas", "Hasta 20.000."],
  ["Período", "Hasta 40 años (480 meses)."],
  ["Mínimo", "12 meses válidos de al menos una variable; si no, el archivo se rechaza."],
  [
    "Campañas",
    "De julio a junio, igual que NASA POWER, por separado para cada variable. Solo se comparan las que tienen los 12 meses; las parciales se informan.",
  ],
  ["Errores", "Se informan las primeras 20 filas con problemas, cada una con su número y el motivo."],
];
