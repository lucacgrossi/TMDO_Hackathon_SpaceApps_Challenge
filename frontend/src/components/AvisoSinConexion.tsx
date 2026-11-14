/**
 * Se muestra si el navegador bloquea los mapas o los datos de NASA.
 * Marcado del prototipo, con los mismos ids y clases: lo usa src/prototipo/iniciar.ts.
 */
export default function AvisoSinConexion() {
  return (
    <>
      <div className="offline" id="offline" role="alert" hidden><b>El mapa no puede cargar acá</b>Esta vista bloquea los mapas y los datos de NASA. Abrí el archivo en Chrome con internet.</div>
    </>
  );
}
