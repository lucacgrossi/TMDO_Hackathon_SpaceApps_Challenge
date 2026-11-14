# Field Shift · Diseño

Extraído del prototipo `../docs/prototipo/field-shift-prototipo.html` (fuente de verdad visual hasta que haya componentes reales). Reglas de producto: `../docs/mvp-alcance.md`.

## Principios
1. **Técnico y sereno.** Usuario experto: densidad de datos alta, jerarquía clara, cero decoración.
2. **El dato manda.** Todo valor muestra unidad; fuente, años, resolución y confianza a un click o siempre visibles en la tabla.
3. **Comparar, no concluir.** No hay "ganador": ningún badge de "mejor", ningún verde que premie una columna entera. Las diferencias vs. actual se muestran con signo y color semántico (mejora / empeora / igual), no con medallas.
4. **El color nunca es la única señal.** Siempre forma, marca o texto además del color.
5. **Aviso de apoyo siempre visible** (no se puede cerrar).

## Tokens (CSS variables; Tailwind los referencia con `theme.extend.colors`)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--ink` | `#121714` | `#ECF1ED` | Texto principal |
| `--muted` | `#5D6862` | `#9BA8A0` | Texto secundario, etiquetas |
| `--line` | `#E2E6E1` | `#2A332E` | Bordes |
| `--soft` | `#F1F3EF` | `#1C2420` | Fondos de campos y chips |
| `--panel` | `rgba(255,255,255,.96)` | `rgba(18,23,20,.95)` | Paneles sobre el mapa |
| `--accent` / `--accent-ink` | `#1E5A3D` / `#fff` | `#6CC394` / `#0D1A12` | Acción principal, selección |
| `--good` | `#1E7A47` | `#71C994` | Diferencia favorable vs. actual |
| `--bad` | `#B42318` | `#F2897C` | Diferencia desfavorable, conflicto |
| `--warn` | `#9A6312` | `#E3AC4E` | "Sensible al clima", avisos |

**Estrategias** (una identidad por columna, fija): `--s-actual` `#4B5563` / `#A3ADB5` · `--s-a` `#0F8A7A` / `#4CC5B4` · `--s-b` `#B8860B` / `#E2B74A` · `--s-c` `#B5502A` / `#E58A62`.

**Cultivos en el calendario:** `--verano` `#3E8E4B` · `--invierno` `#C9A23A` · `--cobertura` `#3FA597` · `--barbecho` `#DCCDA9` (oscuro: `#4FA45F`, `#D4B04D`, `#4FB7A8`, `#6E6148`).

**Métricas (barras):** agua `--s-a` · suelo `#8a5c33` · erosión `#c0531c` · ingreso `--s-b`.

Modo oscuro por `prefers-color-scheme`, con `[data-theme]` opcional más adelante. El fondo del mapa es `#0d120f`.

## Tipografía
**Inter** (400–900). Base 14 px / 1.45. Números con `font-variant-numeric: tabular-nums` (clase `.num`) en todo valor comparable.

| Uso | Tamaño / peso |
|---|---|
| Título del lote | 28 / 800, tracking −.03em |
| Marca | 20 / 900 |
| Puntaje grande | 40 / 900, tracking −.04em |
| Nombre de estrategia | 14 / 700 |
| Etiquetas de sección | 11 / 700, mayúsculas, +.08em, `--muted` |
| Notas y fuentes | 11–12 / 400–600, `--muted` |

## Espaciado y forma
Escala de 4 px. Radios: paneles 16 · tarjetas 14 · campos y botones 10–12 · chips 999 · celdas del calendario 3. Sombras: `0 10px 40px rgba(0,0,0,.35)` en paneles grandes, `0 6px 24px rgba(0,0,0,.3)` en controles flotantes. Separadores de 1 px `--line`.

## Layout (compu primero)
- **Mapa a pantalla completa** de fondo.
- **Panel izquierdo** fijo, 340 px, margen 16: lote, rotación actual, objetivos, restricciones, datos opcionales (acordeones), botón "Comparar alternativas" abajo con el aviso de apoyo.
- **Barra superior flotante**: selector de capas (Satélite · NDVI · Pendiente · Clima) a la derecha; línea de tiempo (▶ + E…D) a la izquierda cuando la capa es mensual.
- **Leyenda** flotante a la derecha, sube cuando se abre la hoja de resultados.
- **Hoja de resultados** desde abajo (alto `min(56vh, 560px)`, ancho entre el panel y el borde), con desplazamiento de 450 ms. El mapa se reencuadra para que el lote quede visible entre el panel y la hoja.
- **≤ 900 px:** el mapa pasa a 52 vh, el panel y la hoja se apilan debajo, las tarjetas hacen scroll horizontal.

## Componentes
- **Chip** (restricción): borde `--line`; activo = fondo `--ink`. Variante "no sembrar": activo en `--bad`. `aria-pressed`.
- **Slider de objetivo:** etiqueta 72 px · rango 0–5 · valor a la derecha; `accent-color: --accent`.
- **Selector de capa / mes:** segmented control; activo `--ink` (capas) o `--accent` (mes).
- **Tarjeta de estrategia** (columna): badge con letra (Actual = "·", A, B, C) en color de estrategia; nombre + especie; calendario; puntaje de cercanía; 4 barras de métrica con diferencia vs. actual; trío seco / normal / húmedo; etiqueta "Sensible al clima"; al seleccionar, expande **Por qué aparece · Revisar con el agrónomo · Falta**. Seleccionada = borde `--ink` doble. Descartada = rayado diagonal, opacidad .55, motivo visible, no interactiva.
- **Calendario de 12 meses:** 12 celdas de 16 px. Mes actual = contorno `--ink`; helada frecuente = línea blanca inferior; cultivo sensible en mes de helada = anillo `--bad` interior. Tooltip nativo con mes, cultivo y alerta.
- **Barra de métrica:** etiqueta · barra de 6 px · diferencia (`+12 pts` en `--good`, `−8 pts` en `--bad`, `base` en `--muted`).
- **Banner de choque** (objetivos que compiten): fondo `--warn` al 14 %. Texto descriptivo, sin recomendar.
- **Leyenda:** título, rampa de color, extremos, fuente y resolución del dato en una línea.
- **Menú Compartir:** enviar por mail, copiar resumen, guardar PDF. **Toast** de 1,8 s abajo al centro.
- **Pie de la hoja:** "Compara datos: no indica qué hacer…" + origen de los datos (real vs. ilustrativo).

## Estados
- **Cargando:** progreso por fuente ("NASA POWER: 30 años de clima… MODIS… SRTM…").
- **Dato ausente o de baja confianza:** la celda dice "sin dato" o muestra la etiqueta de confianza; nunca un cero ni un valor rellenado. Va a "Información que falta".
- **Fuente caída:** el valor se marca como ilustrativo en la leyenda y en el pie, nunca como real.
- **Punto fuera de zona agrícola:** "Marcá un lote de campo".

## Movimiento y accesibilidad
- Transiciones de 200–450 ms con `cubic-bezier(.22,1,.36,1)`; todo se apaga con `prefers-reduced-motion`.
- Foco visible: contorno de 2 px `--accent`, offset 2.
- Contraste mínimo AA. **Revisar:** texto blanco sobre `--s-b` (`#B8860B`) en el badge de la estrategia B no llega a 4,5:1; usar tinta oscura o un tono más profundo.
- Targets táctiles ≥ 32 px en la línea de tiempo y chips.

## Lenguaje de la interfaz
Español técnico, voseo. Verbos neutros ("Comparar alternativas"), nunca imperativos de decisión. Ejemplos válidos: "5 meses más de cobertura", "balance de agua 60 mm menor en años secos". Inválidos: "te recomendamos", "la mejor opción", "deberías sembrar".

## Decisiones abiertas (resolver con el equipo)
1. **Flujo de 5 pantallas del MVP vs. mapa único del prototipo.** El prototipo junta pantallas 2–4 en el panel izquierdo y 5 en la hoja. Es más rápido de construir y de demostrar; el MVP describe pasos. Propuesta: mantener el prototipo y agregar solo una pantalla de Inicio con el aviso.
2. **Tabla vs. tarjetas.** El MVP pide una tabla con ~14 filas (reglas aplicadas, evidencia, información que falta…). El prototipo muestra tarjetas con menos filas. Propuesta: tarjetas como vista por defecto + vista "Tabla técnica" que muestre todas las filas del MVP, con fuente, años, resolución y confianza.
3. **Datos de confianza por indicador:** el prototipo todavía no los muestra. Falta definir dónde (insignia junto al valor o fila aparte).
4. **PDF:** `window.print()` con hoja de estilos de impresión, o generar en el back.
