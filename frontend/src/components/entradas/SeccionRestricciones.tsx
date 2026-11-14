"use client";

/**
 * F7 · Restricciones: chips de sí/no y "No sembrar" (RF5, solo de lista).
 *
 * Sale del prototipo final: el bloque `data-a="res"` (chips con `data-r`) y
 * el armado de `#nos` (un `.chip.no` por cultivo de NOS). Son botones con
 * `aria-pressed`: el lector de pantalla anuncia "presionado" y el CSS del
 * prototipo los pinta según ese mismo atributo, así no hay dos fuentes de verdad.
 *
 * Qué hacen después: el motor de reglas descarta una alternativa si choca con
 * una restricción (por ejemplo, sin vicia ni centeno no hay columna A) y la
 * muestra en gris con el motivo. Acá solo se cargan.
 */
import { useEntradas } from "@/lib/store";
import { NO_SEMBRAR, type CultivoNoSembrar, type Entradas } from "@/lib/entradas";
import { C } from "@/lib/calendario";

type Restriccion = keyof Entradas["restricciones"];

/** Chips de restricciones fijas, en el orden del prototipo. */
const RESTRICCIONES: { k: Restriccion; n: string }[] = [
  { k: "sinRiego", n: "Sin riego" },
  { k: "sinHacienda", n: "Sin hacienda" },
  { k: "maquinariaLimitada", n: "Maquinaria limitada" },
];

export default function SeccionRestricciones() {
  const restricciones = useEntradas((s) => s.restricciones);
  const noSembrar = useEntradas((s) => s.noSembrar);
  const cambiar = useEntradas((s) => s.cambiar);

  const alternar = (k: Restriccion) =>
    cambiar({ restricciones: { ...restricciones, [k]: !restricciones[k] } });

  // noSembrar es una lista: si el cultivo está, se saca; si no está, se agrega.
  const alternarCultivo = (k: CultivoNoSembrar) =>
    cambiar({
      noSembrar: noSembrar.includes(k) ? noSembrar.filter((x) => x !== k) : [...noSembrar, k],
    });

  return (
    <div className="blk" data-a="res">
      <h3>Restricciones</h3>
      <div className="chips">
        {RESTRICCIONES.map((r) => (
          <button
            key={r.k}
            type="button"
            className="chip"
            aria-pressed={restricciones[r.k]}
            onClick={() => alternar(r.k)}
          >
            {r.n}
          </button>
        ))}
      </div>
      <div className="sub" id="nos-t">
        No sembrar
      </div>
      {/* Variante .no del prototipo: activa se pinta en rojo (--bad). */}
      <div className="chips" id="nos" role="group" aria-labelledby="nos-t">
        {NO_SEMBRAR.map((k) => (
          <button
            key={k}
            type="button"
            className="chip no"
            aria-pressed={noSembrar.includes(k)}
            onClick={() => alternarCultivo(k)}
          >
            {C[k].n}
          </button>
        ))}
      </div>
    </div>
  );
}
