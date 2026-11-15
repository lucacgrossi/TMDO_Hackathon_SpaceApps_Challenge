"use client";

/**
 * F8 · Mediciones propias (RF15, RF26): solo por planilla CSV, con su registro
 * diario o mensual de lluvia y, si tiene estación, de temperaturas mínima y
 * máxima. No hay carga a mano: la planilla trae las mismas campañas que NASA
 * y los años de registro salen de ella.
 *
 * Por qué existen (CLAUDE.md): NASA es la base y las mediciones del productor
 * se muestran al lado para contrastar y ajustar la confianza; además el motor
 * las mezcla en los puntajes según sus años de registro. Todo eso lo hace el
 * back. Sin planilla, todo funciona solo con NASA.
 */
import { useState } from "react";
import estilos from "./Campos.module.css";
import ModalFormatoPlanilla from "./ModalFormatoPlanilla";
import SubirPlanilla from "./SubirPlanilla";

export default function SeccionMediciones() {
  /** Modal "Formato de la planilla" (S2b). */
  const [formatoAbierto, setFormatoAbierto] = useState(false);

  return (
    <div>
      <p className={estilos.ayuda}>
        Opcional. Subí tu planilla de lluvia y temperaturas: se compara con NASA en las mismas campañas y, en los
        puntajes, pesa más según tus años de registro.
      </p>
      <SubirPlanilla alVerFormato={() => setFormatoAbierto(true)} />
      <ModalFormatoPlanilla abierto={formatoAbierto} onCerrar={() => setFormatoAbierto(false)} />
    </div>
  );
}
