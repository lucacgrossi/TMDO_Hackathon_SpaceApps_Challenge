# AgroPixel · Diseño

**Fuente de verdad visual:** el archivo de Figma [AgroPixel · Rediseño del front](https://www.figma.com/design/uQbWWU8RVCaWDeVma4Padn) (página 01: estilo y componentes; 02: pantallas S1 a S3b) y este documento. Si no coinciden, manda este documento y se avisa para corregir el Figma. Las pantallas del dashboard (S4 Mapa, S5 Clima histórico, S6 Rotaciones y S6b hoja de impresión) no llegaron al Figma por el límite del plan: están como **mockup básico** en `../docs/prototipo/agropixel-dashboard-mockup.html` (estructura y datos reales del lote de ejemplo; el estilo final es el de este documento). Reglas de producto: `../docs/mvp-alcance.md` (v4.5). Qué trae cada campo de la API y cómo dibujarlo: `../docs/api-frontend.md`. Quién hace qué: `./PLAN.md`. El prototipo `../docs/prototipo/field-shift-prototipo.html` queda solo como referencia de comportamiento del mapa (dibujo del lote, encuadre), no de estilo.

## Idea
**Cada píxel es un dato.** El logo es pixel art, y la app dibuja sobre el lote píxeles reales de 30 m (HLS, NASADEM). El estilo une las dos cosas: el pixel art no es decoración retro, es el mismo píxel que medimos.

- **La audacia se gasta en un solo lugar: el mapa del lote.** El raster se ve nítido (`image-rendering: pixelated`) y, al pasar el mouse, el **inspector de píxel** muestra el dato de ese píxel con su fuente. Todo lo demás (panel, tablas, gráficos) es sobrio y técnico.
- **Un único momento animado:** la planta pixel que crece en la pantalla de carga y, al entrar al dashboard, el lote que se "pixela" en el raster de NDVI. No hay más animaciones de entrada.

## Principios
1. **Técnico y sereno.** Usuario experto: densidad de datos alta, jerarquía clara, nada decorativo.
2. **El dato manda.** Todo valor muestra unidad. Fuente, años, resolución y confianza están siempre visibles o a un clic.
3. **Comparar, no concluir.** No hay ganador: ningún sello de "mejor" ni color que premie una columna. Las diferencias contra lo actual van con signo y color semántico.
4. **El color nunca es la única señal.** Siempre hay forma, letra, patrón o texto además del color (terciles con S/N/H, barbecho con puntos, confianza con texto).
5. **Aviso de apoyo siempre visible**, sin botón de cerrar: vive en la barra lateral y en el pie de la hoja de impresión.
6. **Pixel con función.** Acentos pixel solo donde dicen algo (marca, navegación, CTA, carga). Nunca dentro de tablas ni gráficos.

## Tokens
Variables CSS en `:root` de `src/app/globals.css`; Tailwind las toma con `theme.extend.colors`. En Figma son la colección de variables "AgroPixel" con el mismo nombre (la sintaxis web de cada variable dice qué `var()` usar). **Un solo tema, claro**: se retira el modo oscuro.

| Token | Valor | Uso |
|---|---|---|
| `--rastrojo` | `#F2F4EE` | Fondo de la app (gris verdoso, no crema) |
| `--papel` | `#FFFFFF` | Paneles, cards, tabla, controles sobre el mapa |
| `--soft` | `#E8ECE2` | Campos, filas alternas, chips inactivos |
| `--line` | `#DCE2D6` | Bordes y separadores de 1 px |
| `--noche` | `#14202B` | Texto principal, barra lateral (el fondo del logo) |
| `--muted` | `#5A6560` | Texto secundario, fuentes, etiquetas (5,5:1 sobre el fondo) |
| `--hoja` / `--hoja-brillo` / `--hoja-suave` | `#2F7A2E` / `#4CAF50` / `#E3F0DC` | Primario: CTA, selección, valores destacados. `--hoja` es el único apto para texto (5,3:1) |
| `--suelo` / `--suelo-suave` | `#8A5A34` / `#F1E4D6` | Secundario: restricciones, "No sembrar", detalles de marca |
| `--cielo` / `--cielo-brillo` / `--cielo-suave` | `#1C7C93` / `#7FD6E6` / `#DDF3F7` | Foco de teclado y links (`--cielo`, 4,8:1); sección activa del menú y textos sobre `--noche` (`--cielo-brillo`) |
| `--good` / `--bad` / `--warn` | `#2E7D32` / `#B42318` / `#A86A0F` | Diferencia favorable, desfavorable o a revisar; confianza alta, baja, media |

**Estrategias** (una identidad fija por columna, igual en cards, tabla y PDF): `--s-actual` `#4B5563` · `--s-a` `#0F8A7A` · `--s-b` `#B8860B` · `--s-c` `#B5502A`. En el badge de la B, texto `--noche` (blanco no llega a 4,5:1).

**Calendario de la rotación** (orden de campaña, julio a junio): `--verano` `#3E8E4B` · `--invierno` `#C9A23A` · `--cobertura` `#3FA597` · `--barbecho` `#CDBA86` **con patrón de puntos `--suelo`** para que no dependa del color.

**Terciles** (serie de 30 campañas y tipos de año): `--seco` `#C0703A` · `--normal` `#A8A29E` · `--humedo` `#2C7FB8`, siempre con la letra S, N o H al lado.

**Escalas de las capas (NDVI, pendiente, erosión, cultivo): no son tokens del front.** Colores, cortes y etiquetas vienen en `capa.escala` desde el back (`backend/app/satelite/escalas.py`). La leyenda los lee de ahí.

**Sombra pixel:** `3px 3px 0 rgba(20, 32, 43, .15)` (sin desenfoque). Solo en el CTA, la card de estrategia activa, el inspector de píxel y los controles que flotan sobre el mapa.

## Tipografía
Dos familias, por `next/font/google`:
- **Pixelify Sans** (500 y 600): solo títulos. Nunca en números, párrafos ni tablas.
- **IBM Plex Sans** (400, 500 y 600): todo lo demás. Números comparables con `font-variant-numeric: tabular-nums`.

| Estilo (Figma) | Familia | Tamaño / interlineado | Uso |
|---|---|---|---|
| Título/H1 | Pixelify Sans 600 | 32 / 40 | Título de pantalla ("Mapa del lote", "Analizando tu lote") |
| Título/H2 | Pixelify Sans 600 | 24 / 32 | Título de sección, modales |
| Título/H3 | Pixelify Sans 500 | 18 / 24 | Nombre de estrategia, botón principal, marca |
| Texto/Cuerpo | Plex 400 | 14 / 21 | Párrafos, líneas de hasta 80 caracteres |
| Texto/Cuerpo fuerte | Plex 600 | 14 / 21 | Etiquetas de campos y valores en línea |
| Texto/Etiqueta | Plex 600 | 12 / 16 | Etiquetas de datos, **en frase normal (nunca en mayúsculas)** |
| Texto/Pie | Plex 400 | 12 / 16 | Fuentes, notas, meses |
| Texto/Tabla | Plex 400 | 13 / 18 | Celdas de la tabla comparativa |
| Número/Grande y Número/Medio | Plex 600 | 32 / 36 y 20 / 24 | Cercanía, valores de la ficha técnica |

## Forma, espacio y acentos pixel
- Escala de 4 px (`--space-1` 4 · 2: 8 · 3: 12 · 4: 16 · 6: 24 · 8: 32).
- **Radios por jerarquía:** 2 px en datos, inputs y chips de restricción; 6 px en paneles, cards y modales; 0 en los chips de capa (forma de "tecla": borde inferior de 3 px).
- **Esquinas escalonadas:** solo el botón principal y el badge A/B/C (`clip-path` con escalones de 2 px).
- **Íconos pixel 16 × 16** (página 01 del Figma): mapa, clima, rotación, editar, imprimir, capas. Se exportan como SVG con `shape-rendering: crispEdges` y `fill: currentColor`; solo se escalan ×1, ×1,5 o ×2.
- Todo alineado a la izquierda. Solo la pantalla de carga va centrada.

## Flujo y pantallas
El flujo pasa por cuatro etapas (`etapa` en el estado): **marcar → configurar → cargando → dashboard**. Pantallas de escritorio a 1440 × 900.

1. **Marcar lote (S1).** Solo el mapa (Esri) a pantalla completa. Arriba a la izquierda, una caja con la marca, "Marcá tu lote", el buscador (lugar, coordenadas o link de Google Maps) y "Usar mi ubicación". No hay lote de ejemplo: el productor siempre marca el suyo, y el mapa arranca en la región pampeana sin ningún lote. Abajo al centro, la barra de dibujo: ayuda + Deshacer · Cancelar · Listo. Las esquinas marcadas son cuadrados de 10 px (pixel), el tramo hacia el cursor va punteado.
2. **Lote marcado + panel de entradas (S2).** El mapa queda a la izquierda con el lote cerrado ("Lote de 94,9 ha") y "Volver a marcar el lote". Las esquinas del lote se pueden arrastrar para ajustar el borde; al soltar se valida igual que el dibujo y, si no cumple, vuelve atrás con el motivo. A la derecha, un panel de 400 px con scroll y **pie fijo**:
   - Encabezado "Tu lote" con superficie y centro.
   - Secciones plegables, cada una con el resumen de lo cargado cuando está cerrada: Rotación actual · Prioridades (4 sliders 1–5 en bloques) · Restricciones y "No sembrar" · Datos del lote · Mediciones propias.
   - En Mediciones propias: solo la planilla, con la zona para soltar el CSV y "Ver formato del archivo" (abre el modal). No hay carga a mano.
   - Pie fijo: botón principal **"Analizar lote"** y "Consulta NASA POWER, HLS, NASADEM y ESA WorldCover. Suele tardar hasta 30 s."
3. **Modal "Formato de la planilla" (S2b).** Pestañas Diaria / Mensual con una tabla de ejemplo, qué acepta (codificación, separadores, decimales, fechas, encabezado), valores válidos por variable, límites y "Descargar plantilla" (`public/plantillas/mediciones.csv`). El contenido sale de `../docs/plan-planilla-lluvia.md` §2–3.
4. **Carga (S3).** Ver "Pantalla de carga".
5. **Dashboard.** Barra lateral `--noche` de 232 px (logo, Mapa, Clima histórico, Rotaciones, "Editar lote y entradas", aviso de apoyo) + encabezado con el título de la sección y la ficha del lote como pares etiqueta/valor (Superficie, Campaña satelital, Clima, Tus mediciones). Las tres secciones:
   - **Mapa (S4).** El mapa ocupa el centro; a la derecha, la **ficha técnica del lote** (filas, no tarjetas): pendiente general y máxima, cobertura agrícola, meses con NDVI bajo, riesgo de erosión y ET real regional, cada una con valor, confianza, fuente y resolución. Sobre el mapa: selector de capas (Satélite · NDVI · Pendiente · Cultivo · Erosión · Celda NASA POWER), **línea de tiempo** de julio a junio con ▶ y una barrita por mes con el NDVI medio del lote (el mes con MODIS lleva asterisco y nota de confianza baja), leyenda con la escala del back, y el inspector de píxel.
   - **Clima histórico (S5).** Arriba, el **selector de las 30 campañas**: una barra por campaña con su lluvia, pintada por tercil y con su letra. Debajo, el gráfico de la campaña elegida, de julio a junio: lluvia en barras contra la media de 30 años, T mín y T máx en líneas, balance de agua aparte. Al costado, la ficha de la campaña (lluvia, ET0, balance, meses con helada). Abajo, heladas y calor por mes como frecuencia ("26 de 30 años con helada en julio") y el contraste con las mediciones del productor.
   - **Rotaciones (S6).** Banda de choque de objetivos (si `choque.hay`); las 4 prioridades en línea (recalculan la cercanía en el cliente, RF13); las **4 cards** (Actual, A, B, C) y, al bajar, la **tabla comparativa** de 4 columnas con "Exportar PDF" en el encabezado.

**Datos de Clima histórico.** La campaña elegida sale de `serie_anual.campanas[i].mensual` (índice 0 = enero; se dibuja de julio a junio rotando `[6..11, 0..5]`). Sus temperaturas son **extremos del mes** (mínima más baja y máxima más alta): las líneas se rotulan así y se comparan con `clima_mensual.minima_media_c` y `maxima_media_c`, nunca con `t_media_c`. Si `mensual` viene `null`, el gráfico muestra la media de 30 años y el selector queda deshabilitado con el motivo. Detalle en `../docs/api-frontend.md` §4.7.

## Card de estrategia
Una por columna, siempre las 4, en el orden y color de la tabla.
- Badge (Hoy, A, B, C) con esquinas escalonadas, nombre (Título/H3) y especies.
- Calendario de 12 meses, de julio a junio, con las iniciales de los meses y "N meses con el lote pelado".
- Cercanía con tus prioridades en número grande (se recalcula al mover las prioridades).
- Balance de agua de la rotación por tipo de año: S · Seco, N · Normal, H · Húmedo, con su cuadradito de color.
- "Sensible al clima" en `--warn` si corresponde.
- Una probabilidad climatológica con el conteo de años ("3 de 30 años (10 %)").
- **Los 5 puntos plegables:** Por qué · Evidencia · Beneficios · Información que falta · A revisar con el agrónomo.
- **Descartada:** borde y badge en gris, sin datos, con el motivo ("Descartada por tu restricción: no sembrar sorgo. Se muestra para mantener las 4 columnas.").

## Pantalla de carga
- Fondo `--rastrojo`, todo centrado: planta pixel (16 × 16 a ×12), "Analizando tu lote", "Lote de 94,9 ha cerca de Río Cuarto. Suele tardar hasta 30 s; van 12 s." y la lista **"Qué se consulta, en un solo pedido"** (Clima, Vegetación, Relieve, Uso del suelo, Comparación), con la fuente y la resolución de cada una.
- **Sin barra ni porcentaje, y sin tildes de "listo" por fuente:** la API no informa progreso, así que mostrar avance sería inventar. El único indicador es la planta y el tiempo transcurrido.
- **Animación:** 5 fotogramas (semilla → brote → 2 hojas → 4 hojas → con vainas), uno cada 0,3 s (la planta entera en 1,2 s, porque muchas respuestas llegan en 2 o 3 s); el 5 queda fijo hasta la respuesta. Con `prefers-reduced-motion` se muestra solo el 4.
- **Errores (S3b):** card con borde superior `--bad`, la semilla pixel, qué pasó y cómo seguir. 422: "Este polígono no parece un lote agrícola" + Marcar otro lote. 503 o sin conexión: "NASA POWER no responde" / "No se pudo terminar el análisis" + Probar de nuevo.

## Exportar PDF (hoja de impresión)
"Exportar PDF" llama a `window.print()`. Una hoja `@media print` A4 apaisada (`@page { size: A4 landscape; margin: 12mm }`) muestra solo: logo y "Comparación de rotaciones", la ficha del lote (superficie, centro, campaña, período), la tabla comparativa completa, las fuentes con sus años y resoluciones, la fecha de generación y el aviso de apoyo al pie. Se ocultan la barra lateral, el mapa, las cards y los controles. Sin dependencias nuevas.

## Movimiento
- Carga: los fotogramas de la planta. Entrada al dashboard: el contorno del lote se llena con el raster de NDVI en 0,6 s (de a filas, de arriba abajo).
- Respuesta a acciones: mover una prioridad pasa los números al valor nuevo en 0,38 s; cambiar de mes reemplaza la capa con un fundido de 0,2 s; abrir un plegable, 0,2 s.
- No hay entradas con fundido por sección, ni tarjetas que entran en orden, ni contadores que cuentan desde 0.
- Todo se apaga con `prefers-reduced-motion`.

## Estados
- **Sin dato o confianza baja:** "sin dato" o la píldora de confianza. Nunca un cero ni un valor rellenado. Va a "Información que falta".
- **Fuente caída:** si una respuesta llega marcada `es_mock`, el encabezado lo dice. Nunca se marca como real.
- **Capas del mapa:** cada raster se recorta al contorno del lote; fuera del lote no se dibuja ni se lee ningún píxel.
- **Sin conexión al mapa:** aviso centrado "El mapa no puede cargar acá".
- **Entradas cambiadas después de analizar:** banda `--warn` "Cambiaste entradas después del análisis. Analizá de nuevo para actualizar."

## Accesibilidad
- Foco visible: contorno de 2 px `--cielo` con offset 2.
- `aria-pressed` en chips de capa y de restricción; `aria-current="page"` en la sección activa del menú; el modal atrapa el foco y cierra con Esc.
- Contraste AA en todo el texto (los valores de la tabla de tokens ya lo cumplen).
- El inspector de píxel también se abre con el teclado (flechas sobre el mapa con foco).

## Lenguaje de la interfaz
Español técnico, con voseo. Los verbos describen la acción y se repiten en todo el flujo: "Analizar lote" → "Analizando tu lote" → "Análisis listo"; "Exportar PDF" → "PDF listo para guardar".
- Válidos: "5 meses más de cobertura", "balance de agua 60 mm menor en años secos", "helada en 26 de 30 años".
- Inválidos: "te recomendamos", "la mejor opción", "deberías sembrar".
- Errores: qué pasó y cómo seguir, sin disculpas. Vacíos: con la acción para salir ("Hacé clic en el mapa para marcar la primera esquina").
- Sin etiquetas en mayúsculas, sin flechas "→" en botones y sin encadenar datos con puntos medios en la interfaz: se usan pares etiqueta/valor.

## Componentes
Los nombres son los del Figma (página 01); cada uno es un archivo en `src/components/`.

| Figma | Variantes / propiedades | Uso |
|---|---|---|
| Botón | Primario · Secundario · Fantasma; Etiqueta | Primario: una acción principal por pantalla |
| Chip de capa | Activo · Inactivo | Selector de capas, pestañas del modal |
| Chip de restricción | Activo · Inactivo | Restricciones y "No sembrar" |
| Píldora de confianza | Alta · Media · Baja · Sin dato | Junto a cada valor |
| Slider de prioridad | Valor 1–5; Etiqueta | Panel de entradas y Rotaciones (mismo componente, lee `useEntradas`) |
| Campo | Etiqueta, Valor | Selects de rotación y datos del lote |
| Sección plegable | Abierta · Cerrada; Título, Resumen | Bloques del panel |
| Zona de planilla CSV | Vacía · Cargada | Mediciones propias |
| Mes de calendario | Verano · Invierno · Cobertura · Barbecho | Cards y tabla |
| Fila de ficha | Etiqueta, Valor, Fuente | Ficha técnica del lote y de la campaña |
| Leyenda de capa | Título, Fuente | Mapa; colores desde `capa.escala` |
| Inspector de píxel | Valor, Píxel, Fuente | Mapa (RF18) |
| Aviso de apoyo | — | Barra lateral, PDF |
| Card de estrategia | Actual · A · B · C × Disponible · Descartada | Rotaciones |
| Ítem de sidebar | Activo · Inactivo; Etiqueta, Ícono | Navegación |
| Sidebar del dashboard | Mapa · Clima histórico · Rotaciones | Las 3 secciones |
| Encabezado del dashboard | Título; Con acción | Las 3 secciones |

## Decisiones tomadas (2026-11-14)
- **Marca:** AgroPixel. "Field Shift" queda como nombre del desafío de NASA.
- **Flujo:** marcar lote → panel de entradas → carga → dashboard de 3 secciones. Se retiran la intro de nubes y los dos pasos del prototipo.
- **Tema:** claro, paleta "Tierra y hoja", Pixelify Sans + IBM Plex Sans, pixel solo como acento.
- **Mapa:** solo capas del lote (NDVI, pendiente, cultivo, erosión) y la celda de NASA POWER. No hay capas de temperatura ni de humedad del suelo (SMAP está descartado; POWER es de ~50 km).
- **PDF:** hoja de impresión, sin librerías.
