"use client";

import { useState, type ReactNode } from "react";
import { cercania, cercaniaPorTipo, esSensibleAlClima, type Pesos } from "@/lib/cercania";
import {
  OBJETIVOS,
  TIPOS_DE_ANIO,
  esDisponible,
  type Estrategia,
  type EstrategiaDisponible,
  type IdEstrategia,
  type Objetivo,
  type Salida,
  type TipoAnio,
} from "@/lib/contrato";
import {
  conSigno,
  fmt,
  mesesConAnios,
  NOMBRE_CULTIVO,
  rangoMeses,
  textoEfecto,
  tramosCalendario,
} from "@/lib/formato";
import { useEntradas } from "@/lib/store";
import CeldaDato, { HuellaDato, type Origen } from "./CeldaDato";
import ContrasteMediciones, { MateriaOrganicaProductor } from "./ContrasteMediciones";
import InsigniaEstrategia from "./InsigniaEstrategia";
import LeyendaLinea from "./LeyendaLinea";
import LineaCampania from "./LineaCampania";
import NumeroAnimado from "./NumeroAnimado";
import PanelTrazabilidad from "./PanelTrazabilidad";
import css from "./tabla.module.css";

const NOMBRE_OBJETIVO: Record<Objetivo, string> = { agua: "Agua", suelo: "Suelo", erosion: "Erosión", ingreso: "Ingreso" };
const NOMBRE_TIPO: Record<TipoAnio, string> = { seco: "Seco", normal: "Normal", humedo: "Húmedo" };
const REGLA_FIJA: Origen = { fuente: "Tabla de cultivos (motor de reglas)", regla: true };

interface Contexto {
  salida: Salida;
  actual: EstrategiaDisponible | null;
  pesos: Pesos;
}

interface Fila {
  id: string;
  titulo: string;
  /** Aclaración corta debajo del título: unidad o método. */
  ayuda?: string;
  /**
   * De dónde sale el valor de la fila. Es el mismo para las 4 columnas, así
   * que va una sola vez, debajo del título (antes se repetía en cada celda).
   */
  origen?: (ctx: Contexto) => Origen | null | undefined;
  celda: (e: EstrategiaDisponible, ctx: Contexto) => ReactNode;
}

interface Grupo {
  titulo: string;
  /** Algo que va en la misma franja del grupo (la leyenda del calendario). */
  extra?: ReactNode;
  filas: Fila[];
}

/** "−119 mm frente a la actual"; nada en la propia actual. */
function frenteALaActual(e: EstrategiaDisponible, valor: number, base: number | undefined, unidad: string) {
  if (e.id === "actual" || base == null) return null;
  const d = valor - base;
  return d === 0 ? "igual que la actual" : `${conSigno(d)} ${unidad} frente a la actual`;
}

function Lista({ items, vacio }: { items: readonly ReactNode[]; vacio: string }) {
  if (!items.length) return <p className={css.vacio}>{vacio}</p>;
  return (
    <ul className={css.lista}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/*
 * Jerarquía (de lo que decide a lo que respalda):
 * 1. Cercanía a tus prioridades: la fila que se mira primero, con el número grande.
 * 2. Valores de la campaña: un número por objetivo, la diferencia con la actual y una línea de detalle.
 * 3. Clima en el calendario: heladas, calor y su probabilidad.
 * 4. Calendario: la línea de julio a junio.
 * La trazabilidad (resumen, por qué, reglas, evidencia y los 5 puntos) no
 * ocupa filas en pantalla: se abre en un panel desde cada columna. En el PDF
 * sí va como filas (GRUPO_TRAZABILIDAD).
 */
const GRUPOS: Grupo[] = [
  {
    titulo: "Cercanía a tus prioridades",
    filas: [
      {
        id: "cercania",
        titulo: "Cercanía",
        ayuda: "con tus prioridades, año normal",
        celda: (e, { pesos }) => (
          <div className={css.celda}>
            <div className={css.valor}>
              <span className={css.numeroGrande}>
                <NumeroAnimado valor={cercania(e.puntos, pesos)} />
              </span>
              <span className={css.unidad}>%</span>
            </div>
            <p className={css.objetivos}>
              {OBJETIVOS.map((o) => (
                <span key={o}>
                  {NOMBRE_OBJETIVO[o]} {fmt(e.cercania_objetivos[o])}
                </span>
              ))}
            </p>
          </div>
        ),
      },
      {
        id: "tipo_anio",
        titulo: "Por tipo de año",
        ayuda: "cercanía en cada tercio de las 30 campañas",
        origen: ({ salida }) => {
          const t = salida.tipos_de_anio;
          return {
            fuente: `Terciles de ${t.metodo === "terciles_balance" ? "balance" : "lluvia"}, ${t.seco.length} campañas cada uno`,
            anios: salida.periodo_clima,
          };
        },
        celda: (e, { pesos }) => {
          const trio = cercaniaPorTipo(e.puntos, pesos);
          return (
            <div className={css.celda}>
              <div className={css.trio}>
                {TIPOS_DE_ANIO.map((tipo) => (
                  <div key={tipo}>
                    <b className={css.numero}>
                      <NumeroAnimado valor={trio[tipo]} />
                    </b>
                    <span>
                      <i className={css.punto} style={{ background: `var(--${tipo})` }} aria-hidden="true" />
                      {NOMBRE_TIPO[tipo]}
                    </span>
                  </div>
                ))}
              </div>
              {esSensibleAlClima(trio) && <span className={css.sensible}>Sensible al clima</span>}
            </div>
          );
        },
      },
    ],
  },
  {
    titulo: "Valores de la campaña",
    filas: [
      {
        id: "agua",
        titulo: "Agua",
        ayuda: "balance: lluvia − uso del cultivo",
        origen: ({ salida }) => {
          const ind = salida.indicadores.balance_anual ?? salida.indicadores.lluvia_anual;
          return ind && { ...ind };
        },
        celda: (e, { actual, salida }) => {
          const t = e.valores_por_tipo_anio;
          const contraste = e.id === "actual" ? salida.contraste_mediciones.find((c) => c.indicador === "lluvia_anual") : undefined;
          return (
            <CeldaDato
              valor={conSigno(e.valores.agua_mm)}
              unidad="mm, año normal"
              diferencia={frenteALaActual(e, e.valores.agua_mm, actual?.valores.agua_mm, "mm")}
            >
              Seco {conSigno(t.seco.agua_mm)}, húmedo {conSigno(t.humedo.agua_mm)} mm
              {contraste && <span className={css.contraste}>{contraste.texto}</span>}
            </CeldaDato>
          );
        },
      },
      {
        id: "suelo",
        titulo: "Suelo",
        ayuda: "puntos de 0 a 100",
        origen: () => REGLA_FIJA,
        celda: (e, { actual, salida }) => (
          <div className={css.celda}>
            <CeldaDato
              valor={fmt(e.puntos.suelo)}
              unidad="pts"
              diferencia={frenteALaActual(e, e.puntos.suelo, actual?.puntos.suelo, "pts")}
            >
              Aporte de N {fmt(e.valores.aporte_n)}, rastrojo {fmt(e.valores.rastrojo)}
            </CeldaDato>
            {/* Es del lote, no de la rotación: va una sola vez, en la actual, y no entra en los puntos */}
            {e.id === "actual" && <MateriaOrganicaProductor salida={salida} />}
          </div>
        ),
      },
      {
        id: "erosion",
        titulo: "Erosión",
        ayuda: "puntos de 0 a 100; más puntos, menos riesgo",
        origen: ({ salida }) => salida.lote.pendiente_pct,
        celda: (e, { actual, salida }) => {
          const p = salida.lote.pendiente_pct;
          return (
            <CeldaDato
              valor={fmt(e.puntos.erosion)}
              unidad="pts"
              diferencia={frenteALaActual(e, e.puntos.erosion, actual?.puntos.erosion, "pts")}
            >
              {e.valores.meses_cobertura_baja} meses pelado, pendiente{" "}
              {typeof p.valor === "number" ? `${fmt(p.valor, 1)} %` : "sin dato"}
            </CeldaDato>
          );
        },
      },
      {
        id: "ingreso",
        titulo: "Ingreso",
        ayuda: "puntos de 0 a 100, sin precios",
        origen: () => ({ fuente: "Tabla de cultivos (motor de reglas), sin precios de mercado", regla: true }),
        celda: (e, { actual }) => (
          <CeldaDato
            valor={fmt(e.puntos.ingreso)}
            unidad="pts"
            diferencia={frenteALaActual(e, e.puntos.ingreso, actual?.puntos.ingreso, "pts")}
          />
        ),
      },
      {
        id: "cobertura",
        titulo: "Meses pelado",
        ayuda: "cobertura baja en el calendario",
        origen: () => ({ fuente: "Calendario de cada rotación", regla: true }),
        // Lo visto por satélite en el lote de hoy está en la fila del calendario (fila fina de NDVI)
        celda: (e, { actual }) => (
          <CeldaDato
            valor={fmt(e.valores.meses_cobertura_baja)}
            unidad="meses"
            diferencia={frenteALaActual(e, e.valores.meses_cobertura_baja, actual?.valores.meses_cobertura_baja, "meses")}
          />
        ),
      },
    ],
  },
  {
    titulo: "Clima en el calendario",
    filas: [
      {
        id: "helada",
        titulo: "Helada con cultivo sensible",
        ayuda: "meses en conflicto, con los años de 30",
        origen: ({ salida }) => {
          const cm = salida.clima_mensual;
          return { fuente: cm.fuente, anios: cm.periodo, resolucion: cm.resolucion };
        },
        celda: (e, { salida }) => {
          const cm = salida.clima_mensual;
          return (
            <p className={css.detalle}>
              {mesesConAnios(e.valores.conflictos_helada_calor.meses_conflicto_helada, cm.anios_con_helada, cm.n_anios) ||
                "Ninguno"}
            </p>
          );
        },
      },
      {
        id: "calor",
        titulo: "Máxima ≥ 35 °C con cultivo de verano",
        ayuda: "meses, con los años de 30",
        celda: (e, { salida }) => {
          const cm = salida.clima_mensual;
          return (
            <p className={css.detalle}>
              {mesesConAnios(e.valores.conflictos_helada_calor.meses_calor, cm.anios_con_35c, cm.n_anios) || "Ninguno"}
            </p>
          );
        },
      },
      {
        id: "probabilidad",
        titulo: "Probabilidad",
        ayuda: "frecuencia en las 30 campañas",
        origen: ({ salida }) => {
          const p = salida.estrategias.filter(esDisponible).find((x) => x.probabilidades[0])?.probabilidades[0];
          return p && { fuente: p.fuente };
        },
        celda: (e) => (
          <Lista
            items={e.probabilidades.map((p) => (
              <>
                {p.texto}
                {/* Lo que vio la estación del productor en ese mes: al lado, no cambia la probabilidad */}
                {p.contraste && <span className={css.contrasteProb}>{p.contraste}</span>}
              </>
            ))}
            vacio="Sin eventos para este calendario"
          />
        ),
      },
    ],
  },
  {
    titulo: "Calendario",
    extra: <LeyendaLinea />,
    filas: [
      {
        id: "calendario",
        titulo: "Julio a junio",
        origen: () => REGLA_FIJA,
        celda: (e, { salida }) => (
          <>
            <LineaCampania salida={salida} estrategia={e} />
            {/* La línea ya muestra los tramos; el detalle en texto va solo en el PDF */}
            <ul className={`${css.tramos} ${css.soloImpresion}`}>
              {tramosCalendario(e.calendario).map((t) => (
                <li key={t.desde} data-pelado={t.cultivo === "barbecho"}>
                  <b>{NOMBRE_CULTIVO[t.cultivo]}</b> {rangoMeses(t)}
                  <span className={css.meses}>
                    , {t.meses} {t.meses === 1 ? "mes" : "meses"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ),
      },
    ],
  },
];

/** Solo en el PDF: lo que en pantalla está en el panel de trazabilidad. */
const GRUPO_TRAZABILIDAD: Grupo = {
  titulo: "Trazabilidad",
  filas: [
    { id: "resumen", titulo: "Resumen", celda: (e) => <p className={css.resumen}>{e.resumen}</p> },
    { id: "por_que", titulo: "Por qué aparece", celda: (e) => <Lista items={e.por_que} vacio="—" /> },
    {
      id: "reglas",
      titulo: "Reglas aplicadas",
      celda: (e) => (
        <Lista
          items={e.reglas_aplicadas.map((r) => (
            <>
              <b>{textoEfecto(r.efecto)}</b> <span className={css.dato}>{r.dato}</span>
            </>
          ))}
          vacio="—"
        />
      ),
    },
    { id: "evidencia", titulo: "Evidencia", celda: (e) => <Lista items={e.evidencia} vacio="—" /> },
    {
      id: "beneficios",
      titulo: "Beneficios",
      ayuda: "frente a la actual",
      celda: (e) => (
        <Lista items={e.beneficios} vacio={e.id === "actual" ? "Es la base de la comparación" : "Sin valores a favor frente a la actual"} />
      ),
    },
    { id: "vacios", titulo: "Información que falta", celda: (e) => <Lista items={e.vacios} vacio="Sin faltantes informados" /> },
    { id: "riesgos", titulo: "A revisar con el agrónomo", celda: (e) => <Lista items={e.riesgos} vacio="Sin alertas" /> },
  ],
};

/** Celda de una columna descartada: el motivo va una sola vez, arriba; el resto queda vacío. */
function CeldaDescartada({ e, primera }: { e: Estrategia; primera: boolean }) {
  return primera ? (
    <p className={css.descartada}>
      <b>Descartada.</b> {e.motivo_descarte}
    </p>
  ) : (
    <span className={css.sinDato} aria-label="Sin datos: alternativa descartada">
      —
    </span>
  );
}

/**
 * Tabla comparativa (RF11, RF12, RF21): siempre 4 columnas fijas (actual, A,
 * B, C), agrupadas de lo que decide a lo que respalda. Cada fila dice una sola
 * vez de dónde sale su valor (confianza, fuente, años, resolución). Una
 * alternativa descartada queda en gris rayado con el motivo. La cercanía se
 * recalcula con las prioridades, sin pedir datos (RF13).
 *
 * En pantalla, la trazabilidad de cada columna se abre en un panel ("Ver
 * trazabilidad"). Con `impresion` (la hoja del PDF) va completa como filas,
 * junto con el contraste de las mediciones del productor.
 */
export default function TablaTecnica({ salida, impresion = false }: { salida: Salida; impresion?: boolean }) {
  const pesos = useEntradas((s) => s.objetivos);
  const [panel, setPanel] = useState<IdEstrategia | null>(null);
  const actual = esDisponible(salida.estrategias[0]) ? salida.estrategias[0] : null;
  const ctx: Contexto = { salida, actual, pesos };
  // Ya trae los meses sin escena del satélite (servicio.py: "NDVI del lote · …")
  const falta = salida.informacion_falta;
  const grupos = impresion ? [...GRUPOS, GRUPO_TRAZABILIDAD] : GRUPOS;

  return (
    <div className={css.contenedor}>
      {impresion && <ContrasteMediciones salida={salida} />}
      <table className={css.tabla}>
        <caption className={css.oculto}>
          Comparación técnica de la rotación actual con las alternativas A, B y C
        </caption>
        <colgroup>
          <col className={css.colTitulo} />
          {salida.estrategias.map((e) => (
            <col key={e.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={css.esquina}>
              <span className={css.oculto}>Fila</span>
            </th>
            {salida.estrategias.map((e) => (
              <th key={e.id} scope="col" className={css.cabecera} data-id={e.id} data-disponible={e.disponible}>
                <div className={css.cabeceraFila}>
                  <InsigniaEstrategia id={e.id} descartada={!e.disponible} />
                  <div className={css.cabeceraTextos}>
                    <div className={css.nombre}>{e.nombre}</div>
                    <div className={css.especies}>{e.especies}</div>
                    {!impresion && (
                      <button
                        type="button"
                        className={css.verTraza}
                        aria-haspopup="dialog"
                        onClick={() => setPanel(e.id)}
                      >
                        Ver trazabilidad
                        <span className={css.oculto}> de {e.nombre}</span>
                      </button>
                    )}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        {grupos.map((g, gi) => (
          <tbody key={g.titulo} className={gi === 0 ? css.principal : undefined}>
            <tr className={css.grupo}>
              <th scope="colgroup" colSpan={5}>
                <span className={css.grupoTitulo}>{g.titulo}</span>
                {g.extra}
              </th>
            </tr>
            {g.filas.map((f, fi) => {
              const origen = f.origen?.(ctx);
              return (
                <tr key={f.id}>
                  <th scope="row" className={css.titulo}>
                    {f.titulo}
                    {f.ayuda && <span className={css.ayuda}>{f.ayuda}</span>}
                    {origen && <HuellaDato origen={origen} />}
                  </th>
                  {salida.estrategias.map((e) => (
                    <td key={e.id} data-disponible={e.disponible}>
                      {esDisponible(e) ? f.celda(e, ctx) : <CeldaDescartada e={e} primera={gi === 0 && fi === 0} />}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      {falta.length > 0 && (
        <p className={css.faltaGlobal}>
          <b>Información que falta en todo el análisis:</b> {falta.join("; ")}.
        </p>
      )}
      {!impresion && <PanelTrazabilidad salida={salida} id={panel} onCambiar={setPanel} onCerrar={() => setPanel(null)} />}
    </div>
  );
}
