"use client";

/**
 * F8 · Mediciones propias: pluviómetro (mm/año), años de registro y materia
 * orgánica (%) (RF15).
 *
 * "Años de registro" no está en el prototipo: lo pidió Back 2 en el PR #18
 * (MVP 4.3, `mediciones_propias.anios_registro`). Con eso el back decide
 * cuánto pesa la lluvia del pluviómetro frente a NASA. Es un entero ≥ 1.
 *
 * Sale del prototipo final: el acordeón `details data-a="mp"` con dos
 * `input type="number"` en `.sel3` (ids `lluvia` y `mo`, mismos min, max y
 * step) y el listener que guarda `S.lluvia`/`S.mo` (vacío = null).
 *
 * Por qué existen (CLAUDE.md): NASA es la base y las mediciones del
 * productor se muestran AL LADO, para contrastar y ajustar la confianza
 * ("Tu pluviómetro: 650 mm/año · NASA: 824 mm (−21 %)"); no cambian ningún
 * puntaje. Ese contraste lo arma el backend. Acá solo se cargan en el
 * store (`useEntradas.mediciones`): no cambian ningún cálculo del front ni
 * se mandan a ningún lado todavía. Sin mediciones, todo funciona solo con NASA.
 *
 * Los campos usan el CSS del prototipo (`input[type=number]`, `.sel3`).
 * `mediciones.css` solo agrega el aviso de fuera de rango (ver ahí por qué).
 */
import { useState } from "react";
import { traeLluvia } from "@/lib/planilla";
import { useEntradas } from "@/lib/store";
import estilos from "./Campos.module.css";
import ModalFormatoPlanilla from "./ModalFormatoPlanilla";
import SubirPlanilla from "./SubirPlanilla";
import "./mediciones.css";

type Campo = "lluviaAnualMm" | "aniosRegistro" | "materiaOrganicaPct";


/** Los dos campos, con los mismos atributos que el prototipo. */
const CAMPOS: {
  k: Campo;
  id: string;
  n: string;
  min: number;
  max: number;
  step: number;
  /** Unidad para el mensaje de fuera de rango. */
  u: string;
  /** true = solo números enteros (años). */
  entero?: boolean;
  placeholder: string;
}[] = [
  { k: "lluviaAnualMm", id: "lluvia", n: "Pluviómetro (mm/año)", min: 0, max: 2000, step: 10, u: "mm/año", placeholder: "Ej. 820" },
  { k: "aniosRegistro", id: "anios", n: "Años de registro", min: 1, max: 100, step: 1, u: "años", placeholder: "Ej. 8", entero: true },
  { k: "materiaOrganicaPct", id: "mo", n: "Materia orgánica (%)", min: 0, max: 10, step: 0.1, u: "%", placeholder: "Ej. 1,8" },
];

export default function SeccionMediciones() {
  const mediciones = useEntradas((s) => s.mediciones);
  const cambiar = useEntradas((s) => s.cambiar);

  /** Modal "Formato de la planilla" (S2b). */
  const [formatoAbierto, setFormatoAbierto] = useState(false);
  // Qué campo está fuera de rango, solo para mostrar el aviso. Es estado de
  // interfaz, no una entrada: por eso vive acá y no en el store.
  const [fuera, setFuera] = useState<Record<Campo, boolean>>({
    lluviaAnualMm: false,
    aniosRegistro: false,
    materiaOrganicaPct: false,
  });

  // Con una planilla que trae lluvia, manda la planilla (plan 4.2 y 5.3.9): el
  // pluviómetro y sus años de registro a mano se deshabilitan.
  const conPlanilla = traeLluvia(mediciones.planilla?.resultado ?? null);
  const deshabilitado = (k: Campo) => conPlanilla && (k === "lluviaAnualMm" || k === "aniosRegistro");

  const escribir = (c: (typeof CAMPOS)[number], input: HTMLInputElement) => {
    const v = input.validity;
    // rangeUnderflow/rangeOverflow los calcula el navegador con min y max.
    // No miramos stepMismatch: el step solo define cuánto suben las flechitas,
    // y el prototipo acepta cualquier número (por ejemplo 825 mm).
    // Para los años, además, tiene que ser entero (3,5 años no es un registro válido).
    const fueraDeRango =
      v.rangeUnderflow || v.rangeOverflow || (!!c.entero && input.value !== "" && !Number.isInteger(input.valueAsNumber));
    // input.value llega "" tanto si el campo está vacío como si lo escrito no
    // es un número (badInput). En los dos casos no hay medición: null, no 0.
    const valor = input.value === "" || fueraDeRango ? null : input.valueAsNumber;
    setFuera((f) => ({ ...f, [c.k]: fueraDeRango }));
    // getState() lee el valor más nuevo del store (no el de este render), así
    // cambiar un campo nunca pisa el otro.
    const actual = useEntradas.getState().mediciones;
    cambiar({ mediciones: { ...actual, [c.k]: valor } });
  };

  return (
    <div>
      <p className={estilos.ayuda}>
        Opcionales. Se comparan con NASA y, en los puntajes, pesan más según tus años de registro.
      </p>
      <SubirPlanilla alVerFormato={() => setFormatoAbierto(true)} />
      <ModalFormatoPlanilla abierto={formatoAbierto} onCerrar={() => setFormatoAbierto(false)} />
      <div className={estilos.subtitulo}>O cargalas a mano</div>
      <div className={estilos.grilla}>
        {CAMPOS.map((c) => (
          <label key={c.k} className={estilos.campo}>
            {c.n}
            <input
              type="number"
              className={estilos.control}
              id={c.id}
              min={c.min}
              max={c.max}
              step={c.step}
              placeholder={c.placeholder}
              // Campo no controlado (defaultValue): si React le forzara el
              // valor del store, un número a medio escribir como "1," (que
              // el navegador todavía lee como vacío) se borraría solo.
              defaultValue={mediciones[c.k] ?? ""}
              onChange={(e) => escribir(c, e.currentTarget)}
              disabled={deshabilitado(c.k)}
              title={deshabilitado(c.k) ? "Se usa la lluvia de tu planilla" : undefined}
              aria-invalid={fuera[c.k]}
              aria-describedby={fuera[c.k] ? `${c.id}-err` : undefined}
            />
            {fuera[c.k] && (
              // Aviso en texto (el color no es la única señal). Mientras está
              // fuera de rango, la medición queda en null: no se usa.
              <span className={estilos.error} id={`${c.id}-err`} role="alert">
                {c.entero ? "Número entero, " : "Fuera de rango: "}de {c.min} a {c.max.toLocaleString("es-AR")} {c.u}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
