# Frontend · Field Shift

Contexto, principios y alcance: `../CLAUDE.md` (no se repiten acá). Producto y requerimientos: `../docs/mvp-alcance.md`. Diseño visual: `./DESIGN.md`. Referencia navegable: `../docs/prototipo/field-shift-prototipo.html`.

Dueños: persona 4 (mapa y entradas) y persona 5 (resultados y diseño). Coordinar antes de tocar archivos del otro.

## Stack
**Next.js (App Router) + TypeScript + Tailwind + react-leaflet + recharts + zustand**, con vitest para los tests (ver `package.json`). El contrato de la API lo define la persona 1 en `../backend/app/api/contrato.py`.

## Requerimientos del front (MVP 4.3)
**Must:** RF1 mapa centrado en Córdoba (click, buscador, lat/lon editable) · RF2 rotación y calendario de 12 meses automático · RF4 cuatro objetivos **de 1 a 5** (por defecto 3) · RF5 restricciones solo de lista · RF10 valores por tipo de año y "sensible al clima" · RF11 tabla de 4 columnas con valor, unidad, fuente, años, resolución y confianza · RF12 textos con plantillas, sin IA · RF13 recalcular la cercanía al mover las barras, **sin volver a llamar a la API** y con la misma cuenta que el motor: prioridades al cuadrado (`Σ p²·v / Σ p²`) · RF21 "Información que falta" · RF22 aviso de apoyo visible · RF25 probabilidad climatológica en cada columna.

**Should:** RF3 editar fechas · RF6 encharca y textura · RF14 lo que vio el satélite · RF15 mediciones propias (al lado de NASA; los puntajes ya vienen mezclados del back) · RF16 erosión · RF17 NDVI con línea de tiempo · RF18 leyenda y valor al tocar · RF20 mail y PDF · RF26 subir la planilla CSV (`POST /mediciones/planilla` → vista previa → `mediciones_propias.serie_mensual` en `/analizar`; ver `../docs/plan-planilla-lluvia.md`).

**Could:** RF19 capas regionales · RF23 tooltips.

## Reglas de implementación
- **Un contrato, un tipo.** Los tipos de la respuesta de `/analizar` viven en un solo archivo (`src/lib/contrato.ts`) y copian `../backend/app/api/contrato.py`, que es el contrato vigente (el del MVP es solo un resumen). Es lo único que depende del back. Si el contrato cambia, se cambia ahí.
- **Datos falsos primero.** Un mock (`src/mocks/analizar.ts`) devuelve el contrato completo para el lote de Río Cuarto (≈ 33,2477° S, 64,2325° O). Un flag de entorno decide mock o API real; la URL del back va en una variable de entorno.
- **El front no calcula datos de NASA.** Solo recalcula la cercanía a los objetivos (RF13) con valores ya recibidos.
- **Capas del mapa: el back calcula, el front dibuja.** La escena NDVI de cada mes es la del back (`capas.ndvi_mensual[mes]`: colección, item, fecha), y la marca "Lote" de la leyenda es `visto_por_satelite.meses[mes].ndvi_medio`. La pendiente sale de `lote.pendiente_pct`. Nada de búsquedas de escenas propias, cálculo de la pendiente en el navegador ni valores ilustrativos. Todas las capas usan la campaña del back y el mismo `mes` (índice 0 = enero). Lo que viene (capas como `CapaRaster` con PNG, `bounds` comunes, escala y valores por píxel) está en `../docs/plan-armonizacion-capas.md`.
- **El color nunca es la única señal:** heladas con marca, conflictos con anillo, descartadas con rayado.
- **Compu primero.** En celular, la tabla hace scroll horizontal.
- **Una pieza por archivo** (`TarjetaEstrategia`, `CalendarioMeses`, `BarraObjetivo`…) para evitar conflictos de merge.
- Accesibilidad básica: foco visible, `aria-pressed`, `prefers-reduced-motion`, modo oscuro por `prefers-color-scheme`.
- Leaflet se carga solo en el cliente (`dynamic` con `ssr: false`). Mapa base Esri con su atribución. NDVI con las teselas de Planetary Computer de la escena del back, y NASA GIBS (`MODIS_Terra_L3_NDVI_16Day`, nivel 9) en los meses sin escena HLS. La pendiente (y después NDVI, erosión y cultivo por píxel) la calcula el backend y llega como capa raster (`src/lib/capaRaster.ts`): el front solo la dibuja.
- **Límites de zoom del mapa.** Esri no tiene imagen en todas las zonas a todos los zooms: en el lote de la demo llega a 18 y en 19 muestra "Map data not yet available" (el prototipo deja llegar a 19). Reglas:
  - Capa Esri con `maxNativeZoom: 17`, para que Leaflet agrande las teselas existentes en vez de pedir las que no hay. Vale para cualquier zona.
  - Mapa con `maxZoom: 18` y `minZoom: 5`.
  - Capas de datos con `maxNativeZoom` igual a su resolución real (NDVI GIBS: 9). Se ven los píxeles grandes a propósito: es la escala real del dato.

## Comandos
Desde `frontend/` (Node 20 o más):
- `npm install` · instala las dependencias (versiones fijas en `package.json`).
- `npm run dev` · servidor local en http://localhost:3000.
- `npm run build` · build de producción (es lo que corre Vercel).
- `npm run lint` y `npm run typecheck` · revisar antes de abrir un PR.
- `npm test` · tests de lógica pura con vitest (`src/**/*.test.ts`).
- Variables: copiar `.env.example` a `.env.local`. Sin `.env.local`, se usa el mock.

## Estructura
Referencia visual y de comportamiento: `../docs/prototipo/field-shift-prototipo.html` (prototipo final). Los componentes son React de verdad y **reusan las clases CSS del prototipo**, que está tal cual en `src/app/globals.css`.
- `src/app/` · `layout.tsx` (Inter, CSS de Leaflet y del prototipo) y `page.tsx` (monta mapa, panel y, en el paso 2, la hoja de la persona 5).
- `src/lib/entradas.ts` · tipos y valores iniciales de las entradas del productor. `src/lib/store.ts` · estado compartido (zustand): `useEntradas((s) => s.verano)` para leer, `cambiar({ … })` para escribir.
- `src/components/entradas/` · persona 4: `PanelEntradas` y una sección por archivo (`ElegirLote`, `BuscadorLote`, `ResumenLote`, `SeccionRotacion`, `SeccionObjetivos`, `SeccionRestricciones`, `SeccionDatosLote`, `SeccionMediciones`).
- `src/components/mapa/` · persona 4: `Mapa` (siempre vía `MapaDinamico`) y `BarraDibujo`.
- `src/components/comunes/` · `ClaseBody` (sincroniza `body.onb` con el paso) y `AvisoApoyo`.
- `public/img/` · imágenes de la intro (créditos en `CREDITOS.txt`).
- El paso 1 / paso 2 lo maneja el CSS del prototipo con `body.onb`; el estado `paso` lo decide.
- Sin conexión con el backend por ahora: la llamada a `/analizar` se arma en la auditoría.

## Fuera de alcance
Lo del `CLAUDE.md` raíz, más: chat o IA, alfalfa y pasturas, guardar comparaciones.
