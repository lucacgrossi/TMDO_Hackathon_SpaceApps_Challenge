"use client";

import { useShallow } from "zustand/react/shallow";
import { cambiosDesdeLaComparacion, listaDeCambios, useComparacion } from "@/lib/comparacion";
import { useEntradas } from "@/lib/store";
import css from "./desactualizado.module.css";

/**
 * Aviso de entrada vieja: el productor cambió algo en el panel después de
 * comparar. La hoja sigue mostrando la comparación anterior (marcada con
 * opacidad y con este texto, nunca solo con color) hasta que vuelve a comparar.
 *
 * Mover las barras de objetivos no lo muestra: la cercanía se recalcula sola (RF13).
 *
 * La región `role="status"` está siempre en el DOM (vacía si no hay cambios),
 * así el lector de pantalla anuncia el aviso cuando aparece.
 */
export default function AvisoDesactualizado() {
  const foto = useComparacion((s) => s.foto);
  const volverAComparar = useComparacion((s) => s.volverAComparar);
  // useShallow: la lista es un array nuevo en cada lectura, se compara por contenido
  const cambios = useEntradas(useShallow((s) => (foto ? cambiosDesdeLaComparacion(foto, s) : [])));
  const desactualizado = cambios.length > 0;

  return (
    <div role="status" className={css.region} data-desactualizado={desactualizado}>
      {desactualizado && (
        <div className={css.aviso}>
          <p className={css.texto}>
            <span className={css.etiqueta}>Desactualizado</span>
            Cambiaste {listaDeCambios(cambios)}: estos resultados son de la comparación anterior.
          </p>
          <button type="button" className={css.boton} onClick={volverAComparar}>
            Comparar con los datos nuevos
          </button>
        </div>
      )}
    </div>
  );
}
