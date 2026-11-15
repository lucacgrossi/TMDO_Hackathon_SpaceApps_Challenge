import { heladasCalor } from "@/lib/climaHistorico";
import type { ClimaMensual } from "@/lib/contrato";
import css from "./HeladasCalor.module.css";

/**
 * Heladas y calor por mes, de julio a junio, como frecuencia en las 30
 * campañas de NASA POWER (`clima_mensual.anios_con_helada` y `anios_con_35c`).
 * Siempre el conteo de años, no solo el porcentaje.
 */
export default function HeladasCalor({ clima }: { clima: ClimaMensual }) {
  const meses = heladasCalor(clima);
  const n = clima.n_anios;
  return (
    <section className={css.panel} aria-labelledby="heladas-calor-titulo">
      <h3 id="heladas-calor-titulo" className={css.titulo}>
        Heladas y calor por mes, en {n} campañas
      </h3>
      <div className={css.scroll}>
        <table className={css.tabla}>
          <caption className={css.oculto}>Cantidad de años, de {n}, con cada evento en cada mes</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={css.oculto}>Evento</span>
              </th>
              {meses.map((m) => (
                <th key={m.mes} scope="col">
                  {m.corto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Años con mínima bajo 0 °C</th>
              {meses.map((m) => (
                <td key={m.mes} title={m.textoHeladas} data-frecuente={clima.helada_frecuente[m.mes] === true}>
                  {m.heladas ?? "sin dato"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Años con máxima de 35 °C o más</th>
              {meses.map((m) => (
                <td key={m.mes} title={m.textoCalor}>
                  {m.calor ?? "sin dato"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className={css.pie}>
        <span className={css.leyenda}>
          <i className={css.muestra} aria-hidden="true" />
          Helada frecuente
        </span>
        <span>
          Años, de {n}, con cada evento. {clima.fuente}, {clima.periodo}.
        </span>
      </div>
    </section>
  );
}
