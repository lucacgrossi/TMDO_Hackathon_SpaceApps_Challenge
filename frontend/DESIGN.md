# Field Shift · Diseño

Extraído del prototipo final `../docs/prototipo/field-shift-prototipo.html` (alineado al MVP 4.2): es la fuente de verdad visual. Reglas de producto: `../docs/mvp-alcance.md` (v4.3).

**Dónde viven los estilos:** el CSS del prototipo está copiado tal cual en `src/app/globals.css` (tokens y clases `.panel`, `.sheet`, `.card`, `.tl`, `.seg`, `.mets`…). Los componentes reusan esas clases. Lo nuevo que no existe en el prototipo (por ejemplo, la tabla técnica) va en un CSS propio del área, para no editar `globals.css` entre dos personas.

## Principios
1. **Técnico y sereno.** Usuario experto: densidad de datos alta, jerarquía clara, cero decoración.
2. **El dato manda.** Todo valor muestra unidad. Fuente, años, resolución y confianza están siempre visibles en la tabla técnica, o a un toque en las tarjetas.
3. **Comparar, no concluir.** No hay "ganador": ningún sello de "mejor" y ningún color que premie una columna entera. Las diferencias vs. actual se muestran con signo y color semántico (mejora, empeora, igual).
4. **El color nunca es la única señal.** Siempre hay forma, marca o texto además del color.
5. **Aviso de apoyo siempre visible**, y no se puede cerrar.

## Tokens (variables CSS en `:root`; Tailwind las toma con `theme.extend.colors`)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#EEF3F6` | `#0E1417` | Fondo de la app y del paso 1 |
| `--panel` | `rgba(255,255,255,.97)` | `rgba(17,24,29,.96)` | Caja del panel, hoja de resultados, controles flotantes |
| `--ink` | `#132028` | `#EAF1F5` | Texto principal |
| `--muted` | `#5E6B73` | `#97A6AF` | Texto secundario y etiquetas |
| `--line` | `#E3E9ED` | `#24313A` | Bordes |
| `--soft` | `#F2F6F8` | `#1A242B` | Fondos de campos, fichas y tarjeta seleccionada |
| `--accent` / `--accent-ink` | `#1A86B5` / `#fff` | `#5CC2EA` / `#0B1A22` | Acción principal, selección, foco |
| `--accent-soft` | `#E6F4FA` | `rgba(92,194,234,.14)` | Fondos seleccionados (opción, chip, sugerencia) |
| `--shadow` | `0 12px 40px rgba(16,40,56,.16)` | `0 12px 40px rgba(0,0,0,.45)` | Paneles y controles sobre el mapa |
| `--good` | `#1E7A47` | `#71C994` | Diferencia favorable vs. actual |
| `--bad` | `#B42318` | `#F2897C` | Diferencia desfavorable, conflicto, "no sembrar" activo |
| `--warn` | `#9A6312` | `#E3AC4E` | "Sensible al clima", choque de objetivos, pluviómetro que no coincide |

**Estrategias** (una identidad fija por columna): `--s-actual` `#4B5563` / `#A3ADB5` · `--s-a` `#0F8A7A` / `#4CC5B4` · `--s-b` `#B8860B` / `#E2B74A` · `--s-c` `#B5502A` / `#E58A62`.

**Calendario de la rotación:** `--cover` `#3E8E4B` con texto `--cover-ink` `#fff` (con cultivo o cobertura) · `--barbecho` `#CDBA86` / `#6E6148` con texto `--bare-ink` (pelado). Por grupo de cultivo: `--verano` `#3E8E4B` · `--invierno` `#C9A23A` · `--cobertura` `#3FA597`.

**Escala divergente de lluvia** (serie de 30 campañas y tipos de año). Va de seco a húmedo, con gris en el medio: `--dry4` `#8e5216` · `--dry3` `#9e6f45` · `--dry2` `#ad8b6d` · `--dry1` `#bba894` · `--mid` `#C9C5BC` · `--wet1` `#a0aeb9` · `--wet2` `#7896b4` · `--wet3` `#4e7fad` · `--wet4` `#1b66a6`. Alias: `--seco` = `--dry3`, `--normal` = `--mid`, `--humedo` = `--wet3`.

**Escala de NDVI** (mapa y fila "visto por satélite"; la misma en los dos lugares). Seis clases de suelo a vegetación, con cortes en 0 / 0,15 / 0,3 / 0,45 / 0,6 / 0,75: `#E6D8AE #CDBA86 #94AF63 #689C49 #3F8139 #1B5E2E`. La leyenda marca el umbral de 0,3 (pelado) y el valor del lote.

**Métricas (barras de las tarjetas):** agua `--s-a` · suelo `#8a5c33` · erosión `#c0531c` · ingreso `--s-b`.

Modo oscuro por `prefers-color-scheme`, con los valores de la columna "Oscuro".

## Tipografía
**Inter** (400–900). Base de 14 px con interlineado 1.45. Los números comparables usan `font-variant-numeric: tabular-nums` (clase `.num`).

| Uso | Tamaño / peso |
|---|---|
| Título del paso 1 | 44 / 800, tracking −.035em (34 en pantallas medianas, 32 en celular) |
| Título del lote | 28 / 800, tracking −.03em |
| Marca | 20 / 900 |
| Puntaje grande de la tarjeta | 40 / 900, tracking −.04em |
| Título de la hoja | 17 / 800 |
| Nombre de estrategia | 14 / 700 |
| Etiquetas de sección | 11 / 700, mayúsculas, +.08em, `--muted` |
| Meses, leyendas, fuentes | 10–12 / 400–700, `--muted` |

## Espaciado y forma
Escala de 4 px. Radios: caja del paso 1: 28 · panel y hoja: 22 · opción del paso 1: 18 · leyenda y controles: 14–16 · tarjeta: 14 · campos y botones: 12–14 · chips: 999 · segmentos del calendario: 5. Sombra única `--shadow` en todo lo que flota sobre el mapa. Separadores de 1 px `--line`.

## Layout (compu primero)
**Intro (3,5 s, una vez por sesión):** foto de campo con el cielo nublado; las nubes se abren hacia los costados y aparece el sol. Se saltea tocando o con una tecla, y no aparece si la compu pide menos movimiento.

**Paso 1 · Tu caso (sin mapa):** la caja ocupa casi toda la pantalla (hasta 1120 px de ancho) sobre un fondo `--bg` con degradés suaves de acento. Formulario en dos columnas:
```
marca
título del paso + explicación
¿Dónde está tu lote?   (buscador con ícono ⌕ + "◉ Usar mi ubicación", a lo ancho)
─────────── o ───────────
Probar con el lote de ejemplo   (una sola opción grande)
rotación actual   │ objetivos (bloque con fondo --soft)
restricciones     │
datos del lote    │ mediciones propias   (plegados)
```
El buscador acepta localidad, paraje o ruta (Esri), coordenadas o un link de Google Maps; al elegir un lugar aparece "Tu lote está acá: …" y el modo pasa a marcar el lote. Abajo: el botón principal a la derecha ("Ver el lote de ejemplo en el mapa", o "Elegí dónde está tu lote" deshabilitado hasta elegir el lugar, o "Ir al mapa y marcar mi lote") y el aviso de apoyo a la izquierda.

**Paso 2 · Mapa + comparación:** la caja se achica y se va a la derecha (360 px de ancho, a 16 px del borde) en 0,8 s, el contenido se apaga y vuelve, y el mapa vuela al lote.
- **Mapa** a pantalla completa, detrás de todo.
- **Panel a la derecha:** lote (título, coordenadas, selector "Lote de ejemplo / Dibujar mi lote", superficie, pendiente, lluvia), los datos del caso y el botón "Comparar alternativas".
- **Barra superior**, entre el borde izquierdo y el panel: buscador del mapa ("Buscar un lugar o pegar coordenadas", hasta 340 px) a la izquierda; línea de tiempo (▶ + desplegable de meses) cuando la capa es mensual; capas (Vista aérea · Vegetación · Pendiente · Lluvia y heladas) a la derecha.
- **Leyenda** abajo, al lado del panel; sube cuando se abre la hoja.
- **Hoja de resultados** desde abajo, entre el borde izquierdo y el panel, con alto `min(62vh, 620px)`. El mapa se reencuadra para que el lote quede visible arriba de la hoja.

**≤ 900 px:** todo se apila. Mapa a 52 vh, panel y hoja debajo, y las tarjetas hacen scroll horizontal.

## Componentes de resultados (persona 5)
- **Encabezado de la hoja:** título "Rotación actual y 3 alternativas", metadatos (período de clima, pendiente, fecha) y botones Compartir (menú: mail, copiar resumen, PDF) y Cerrar.
- **Choque de objetivos:** banda con fondo `--warn` al 14 %, que solo describe ("Agua y suelo chocan en este lote. En agua queda más cerca A; en suelo, C. Ninguna cumple las dos.").
- **Serie de lluvia de 30 campañas** (RF24): a la izquierda, el texto (título, promedio de las últimas 10 contra las anteriores, cuántas cayeron en el tercio seco, fuente); a la derecha, barras pintadas por tercio con la escala divergente, el grupo de las últimas 10 recuadrado y una escala abajo. Al pasar el mouse por una barra, se muestran su campaña y su valor.
- **Leyenda de las tarjetas:** con cultivo · pelado · mes con helada frecuente · mes del mapa · fila del satélite.
- **Tarjeta de estrategia (una por columna):**
  - Badge con letra (Actual = "·", A, B, C) en el color de la estrategia, más el nombre y la combinación de cultivos.
  - **Línea de la campaña, de julio a junio:** fila de meses (helada frecuente con fondo azul tenue; cultivo sensible en mes de helada en rojo), fila de segmentos con el nombre del cultivo o "Pelado", y en la actual una fila fina con "visto por satélite" (NDVI de cada mes con la escala del mapa). Un cursor marca el mes del mapa.
  - Puntaje de cercanía a los objetivos, en número grande.
  - 4 barras de métricas (agua, suelo, erosión, ingreso) con la diferencia vs. actual (`+12 pts` en `--good`, `−8 pts` en `--bad`, `base` en `--muted`).
  - Trío seco / normal / húmedo, con un punto de color y el tooltip del rango de cada tercio.
  - "Sensible al clima" en `--warn`, si corresponde.
  - **Probabilidad climatológica** (RF25): la primera frase, con un filete de acento a la izquierda.
  - **Al seleccionarla, se despliega el detalle:** Por qué aparece · Revisar con el agrónomo · En las últimas 30 campañas (todas las probabilidades) · Falta.
  - Seleccionada: fondo `--soft`. Descartada: rayado diagonal, opacidad .55, el motivo visible y no se puede tocar.
- **Pie de la hoja:** "Compara datos: no indica qué hacer. Decide el productor con su agrónomo." y el origen de los datos.
- **Toast** de 1,8 s abajo al centro.

## Movimiento
- Paso 1 → paso 2: la caja se mueve en 0,8 s con `cubic-bezier(.65,0,.35,1)`, el mapa pasa de `scale(1.08)` desaturado a normal en 1,4 s y vuela al lote en 1,6 s. **El contorno del lote se oculta durante el vuelo** (el zoom animado engorda el borde) y aparece con un fundido al llegar.
- Al abrir la hoja: sube en 0,45 s, las tarjetas entran en orden (70 ms de diferencia), la fila de la rotación se dibuja de izquierda a derecha, las barras de la serie aparecen una tras otra, y los números y las barras de métricas cuentan desde 0.
- Al mover un objetivo: los números y las barras pasan al valor nuevo en 0,38 s.
- Todo se apaga con `prefers-reduced-motion`.

## Estados
- **Cargando:** "Visto por satélite: cargando…" y la celda en `--soft`. Más adelante, progreso por fuente ("NASA POWER: 30 años de clima… MODIS… SRTM…").
- **Sin dato o confianza baja:** "sin dato", rayado en la celda o la etiqueta de confianza. Nunca un cero ni un valor rellenado. Va a "Información que falta".
- **Fuente caída:** "Clima ilustrativo" en los metadatos y "sin conexión a NASA POWER" en la serie. Nunca se marca como real.
- **Sin conexión al mapa:** aviso centrado "El mapa no puede cargar acá".

## Accesibilidad
- Foco visible: contorno de 2 px `--accent` con offset 2.
- `aria-pressed` en chips, capas y tarjetas; `role="radio"` en las opciones del paso 1 y en el selector del lote.
- Contraste mínimo AA. **Revisar:** texto blanco sobre `--s-b` (`#B8860B`) en el badge de la B no llega a 4,5:1. Usar tinta oscura o un tono más profundo.
- Tooltips nativos (`title`) con el dato completo en cada mes, segmento y barra.

## Lenguaje de la interfaz
Español técnico, con voseo. Verbos neutros ("Comparar alternativas", "Ver mi lote en el mapa"), nunca imperativos de decisión.
- Válidos: "5 meses más de cobertura", "balance de agua 60 mm menor en años secos", "helada en 9 de 30 años".
- Inválidos: "te recomendamos", "la mejor opción", "deberías sembrar".

## Decisiones tomadas
- **Flujo:** intro + 2 pasos (MVP 4.2).
- **Resultado:** tabla técnica de 4 columnas (todas las filas del MVP, no se recorta) y tarjetas como vista resumen. Un interruptor pasa de una a la otra.
- **Tema:** el del prototipo final (acento azul `#1A86B5`, Inter, modo oscuro).

## Para corregir respecto del prototipo
1. **Paso 2 duplica el formulario:** al costado del mapa conviene dejar solo el resumen del caso, el botón "Editar datos" (vuelve al paso 1) y las 4 barras de objetivos (RF13). Lo decide la persona 4, dueña del panel.
2. **El puntaje grande parece un ranking:** bajar su peso visual y darle más lugar a los valores con unidad.
3. **Faltan fuente, años, resolución y confianza por indicador** (RF11): van en la tabla técnica.

Resuelto en el prototipo final: el contorno del lote que se veía grueso durante el vuelo.
