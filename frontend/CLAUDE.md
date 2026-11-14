# Frontend · Field Shift

Contexto, principios y alcance: `../CLAUDE.md` (no se repiten acá). Producto y requerimientos: `../docs/mvp-alcance.md`. Diseño visual: `./DESIGN.md`. Referencia navegable: `../docs/prototipo/field-shift-prototipo.html`.

Dueños: persona 4 (mapa y entradas) y persona 5 (resultados y diseño). Coordinar antes de tocar archivos del otro.

## Stack (propuesto, confirmar con la persona 1)
El MVP y el `CLAUDE.md` raíz dicen que el stack y el contrato de la API los define la persona 1. Hasta que lo cierre, esto es lo que usa el prototipo y la guía del equipo: **Next.js (App Router) + TypeScript + Tailwind + react-leaflet + recharts**. No asumir más que eso.

## Requerimientos del front (del MVP)
**Must:** RF1 mapa centrado en Córdoba (click, buscador, lat/lon editable) · RF2 rotación y calendario de 12 meses automático · RF4 cuatro objetivos 0–5 (por defecto 3) · RF5 restricciones solo de lista · RF10 valores por tipo de año y "sensible al clima" · RF11 tabla de 4 columnas con valor, unidad, fuente, años, resolución y confianza · RF12 textos con plantillas, sin IA · RF13 recalcular la cercanía al mover las barras, **sin volver a llamar a la API** · RF21 "Información que falta" · RF22 aviso de apoyo visible.

**Should:** RF3 editar fechas · RF6 encharca y textura · RF14 lo que vio el satélite · RF15 mediciones propias · RF16 erosión · RF17 NDVI con línea de tiempo · RF18 leyenda y valor al tocar · RF20 mail y PDF.

**Could:** RF19 capas regionales · RF23 tooltips.

## Reglas de implementación
- **Un contrato, un tipo.** Los tipos de la respuesta de `/analizar` viven en un solo archivo (`src/lib/contrato.ts`) y copian el contrato del MVP. Es lo único que depende del back. Si el contrato cambia, se cambia ahí.
- **Datos falsos primero.** Un mock (`src/mocks/analizar.ts`) devuelve el contrato completo para el lote de Río Cuarto (≈ 33,2477° S, 64,2325° O). Un flag de entorno decide mock o API real; la URL del back va en una variable de entorno.
- **El front no calcula datos de NASA.** Solo recalcula la cercanía a los objetivos (RF13) con valores ya recibidos.
- **El color nunca es la única señal:** heladas con marca, conflictos con anillo, descartadas con rayado.
- **Compu primero.** En celular, la tabla hace scroll horizontal.
- **Una pieza por archivo** (`TarjetaEstrategia`, `CalendarioMeses`, `BarraObjetivo`…) para evitar conflictos de merge.
- Accesibilidad básica: foco visible, `aria-pressed`, `prefers-reduced-motion`, modo oscuro por `prefers-color-scheme`.
- Leaflet se carga solo en el cliente (`dynamic` con `ssr: false`). Mapa base Esri con su atribución; NDVI de NASA GIBS (`MODIS_Terra_L3_NDVI_16Day`, nivel 9) y pendiente de AWS Terrain Tiles, como en el prototipo.
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
- Variables: copiar `.env.example` a `.env.local`. Sin `.env.local`, se usa el mock.

## Estructura
- `src/app/` · `layout.tsx` (fuente Inter, tokens) y `page.tsx` (mapa + panel + hoja).
- `src/components/` · una pieza por archivo. `Mapa.tsx` se importa siempre con `MapaDinamico.tsx`.
- `src/lib/` · `mapa.ts` (lote demo y límites de zoom). Acá van `contrato.ts` y `cercania.ts`.
- Tailwind toma los colores de las variables CSS de `globals.css` (`bg-panel`, `text-muted`, `bg-accent`…).

## Fuera de alcance
Lo del `CLAUDE.md` raíz, más: chat o IA, alfalfa y pasturas, guardar comparaciones.
