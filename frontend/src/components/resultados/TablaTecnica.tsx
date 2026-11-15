"use client";

import type { ReactNode } from "react";
import { cercania, cercaniaPorTipo, esSensibleAlClima, type Pesos } from "@/lib/cercania";
import {
  OBJETIVOS,
  TIPOS_DE_ANIO,
  esDisponible,
  type Estrategia,
  type EstrategiaDisponible,
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
import { meses } from "@/lib/plural";
import { useEntradas } from "@/lib/store";
import CeldaDato, { HuellaDato, type Origen } from "./CeldaDato";
import ContrasteMediciones, { MateriaOrganicaProductor } from "./ContrasteMediciones";
import InsigniaEstrategia from "./InsigniaEstrategia";
import LeyendaLinea from "./LeyendaLinea";
import LineaCampania from "./LineaCampania";
import NumeroAnimado from "./NumeroAnimado";
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
  celda: (e: EstrategiaDisponible, ctx: Contexto) => ReactNode;
}

interface Grupo {
  titulo: string;
  filas: Fila[];
}

/** "−119 mm frente a la actual"; nada en la propia actual. */
function frenteALaActual(e: EstrategiaDisponible, valor: number, base: number | undefined, unidad: string) {
  if (e.id === "actual" || base == null) return null;
  const d = valor - base;
  const u = unidad === "meses" ? meses(d) : unidad;
  return d === 0 ? "igual que la actual" : `${conSigno(d)} ${u} frente a la actual`;
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

const GRUPOS: Grupo[] = [
  {
    titulo: "Cómo se arma",
    filas: [
      { id: "resumen", titulo: "Resumen", celda: (e) => <p className={css.resumen}>{e.resumen}</p> },
      {
        id: "calendario",
        titulo: "Calendario",
        ayuda: "julio a junio",
        celda: (e, { salida }) => (
          <>
            <LineaCampania salida={salida} estrategia={e} />
            <ul className={css.tramos}>
              {tramosCalendario(e.calendario).map((t) => (
                <li key={t.desde} data-pelado={t.cultivo === "barbecho"}>
                  <b>{NOMBRE_CULTIVO[t.cultivo]}</b> {rangoMeses(t)}
                  <span className={css.meses}> · {t.meses} {t.meses === 1 ? "mes" : "meses"}</span>
                </li>
              ))}
            </ul>
            <HuellaDato origen={REGLA_FIJA} />
          </>
        ),
      },
      {
        id: "por_que",
        titulo: "Por qué aparece",
        celda: (e) => <Lista items={e.por_que} vacio="—" />,
      },
    ],
  },
  {
    titulo: "Valores de la campaña",
    filas: [
      {
        id: "cobertura",
        titulo: "Meses con cobertura baja",
        ayuda: "lote pelado o casi",
        celda: (e, { actual, salida }) => {
          const sat = salida.visto_por_satelite;
          return (
            <div className={css.celda}>
              <CeldaDato
                valor={fmt(e.valores.meses_cobertura_baja)}
                unidad={meses(e.valores.meses_cobertura_baja)}
                diferencia={frenteALaActual(e, e.valores.meses_cobertura_baja, actual?.valores.meses_cobertura_baja, "meses")}
                origen={{ fuente: e.id === "actual" ? "Calendario cargado" : "Calendario de la alternativa", regla: true }}
              />
              {e.id === "actual" && sat.meses_ndvi_bajo != null && (
                <div className={css.observado}>
                  <p className={css.detalle}>
                    <b>Visto por satélite{sat.campana ? ` en ${sat.campana}` : ""}:</b> {sat.meses_ndvi_bajo} de{" "}
                    {sat.meses_con_dato} {meses(sat.meses_con_dato)} con NDVI menor a {fmt(sat.umbral, 1)}
                  </p>
                  <HuellaDato
                    origen={{ fuente: sat.fuente, anios: sat.campana, confianza: sat.confianza, motivo: sat.motivo }}
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "agua",
        titulo: "Agua",
        ayuda: "balance de la campaña: lluvia − uso del cultivo",
        celda: (e, { actual, salida }) => {
          const ind = salida.indicadores.balance_anual ?? salida.indicadores.lluvia_anual;
          const t = e.valores_por_tipo_anio;
          const contraste = e.id === "actual" ? salida.contraste_mediciones.find((c) => c.indicador === "lluvia_anual") : undefined;
          return (
            <CeldaDato
              valor={conSigno(e.valores.agua_mm)}
              unidad="mm en año normal"
              diferencia={frenteALaActual(e, e.valores.agua_mm, actual?.valores.agua_mm, "mm")}
              origen={ind && { ...ind }}
            >
              Seco {conSigno(t.seco.agua_mm)} · húmedo {conSigno(t.humedo.agua_mm)} mm
              {contraste && <span className={css.contraste}>{contraste.texto}</span>}
            </CeldaDato>
          );
        },
      },
      {
        id: "suelo",
        titulo: "Suelo",
        ayuda: "puntos de 0 a 100",
        celda: (e, { actual, salida }) => (
          <div className={css.celda}>
            <CeldaDato
              valor={fmt(e.puntos.suelo)}
              unidad="pts"
              diferencia={frenteALaActual(e, e.puntos.suelo, actual?.puntos.suelo, "pts")}
              origen={REGLA_FIJA}
            >
              Aporte de N {fmt(e.valores.aporte_n)} · rastrojo {fmt(e.valores.rastrojo)} (índices)
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
        celda: (e, { actual, salida }) => {
          const p = salida.lote.pendiente_pct;
          return (
            <CeldaDato
              valor={fmt(e.puntos.erosion)}
              unidad="pts"
              diferencia={frenteALaActual(e, e.puntos.erosion, actual?.puntos.erosion, "pts")}
              origen={p}
            >
              {e.valores.meses_cobertura_baja} {meses(e.valores.meses_cobertura_baja)} con cobertura baja × pendiente{" "}
              {typeof p.valor === "number" ? `${fmt(p.valor, 1)} %` : "sin dato"}
            </CeldaDato>
          );
        },
      },
      {
        id: "ingreso",
        titulo: "Ingreso",
        ayuda: "puntos de 0 a 100, sin precios",
        celda: (e, { actual }) => (
          <CeldaDato
            valor={fmt(e.puntos.ingreso)}
            unidad="pts"
            diferencia={frenteALaActual(e, e.puntos.ingreso, actual?.puntos.ingreso, "pts")}
            origen={{ fuente: "Tabla de cultivos (motor de reglas), sin precios de mercado", regla: true }}
          >
            {e.especies}
          </CeldaDato>
        ),
      },
      {
        id: "helada_calor",
        titulo: "Helada y calor",
        ayuda: "meses en conflicto con el calendario",
        celda: (e, { salida }) => {
          const c = e.valores.conflictos_helada_calor;
          const cm = salida.clima_mensual;
          const conAnios = (meses: number[], anios: number[]) => mesesConAnios(meses, anios, cm.n_anios) || "ninguno";
          return (
            <div className={css.celda}>
              <p className={css.detalle}>
                <b>Helada con cultivo sensible:</b> {conAnios(c.meses_conflicto_helada, cm.anios_con_helada)}
              </p>
              <p className={css.detalle}>
                <b>Máxima ≥ 35 °C con cultivo de verano:</b> {conAnios(c.meses_calor, cm.anios_con_35c)}
              </p>
              <HuellaDato origen={{ fuente: cm.fuente, anios: cm.periodo, resolucion: cm.resolucion }} />
            </div>
          );
        },
      },
    ],
  },
  {
    titulo: "Objetivos e incertidumbre",
    filas: [
      {
        id: "cercania",
        titulo: "Cercanía a tus objetivos",
        ayuda: "ponderada por tus barras, año normal",
        celda: (e, { pesos }) => {
          const total = cercania(e.puntos, pesos);
          return (
            <CeldaDato valor={<NumeroAnimado valor={total} />} unidad="%">
              <span className={css.objetivos}>
                {OBJETIVOS.map((o) => (
                  <span key={o}>
                    {NOMBRE_OBJETIVO[o]} {fmt(e.cercania_objetivos[o])}
                  </span>
                ))}
              </span>
              {e.que_le_falta.length > 0 && <Lista items={e.que_le_falta} vacio="" />}
            </CeldaDato>
          );
        },
      },
      {
        id: "tipo_anio",
        titulo: "Por tipo de año",
        ayuda: "cercanía en cada tercio de las 30 campañas",
        celda: (e, { pesos, salida }) => {
          const trio = cercaniaPorTipo(e.puntos, pesos);
          const t = salida.tipos_de_anio;
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
              <HuellaDato
                origen={{
                  fuente: `Terciles de ${t.metodo === "terciles_balance" ? "balance" : "lluvia"}, ${t.seco.length} campañas cada uno`,
                  anios: salida.periodo_clima,
                }}
              />
            </div>
          );
        },
      },
      {
        id: "probabilidad",
        titulo: "Probabilidad climatológica",
        ayuda: "frecuencia observada en las 30 campañas",
        celda: (e) => (
          <div className={css.celda}>
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
            {e.probabilidades[0] && <HuellaDato origen={{ fuente: e.probabilidades[0].fuente }} />}
          </div>
        ),
      },
    ],
  },
  {
    titulo: "Trazabilidad",
    filas: [
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
  },
];

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
 * Tabla técnica (RF11, RF12, RF21): siempre 4 columnas fijas (actual, A, B, C)
 * y todas las filas del MVP, agrupadas por lo que responden. Cada valor lleva
 * unidad y su huella (confianza, fuente, años, resolución). Una alternativa
 * descartada queda en gris rayado con el motivo. La cercanía se recalcula con
 * las barras del panel, sin pedir datos (RF13).
 */
export default function TablaTecnica({ salida }: { salida: Salida }) {
  const pesos = useEntradas((s) => s.objetivos);
  const actual = esDisponible(salida.estrategias[0]) ? salida.estrategias[0] : null;
  const ctx: Contexto = { salida, actual, pesos };
  // Ya trae los meses sin escena del satélite (servicio.py: "NDVI del lote · …")
  const falta = salida.informacion_falta;

  return (
    <div className={css.contenedor}>
      <LeyendaLinea />
      <ContrasteMediciones salida={salida} />
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
              <th
                key={e.id}
                scope="col"
                className={css.cabecera}
                data-id={e.id}
                data-disponible={e.disponible}
               
              >
                <div className={css.cabeceraFila}>
                  <InsigniaEstrategia id={e.id} descartada={!e.disponible} />
                  <div>
                    <div className={css.nombre}>{e.nombre}</div>
                    <div className={css.especies}>{e.especies}</div>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        {GRUPOS.map((g, gi) => (
          <tbody key={g.titulo}>
            <tr className={css.grupo}>
              <th scope="colgroup" colSpan={5}>
                {g.titulo}
              </th>
            </tr>
            {g.filas.map((f, fi) => (
              <tr key={f.id}>
                <th scope="row" className={css.titulo}>
                  {f.titulo}
                  {f.ayuda && <span className={css.ayuda}>{f.ayuda}</span>}
                </th>
                {salida.estrategias.map((e) => (
                  <td key={e.id} data-disponible={e.disponible}>
                    {esDisponible(e) ? f.celda(e, ctx) : <CeldaDescartada e={e} primera={gi === 0 && fi === 0} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {falta.length > 0 && (
        <p className={css.faltaGlobal}>
          <b>Información que falta en todo el análisis:</b> {falta.join(" · ")}.
        </p>
      )}
    </div>
  );
}
