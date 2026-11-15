# Frontend · AgroPixel

Contexto, principios y alcance: `../CLAUDE.md` (no se repiten acá). Producto y requerimientos: `../docs/mvp-alcance.md`. **Guía de la API para el front: `../docs/api-frontend.md`** (rutas, errores, cada campo de la salida, cómo dibujar capas y meses). **Diseño visual: `./DESIGN.md` y el Figma [AgroPixel · Rediseño del front](https://www.figma.com/design/uQbWWU8RVCaWDeVma4Padn)** (pantallas S1 a S3b; el dashboard está en el mockup `../docs/prototipo/agropixel-dashboard-mockup.html`). El prototipo `../docs/prototipo/field-shift-prototipo.html` queda solo como referencia de comportamiento del mapa.

Dueños y reparto del rediseño (persona 4, persona 5 y Luca): **`./PLAN.md`**. Coordinar antes de tocar archivos de otro.

## Stack
**Next.js (App Router) + TypeScript + Tailwind + react-leaflet + recharts + zustand**, con vitest para los tests (ver `package.json`). El contrato de la API lo define la persona 1 en `../backend/app/api/contrato.py`.

## Requerimientos del front (MVP 4.5)
**Must:** RF1 marcar el lote en el mapa (dibujo por esquinas que se arrastran, buscador, coordenadas, GPS; sin lote de ejemplo) · RF2 rotación y calendario de 12 meses automático · RF4 cuatro prioridades **de 1 a 5** (por defecto 3) · RF5 restricciones solo de lista · RF10 valores por tipo de año y "sensible al clima" · RF11 tabla de 4 columnas con valor, unidad, fuente, años, resolución y confianza · RF12 textos con plantillas, sin IA · RF13 recalcular la cercanía al mover las prioridades, **sin volver a llamar a la API** y con la misma cuenta que el motor: prioridades al cuadrado (`Σ p²·v / Σ p²`) · RF21 "Información que falta" · RF22 aviso de apoyo visible · RF25 probabilidad climatológica en cada columna.

**Should:** RF3 editar fechas · RF6 encharca y textura · RF14 lo que vio el satélite · RF15 mediciones propias, solo por planilla (al lado de NASA; los puntajes ya vienen mezclados del back) · RF16 erosión · RF17 NDVI con línea de tiempo · RF18 leyenda y valor del píxel (inspector) · RF20 exportar PDF (hoja de impresión) · RF24 clima histórico por campaña · RF26 subir la planilla CSV con el modal de formato (`POST /mediciones/planilla` → vista previa → `mediciones_propias.serie_mensual` en `/analizar`; ver `../docs/plan-planilla-lluvia.md`).

**Could:** RF19 capas regionales · RF23 tooltips.

## Flujo y estado
- El flujo tiene cuatro etapas: `etapa: 'marcar' | 'configurar' | 'cargando' | 'dashboard'`, y el dashboard tres secciones: `seccion: 'mapa' | 'clima' | 'rotaciones'`. Las dos viven en un store `useApp` (`src/lib/app.ts`) y reemplazan a `paso` y `body.onb` (`ClaseBody`). `hojaAbierta` sigue en `useVista` (`src/lib/vista.ts`) porque la leen `encuadre.ts` y `comparacion.ts`; las reglas `body.onb` que quedan en `globals.css` son CSS del prototipo sin uso.
- `marcar`: mapa solo. Al cerrar el polígono pasa a `configurar`. No hay lote de ejemplo: el productor siempre marca el suyo.
- `configurar`: mapa + panel de entradas; las esquinas del lote se arrastran para ajustarlo (`EsquinasLote`). "Analizar lote" pasa a `cargando` y dispara `/analizar`.
- `cargando`: pantalla de carga. Con respuesta OK pasa a `dashboard` (sección `mapa`); con error vuelve a `configurar` mostrando el error (422 / 503).
- "Editar lote y entradas" del dashboard vuelve a `configurar` sin perder el resultado; si las entradas cambian, el dashboard muestra la banda "Cambiaste entradas después del análisis".
- Se mantienen `useEntradas`, `useMapa`, `useCapas`, `useDibujo`, `useComparacion`, `useResultadoStore`, `lib/api.ts`, `lib/aEntrada.ts`, `lib/cercania.ts` y sus tests.

## Reglas de implementación
- **Un contrato, un tipo.** Los tipos de la respuesta de `/analizar` viven en un solo archivo (`src/lib/contrato.ts`) y copian `../backend/app/api/contrato.py`, que es el contrato vigente (el del MVP es solo un resumen). Es lo único que depende del back. Si el contrato cambia, se cambia ahí.
- **Datos falsos primero.** Un mock (`src/mocks/analizar.ts`) devuelve el contrato completo para el lote de Río Cuarto (≈ 33,2477° S, 64,2325° O). Un flag de entorno decide mock o API real; la URL del back va en una variable de entorno.
- **El front no calcula datos de NASA.** Solo recalcula la cercanía a los objetivos (RF13) con valores ya recibidos. Tampoco calcula la campaña ni el período: muestra `periodo_clima` y `visto_por_satelite.campana` como vienen.
- **Capas del mapa: el back calcula, el front dibuja.** Cada capa llega como `CapaRaster` (PNG + `bounds` comunes + `escala` + `valores` por píxel; `src/lib/capaRaster.ts`) y se dibuja como `ImageOverlay` con `image-rendering: pixelated`, recortado al contorno del lote (`lib/recorteRaster.ts`). La leyenda lee `capa.escala` y el inspector de píxel lee `valores[fila][columna]`. Nada de búsquedas de escenas propias, cálculos en el navegador ni valores ilustrativos. Todas las capas usan la campaña del back y el mismo `mes` (índice 0 = enero; la línea de tiempo se muestra de julio a junio). Detalle en `../docs/plan-armonizacion-capas.md`.
- **Estilos:** tokens en `:root` de `src/app/globals.css` (los de `DESIGN.md`, un solo tema claro) y **un CSS module por componente**. El CSS del prototipo que hoy está en `globals.css` se borra a medida que cada pantalla se migra; no se agregan clases globales nuevas.
- **Fuentes:** Pixelify Sans (títulos) e IBM Plex Sans (todo lo demás) por `next/font/local` en `layout.tsx`, con los `woff2` en `src/app/fuentes/` (licencia OFL). No se usa `next/font/google`: el build de Vercel fallaba seguido al bajarlas.
- **Meses:** todo array de 12 de la API tiene índice 0 = enero. Lo que se muestra como campaña (línea de tiempo, calendarios, gráficos) va de julio a junio rotando `[6..11, 0..5]` con `ORDEN_CAMPANIA` de `src/lib/contrato.ts` (`calendario.ts` tiene una copia, `ORDEN_CAMPANA`, para sus helpers); nadie rota a mano en un componente.
- **`null` es "sin dato"**, nunca 0. Los textos que manda el back (`resumen`, `texto`, `motivo`…) se muestran tal cual.
- **El color nunca es la única señal:** terciles con letra, barbecho con patrón, confianza con texto, descartadas con el motivo.
- **Compu primero.** En celular, la tabla hace scroll horizontal y la barra lateral pasa a una barra inferior.
- **Una pieza por archivo** (`TarjetaEstrategia`, `InspectorPixel`, `ModalFormatoPlanilla`…) para evitar conflictos de merge.
- Accesibilidad: foco visible (`--cielo`), `aria-pressed`, `aria-current`, modal con foco atrapado, `prefers-reduced-motion`.
- Leaflet se carga solo en el cliente (`dynamic` con `ssr: false`). Mapa base Esri con su atribución. Si un mes de NDVI no trae raster, se usa la escena del back en teselas de Planetary Computer o NASA GIBS (`MODIS_Terra_L3_NDVI_16Day`, nivel 9).
- **Límites de zoom del mapa.** Esri no tiene imagen en todas las zonas a todos los zooms: en el lote de la demo llega a 18 y en 19 muestra "Map data not yet available". Reglas:
  - Capa Esri con `maxNativeZoom: 17`, para que Leaflet agrande las teselas existentes en vez de pedir las que no hay. Vale para cualquier zona.
  - Mapa con `maxZoom: 18` y `minZoom: 5`.
  - Capas de datos con `maxNativeZoom` igual a su resolución real (NDVI GIBS: 9). Se ven los píxeles grandes a propósito: es la escala real del dato.
- **PDF:** "Exportar PDF" llama a `window.print()`; la hoja de impresión es un componente (`HojaImpresion`) visible solo en `@media print`. Sin librerías de PDF.

## Comandos
Desde `frontend/` (Node 20 o más):
- `npm install` · instala las dependencias (versiones fijas en `package.json`).
- `npm run dev` · servidor local en http://localhost:3000.
- `npm run build` · build de producción (es lo que corre el `Dockerfile` en Cloud Build).
- **Sin Vercel:** `vercel.json` apaga los deploys desde git (`git.deploymentEnabled: false`), así que ningún push ni PR genera un deploy ni un preview en Vercel. Para revisar un PR se prueba local con `npm run dev`; la CI de GitHub corre el build igual.
- `npm run lint` y `npm run typecheck` · revisar antes de abrir un PR.
- `npm test` · tests de lógica pura con vitest (`src/**/*.test.ts`).
- Variables: copiar `.env.example` a `.env.local`. Sin `.env.local`, se usa el mock.

## Deploy (Cloud Run, desde el 15/11)
`https://agropixel.earth` y `www` sirven el servicio de Cloud Run **`agropixel-web`** (proyecto `nasa-space-app-fieldchange`, región `southamerica-east1`) detrás de un balanceador HTTPS global (IP `8.232.221.137`, certificado de Google en el mapa `agropixel-map`). No se usa más Vercel.

**Cada push a `main` que toque `frontend/` deploya solo** (`.github/workflows/deploy.yml`, ver `backend/DEPLOY.md` → Deploy automático). No hace falta Docker local: el build corre en Cloud Build. Deploy manual, solo para cambiar instancias o recursos, desde `frontend/` con `main` actualizado:
```bash
gcloud run deploy agropixel-web --source . --region southamerica-east1 --allow-unauthenticated \
  --port 8080 --memory 1Gi --cpu 1 --cpu-boost --min-instances 1 --max-instances 4
```
- `NEXT_PUBLIC_USAR_MOCK=false` y `NEXT_PUBLIC_API_URL` están fijas en el `Dockerfile` y se graban al compilar: si cambian, se edita ahí y se vuelve a deployar.
- `.gcloudignore` es obligatorio: deja afuera `node_modules/`, `.next/` y todo `.env*` (un `.env.local` con el mock activado dejaría la app con datos falsos). `.dockerignore` tiene lo mismo.
- El balanceador y el dominio no se tocan al deployar. Volver atrás: `gcloud run services update-traffic agropixel-web --region southamerica-east1 --to-revisions <REVISION>=100`.
- Después de la demo: `gcloud run services update agropixel-web --region southamerica-east1 --min-instances 0`.

## Estructura
- `src/app/` · `layout.tsx` (fuentes, CSS de Leaflet y tokens), `page.tsx` (elige la pantalla según `etapa`), `icon.png` y `apple-icon.png` (favicon recortado del logo).
- `src/lib/` · estado (`app.ts`, `store.ts`, `mapa.ts`, `capas.ts`, `dibujo.ts`, `comparacion.ts`, `resultado.ts`), contrato y conexión con el back (`contrato.ts`, `api.ts`, `aEntrada.ts`) y lógica pura con tests.
- `src/components/marcar/` · persona 4: `PantallaMarcar` (buscador y GPS; usa `BuscadorLote` de `entradas/` y `BarraDibujo` de `mapa/`).
- `src/components/entradas/` · persona 4: `PanelEntradas` y una sección por archivo (`SeccionRotacion`, `SeccionObjetivos`, `SeccionRestricciones`, `SeccionDatosLote`, `SeccionMediciones`, `SubirPlanilla`, `ModalFormatoPlanilla`).
- `src/components/carga/` · persona 4: `PantallaCarga` (planta pixel) y `ErrorAnalisis`.
- `src/components/mapa/` · persona 4: `Mapa` (siempre vía `MapaDinamico`), `BarraDibujo`, `CapaDibujo`, `EsquinasLote` y las capas del mapa de dibujo. `SelectorCapas`, `LineaTiempo` y `Leyenda` ya no los importa nadie: se borran.
- En el rediseño del 15/11, la sección Mapa del dashboard (`SeccionMapa`, `MapaLote`, `InspectorPixel`, `FichaLote` y los componentes `*Lote`) y `src/components/clima/` los tomó Luca (`PLAN.md`); el mapa de dibujo sigue siendo de persona 4.
- `src/components/dashboard/` · persona 5: `Dashboard`, `BarraLateral`, `Encabezado`.
- `src/components/clima/` · persona 5: `ClimaHistorico`, `SelectorCampanias`, `GraficoCampania` (recharts), `HeladasCalor`.
- `src/components/resultados/` · persona 5: `Rotaciones`, `TarjetaEstrategia`, `PanelTrazabilidad`, `TablaTecnica`, `ChoqueObjetivos`, `ContrasteMediciones` (lo usa Clima histórico), `PildoraConfianza`, `HojaImpresion`.
- `src/components/comunes/` · `AvisoApoyo`, `Boton`, `IconoPixel`, `Toast`, `ListaSugerencias`, `AtajoEtapa`, `PantallaPendiente`.
- `public/img/agropixel-logo.png` · logo. `public/plantillas/mediciones.csv` · plantilla de la planilla.

## Fuera de alcance
Lo del `CLAUDE.md` raíz, más: chat o IA, alfalfa y pasturas, guardar comparaciones, modo oscuro.
