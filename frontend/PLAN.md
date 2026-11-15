# Plan del front · rediseño AgroPixel (domingo 15/11)

**Código congelado a las 18:00.** Diseño: `DESIGN.md`, el Figma [AgroPixel · Rediseño del front](https://www.figma.com/design/uQbWWU8RVCaWDeVma4Padn) (S1 a S3b y componentes) y el mockup `../docs/prototipo/agropixel-dashboard-mockup.html` (S4 a S6b). Reglas: `CLAUDE.md` de esta carpeta. Producto: `../docs/mvp-alcance.md` (4.5).

## Antes de empezar (todos)
1. Traer `dev` actualizado (trae el contrato de la 4.5: PR #86) y crear la branch desde ahí.
2. Leer `DESIGN.md` y las secciones de **`../docs/api-frontend.md`** que tocan a cada uno:
   - **Persona 4:** §4.1 (entrada de `/analizar`: qué se manda desde el panel), §4.2 (errores 422 y 503, para S3b) y §5 (`/mediciones/planilla`: vista previa, avisos y errores, para S2 y el modal).
   - **Persona 5:** §4.3 (convenciones: índice 0 = enero, textos tal cual, `null` = sin dato), §4.5 (`estrategias`, las 4 columnas), §4.6 (recalcular la cercanía) y §4.11 (`choque`).
   - **Luca:** §4.7 (clima y `mensual`), §4.8 (`visto_por_satelite`) y §4.9 (`capas`, `CapaRaster`, valor de un píxel).
3. Los meses: índice 0 = enero en toda la API; para mostrar de julio a junio, usar el helper de `src/lib/` (llega en el PR de Luca, etapa 1), no rotar a mano.

Tres personas en el front. Cada una es dueña de sus carpetas y no toca las de las otras sin avisar. Todo con mock primero (`NEXT_PUBLIC_USAR_MOCK=true`); la API real se prueba en la integración.

| Quién | Qué | Pantallas | Fuente del diseño |
|---|---|---|---|
| **Persona 4** | Base común + todo lo que pasa antes del dashboard | S1 marcar lote · S2 panel de entradas · S2b modal del formato · S3 carga · S3b errores | Figma |
| **Persona 5** | Esqueleto del dashboard + Rotaciones + PDF | Barra lateral y encabezado · S6 Rotaciones · S6b hoja de impresión | Figma (componentes) + mockup |
| **Luca** (con Claude) | Las secciones del mockup que quedan + revisión de todos los PRs | S4 Mapa · S5 Clima histórico | Mockup |

## Paso 0 · Base común (persona 4, primero de todo, ~1 h)
Un solo PR chico que desbloquea a los demás. Se mergea antes de que nadie toque `page.tsx` o `globals.css`.
- `src/lib/app.ts`: store `useApp` con `etapa: 'marcar' | 'configurar' | 'cargando' | 'dashboard'`, `seccion: 'mapa' | 'clima' | 'rotaciones'` y las acciones (`irA`, `analizar`, `volverAEditar`). Tests de las transiciones en `app.test.ts`.
- `src/app/page.tsx`: elige la pantalla según `etapa`; en `dashboard`, monta `<Dashboard />` (de persona 5) con un placeholder por sección hasta que lleguen.
- `src/app/layout.tsx`: Pixelify Sans + IBM Plex Sans por `next/font/google`, título "AgroPixel". Se saca Inter.
- `src/app/globals.css`: tokens de `DESIGN.md` en `:root` (un solo tema, sin `prefers-color-scheme`) y `tailwind.config.ts` apuntando a esos tokens. El CSS del prototipo **queda** hasta que cada dueño migre su pantalla; al final del día se borra lo que nadie use.
- `src/components/comunes/`: `Boton` (Primario, Secundario, Fantasma), `IconoPixel` (los 6 SVG de 16 × 16 del Figma, página 01) y `AvisoApoyo` con el estilo nuevo.
- Se retiran `ClaseBody` y el manejo de `body.onb`.

## Persona 4 · Antes del dashboard
Carpetas: `components/marcar/`, `components/entradas/`, `components/carga/`.
1. **S1 Marcar lote** (`PantallaMarcar`): mapa solo, caja de buscar o probar, barra de dibujo. Reusa `BuscadorLote`, `CapaDibujo`, `BarraDibujo`, `MapaDinamico`. Al cerrar el polígono o elegir el ejemplo: `etapa = 'configurar'`.
2. **S2 Panel de entradas** (`PanelEntradas` como panel derecho de 400 px con pie fijo): reusa las `Seccion*` con el componente `SeccionPlegable` nuevo y el resumen de cada sección cuando está cerrada. Botón "Analizar lote".
3. **S2b `ModalFormatoPlanilla`**: pestañas Diaria / Mensual, ejemplo, qué acepta, rangos, límites y "Descargar plantilla". Texto de `../docs/plan-planilla-lluvia.md` §2–3. Foco atrapado y Esc.
4. **S3 `PantallaCarga`**: planta pixel de 5 fotogramas (bitmaps en el Figma, S3), tiempo transcurrido y la lista "Qué se consulta". Sin porcentaje. **S3b `ErrorAnalisis`** para 422 y 503.
5. Conectar: "Analizar lote" → `etapa = 'cargando'` → `resultado.ts` pide `/analizar` → OK: `dashboard` / error: vuelve a `configurar` con `ErrorAnalisis`.

## Persona 5 · Dashboard y Rotaciones
Carpetas: `components/dashboard/`, `components/resultados/`.
1. **Esqueleto** (`Dashboard`, `BarraLateral`, `Encabezado`): barra lateral de 232 px con logo, las 3 secciones, "Editar lote y entradas" y el aviso; encabezado con el título y la ficha del lote (Superficie, Campaña satelital, Clima, Tus mediciones) desde la respuesta, sin calcular nada. **Hacerlo primero**, así Luca monta sus secciones adentro.
2. **S6 Rotaciones** (`Rotaciones`): prioridades en línea (reusa `SeccionObjetivos`, mismo estado `useEntradas`), banda de choque (`ChoqueObjetivos`), las 4 `TarjetaEstrategia` con el diseño nuevo (calendario jul→jun, cercanía, balance por tipo de año con S/N/H, una probabilidad, los 5 puntos plegables, descartada en gris) y debajo la `TablaTecnica` restilizada.
3. **S6b `HojaImpresion`** + "Exportar PDF" (`window.print()`, `@media print`, A4 apaisada). Reemplaza el PDF de `MenuCompartir`.
4. Se retiran `HojaComparacion`, `InterruptorVista`, `TarjetasEstrategias` (si queda sin uso) y la animación de entrada de la hoja.

## Luca · Mapa, Clima histórico y revisión
Carpetas: `components/mapa/` (solo la sección del dashboard: `SeccionMapa`, `InspectorPixel`, `FichaLote`, y los cambios en `SelectorCapas`, `LineaTiempo`, `Leyenda`) y `components/clima/`. El mapa de dibujo de S1 y S2 es de persona 4: si hay que tocar `Mapa.tsx` o `CapaDibujo.tsx`, se avisa.
1. **S4 Mapa**: capas del back como `ImageOverlay` pixelado (NDVI ×12, pendiente, cultivo, erosión) y la celda de POWER; selector de capas con Cultivo y Erosión; línea de tiempo jul→jun con la barrita del NDVI medio de cada mes; leyenda desde `capa.escala`; `InspectorPixel` leyendo `valores[fila][columna]` (`capaRaster.ts`); `FichaLote` con 6 filas y su confianza.
2. **S5 Clima histórico**: `SelectorCampanias` (30 barras por tercio, con letra), `GraficoCampania` con recharts (lluvia contra la media, T mín y T máx), ficha de la campaña, `HeladasCalor` (frecuencias de `clima_mensual`) y `ContrasteMediciones`. Los meses de cada campaña vienen en `serie_anual.campanas[i].mensual` (Back 1, PR #86, ya en `dev`): sumar `MesesCampana` a `src/lib/contrato.ts` y al mock. Sus `t_min_c`/`t_max_c` son extremos del mes y se comparan con `minima_media_c`/`maxima_media_c`. Si `mensual` viene `null`, media de 30 años y selector deshabilitado.
3. **Revisión de todos los PRs del front** antes de mergear a `dev` (checklist abajo).
4. Al final: cambiar "Field Shift" por "AgroPixel" en `compartir.ts` y su test, y borrar el CSS del prototipo que quede sin uso.

### Punto de montaje de Mapa y Clima histórico (para el `Dashboard` de persona 5)
Las dos secciones ya están en `dev` (Mapa en el PR #88, Clima histórico en el #89) y son autocontenidas: reciben la respuesta de `/analizar` por props y no tocan `page.tsx`, `globals.css` ni `layout.tsx`. El `Dashboard` las monta así:

```tsx
import ClimaHistorico from "@/components/clima/ClimaHistorico";
import SeccionMapa from "@/components/mapa/SeccionMapa";
import { useSalidaDashboard } from "@/lib/salidaDashboard";

const salida = useSalidaDashboard(); // null mientras carga o con error
// …dentro del área de contenido, según useApp().seccion:
{salida && seccion === "mapa" && <SeccionMapa salida={salida} />}
{salida && seccion === "clima" && <ClimaHistorico salida={salida} />}
```

- `useSalidaDashboard` (`src/lib/salidaDashboard.ts`) devuelve la última respuesta lista, también la del mock y la de la demo precalculada (`es_mock`). No usar `useSalidaDelLote` acá: esa descarta el mock.
- Ancho: las dos piden todo el área de contenido. Arman su propia grilla con una ficha de 280 px a la derecha y pasan a una columna debajo de 1100 px. El mapa mide 640 px de alto.
- El mes es `useVista().mes` (0 = enero) y arranca en julio. La capa del mapa es `useMapaLote` (`src/lib/mapaLote.ts`). Ninguna sección necesita props además de `salida`.
- Leaflet se carga solo en el navegador (`SeccionMapa` hace el `dynamic` adentro). `layout.tsx` tiene que seguir importando `leaflet/dist/leaflet.css`.
- Mientras no esté la base (paso 0), los CSS modules usan `var(--token, valor de DESIGN.md)`. Las fuentes de los títulos usan `var(--font-pixelify)` y `var(--font-plex)`: si `layout.tsx` les pone otro nombre, avisar.
- Cuando `page.tsx` y `Mapa.tsx` (persona 4) dejen de usarlos, se borran `SelectorCapas`, `LineaTiempo`, `Leyenda`, `CapaNdvi`, `CapaPendiente`, `CapaClima` y `EncuadreCapa`: el dashboard usa `SelectorCapasLote`, `LineaTiempoLote`, `LeyendaLote` y `MapaLote`.

## Horarios
| Hora | Hito |
|---|---|
| 10:00 | PR de la base (paso 0) mergeado. Persona 5 con el esqueleto del dashboard en un PR |
| 13:00 | Cada pantalla anda con el mock, en su PR |
| 15:30 | Todo mergeado en `dev`. Prueba de punta a punta con la API real (Cloud Run) y con el lote de ejemplo sin conexión |
| 17:00 | `dev` → `main` (persona 3). Prueba en la URL de la demo |
| 18:00 | Código congelado |

**Si no llega, se recorta en este orden:** animación de la planta (queda un cuadro fijo) → íconos pixel (íconos simples) → selector de campaña (queda la media de 30 años) → capa de cultivo → animación del lote "pixelándose". **Nunca** se tocan las 4 columnas, los 5 puntos de cada una ni la incertidumbre por tipo de año con su probabilidad.

## Cómo trabajamos
- Branches `<nombre>/<tipo>/front-<descripcion>` desde `dev`; PR a `dev`, chicos y seguidos (uno por pantalla). Commits `<tipo>(front): …`.
- Antes de pedir revisión: `npm run lint && npm run typecheck && npm test && npm run build` en `frontend/`, y una captura de la pantalla en el PR.
- Lógica nueva en `src/lib/` con su test de vitest (orden jul→jun, valor del píxel, elección de campaña, transiciones de `useApp`).
- Si algo necesita un cambio de contrato, se pide a Back 1; nunca se calcula en el front.

## Checklist de revisión (Luca)
- [ ] Respeta el contrato (`src/lib/contrato.ts`) y no calcula datos de NASA, campaña ni período en el front.
- [ ] Cada valor muestra unidad, fuente, resolución y confianza (o está a un clic).
- [ ] Sin "te recomendamos", "deberías" ni "la mejor" (lo revisa también `lenguaje_prohibido.py` en la CI).
- [ ] Las 4 columnas siempre presentes; la descartada en gris con el motivo.
- [ ] Usa los tokens y componentes de `DESIGN.md` (sin colores sueltos, sin mayúsculas en etiquetas, sin flechas en botones). Las escalas de las capas vienen del back.
- [ ] El color nunca es la única señal; foco visible; `prefers-reduced-motion`.
- [ ] Aviso de apoyo visible en el dashboard y en el PDF.
- [ ] No toca carpetas de otra persona sin avisar; no agrega clases globales nuevas.
- [ ] Pasa la CI y anda con el mock y con el lote de ejemplo.
