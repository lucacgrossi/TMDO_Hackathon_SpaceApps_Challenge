/**
 * Aviso "El mapa no puede cargar acá". Sale del bloque `.offline` del
 * prototipo (prototipo-body.html, al final) y de cómo lo dispara
 * (prototipo-app.js ~línea 51): Mapa.tsx cuenta las teselas que cargan y las
 * que fallan y decide cuándo mostrarlo; este componente solo lo dibuja.
 *
 * Por qué existe: sin internet (o en un visor que bloquea lo externo) la
 * imagen satelital no llega y el mapa queda negro. Mejor decirlo que dejar
 * al usuario pensando que la app se rompió.
 */
export default function AvisoSinConexion({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="offline" role="alert">
      <b>El mapa no puede cargar acá</b>
      Esta vista bloquea los mapas y los datos de NASA. Abrí la app en Chrome con internet.
    </div>
  );
}
