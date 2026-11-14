"use client";

import { createContext, useContext } from "react";

/**
 * true durante la entrada de la hoja (`VENTANA_ENTRADA_MS` después de abrirla).
 * Lo lee `NumeroAnimado` para contar desde 0; el resto de la entrada es CSS
 * colgado de la clase `intro` de la hoja.
 */
export const EntradaHoja = createContext(false);

export const useEntradaHoja = () => useContext(EntradaHoja);
