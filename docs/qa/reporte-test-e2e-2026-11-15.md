# Reporte de test E2E · AgroPixel · 2026-11-15

## Resumen
- **Modos probados:** A (mock), B (API real, back local) y C (back apagado). Los tres se pudieron correr.
- **Rama y commit:** `dev`, `49b94c9`.
- **Entorno:** navegador integrado de Claude (Chromium). Tamaños 1440×900, 1280×720 y preset mobile (375×812). Front en `http://localhost:3002`, porque el 3000 estaba ocupado por otro proceso. Back local en `http://localhost:8000`, levantado con `CORS_ORIGINS=http://localhost:3000,http://localhost:3002`. Sin el puerto 3002 en CORS, el modo B no anda.
- **Tiempo de `/analizar` (modo B, back local):** entre 3 y 6 s por pedido, medido en más de 70 pedidos. El doble clic en "Analizar lote" dispara un solo `POST /analizar`.
- **Cómo se probó:** la interfaz, en el navegador. Además, para cubrir las combinaciones (25 verano × invierno, restricciones, mediciones, zonas, límites de superficie y 22 planillas), se llamó a la API directo. Las salidas crudas están en `docs/qa/evidencias/api-*.txt`.

**Totales por severidad:** Alta 5 · Media 11 · Baja 10 · Menor 2 (28 hallazgos).

**Totales por categoría:** Bug 10 · Inconsistencia 5 · Falta 3 · Principio violado 2 · Texto interno visible 1 · Texto/ortografía 3 · Diseño/responsive 1 · Accesibilidad 0 · Rendimiento 0 · Mejora menor 3.

**Los 5 más graves:**
1. **H-001:** con planilla, la mezcla de lluvia no cierra con su propio texto. Si el productor mide menos que NASA, el valor que usan las reglas sube.
2. **H-002:** un polígono en el mar (o con ESA WorldCover caído o sin datos) se analiza completo, en vez de pedir "Marcá un lote de campo".
3. **H-003:** la alternativa B con verano distinto de soja da "Trigo + maíz/girasol/sorgo/maní". El trigo se corta en agosto o septiembre, en vez de "trigo o cebada + soja de 2ª".
4. **H-004:** la app no tiene lote de ejemplo y siempre manda `lote.tipo = "dibujado"`. Por eso el respaldo precalculado de la demo es inalcanzable si NASA POWER cae.
5. **H-005:** el aviso "Herramienta de apoyo…" no aparece en la pantalla de marcar lote ni en la de carga.

## Matriz de cobertura
| Área | Caso | Modo | Resultado |
|---|---|---|---|
| Marcar lote | Lote de ejemplo (botón) | A/B | No existe → H-004 |
| Marcar lote | Buscador: "Río Cuarto", "Pergamino" (mouse y teclado) | A | OK (sugerencias duplicadas con y sin tilde: observación) |
| Marcar lote | Coordenadas `-33.2477, -64.2325`, grados `33°14'52"S 64°13'57"O`, link de Google Maps | A/B | OK |
| Marcar lote | Coordenadas `-33,2477 -64,2325` (coma decimal) | A | H-015 |
| Marcar lote | Texto vacío, Escape cierra sugerencias | A | OK |
| Marcar lote | Texto basura `asdfgh` | A | Esri devuelve "Asdfg, … Resistencia, Chaco" (observación) |
| Marcar lote | Lugar fuera de Argentina ("Ames, Iowa") | A | Solo devuelve resultados argentinos (observación); por coordenadas sí funciona |
| Marcar lote | Usar mi ubicación, permiso denegado | A | OK: "No pude tomar tu ubicación (permiso denegado o sin GPS)…" |
| Marcar lote | Usar mi ubicación, permiso concedido | — | No se pudo probar (el navegador integrado no concede GPS) |
| Dibujo | Cerrar con 1 y 2 esquinas | A | OK: "Listo" deshabilitado y "hacen falta 3 esquinas o más" |
| Dibujo | Triángulo (3), rectángulo (4) | A/B | OK (25 ha y 50,8 ha) |
| Dibujo | Moño (cruces) | A | OK: "Las líneas se cruzan: arrastrá o deshacé una esquina" |
| Dibujo | Deshacer, zoom con rueda durante el dibujo | A | OK. El botón Deshacer cambia de lugar según el estado (observación) |
| Dibujo | 15+ esquinas; < 1 ha y > 20.000 ha dibujados; zoom 5 y 18 | — | No se probó en la interfaz (falta de tiempo). Por API: 0,9 ha y 20.001 ha dan 422 de esquema; 1 ha y 20.000 ha dan OK |
| Lote no agrícola | Centro de Córdoba (interfaz) | B | OK: card 422 clara, entradas conservadas |
| Lote no agrícola | Dique San Roque, Sierras Grandes (API) | B | OK (422 con mensaje para el productor) |
| Lote no agrícola | Mar argentino (API) | B | H-002 |
| Otras zonas | Norte de Buenos Aires, La Pampa (API) | B | OK |
| Otras zonas | Iowa, EE. UU. (API) | B | Responde, pero con calendario del hemisferio sur → H-014 |
| Panel | 25 combinaciones verano × invierno: calendario y `aria-label` | A | Siempre 12 meses y sin pisarse, pero el invierno se recorta en silencio → H-003; Pelado/Barbecho → H-027 |
| Panel | Prioridades 1 y 5 en cada una, valor mostrado = barra | A | OK (`radiogroup` con `aria-label` "Agua: 5 de 5") |
| Panel | Chips de restricción y "No sembrar": `aria-pressed` | A | OK |
| Panel | Datos del lote (encharca × textura) | A/B | Encharca no hace nada → H-010; valores por defecto → H-011 |
| Panel | Mediciones a mano | A/B | No existe en la interfaz → H-009 |
| Panel | Modal "Ver formato del archivo": foco atrapado, Escape, devolución del foco | A | OK |
| Planilla | 22 archivos (ver `api-planillas.txt`) | B | Mayormente OK; H-016, H-022, H-023, H-024 |
| Planilla | Subida desde la interfaz (archivo válido, mes repetido, back caído) | B/C | Vista previa OK; H-009 (texto), H-024 |
| Analizar | Doble clic | B | OK: un solo pedido |
| Carga | Planta pixel, fuentes, sin porcentaje ni jerga | B | OK; falta el aviso de apoyo → H-005 |
| Carga | Error 422 / back caído | B/C | OK (Modo C: "No se pudo terminar el análisis" + "Probar de nuevo", entradas conservadas) |
| Carga | Respaldo precalculado con lote de ejemplo | C | No se puede disparar → H-004 |
| Dashboard | Barra lateral, `aria-current="page"`, encabezado, aviso | A/B | OK; superficie del mock → H-019 |
| Mapa | Capas NDVI, Pendiente, Cultivo, Erosión y Celda POWER | A/B | OK en B; H-012 (texto interno), H-020 (superposición) |
| Mapa | Línea de tiempo, marzo con MODIS de respaldo y asterisco | B | OK |
| Mapa | Inspector de píxel dentro y fuera del lote | A | OK |
| Clima | 30 campañas por tercil con letra (10/10/10), período 1996/97 a 2025/26 | B | OK |
| Clima | Elegir la primera y la última campaña (`aria-pressed`) | B | OK |
| Clima | Heladas y calor "x de 30 años" | B | OK |
| Clima | Contraste con planilla (mismas campañas) | B | OK; consola con claves duplicadas → H-018 |
| Rotaciones | 4 cards, 5 puntos, tipos de año, probabilidades con conteo | A/B | OK; los conteos cierran con el porcentaje |
| Rotaciones | Recálculo de cercanía (12 casos) sin pedidos de red | A/B | OK: la cuenta `Σ p²·v / Σ p²` verificada a mano, vuelve al valor original con 3/3/3/3 y hace 0 pedidos nuevos |
| Rotaciones | Descartadas por "No sembrar" (A, B, C, las tres) | B (API) | OK: siempre 4 columnas, con el motivo |
| Rotaciones | Exportar PDF (contenido de `HojaImpresion`) | A | Contenido OK; H-021. No se abrió el diálogo de impresión |
| Rotaciones | Compartir: texto del mail (sin enviar) | A | OK |
| Editar | Banda "Cambiaste entradas…" aparece y desaparece al volver al valor original | A | OK |
| Mediciones | Pesos 40/50/60/75 % (1, 2, 3, 4, 5, 9, 10 y 25 años) | B (API) | OK con carga a mano; H-006, H-007 |
| Mediciones | Diferencia mayor al 15 % baja la confianza y va a "Revisar" | B (API) | OK |
| Mediciones | Materia orgánica: "dato del productor", sin cambio de puntaje | B (API) | OK (pero inalcanzable desde la interfaz, H-009) |
| Combinaciones dirigidas 1 a 12 | Ver detalle en `api-q2.txt`, `api-q4.txt` y `api-q5.txt` | B (API) | 1: no aplica (H-004) · 2–7: OK salvo H-003/H-008/H-010 · 8: OK (por API) · 9–10: H-001 · 11: OK · 12: OK |
| Responsive | 1280×720 y 1440×900 sin scroll horizontal; celular con barra inferior y tabla de 960 px dentro de un contenedor | A/B | OK; H-020 |
| Navegador | Recargar la página | B | Se pierde todo y vuelve a "Marcá tu lote" (observación) |
| Modo A | 25 combinaciones en el dashboard | A | No aplica: el mock devuelve siempre soja + barbecho (documentado en `src/mocks/analizar.ts`), ver H-019 |

## Hallazgos

### H-001 · Con planilla, la mezcla de lluvia no cierra con su propio texto y sube el agua aunque el productor mida menos
- **Severidad:** Alta
- **Categoría:** Bug
- **Dónde:** back, motor, `backend/app/motor/mezcla.py` (camino de `serie_mensual`). Se ve en Rotaciones > Evidencia y Reglas aplicadas.
- **Modo:** B
- **Cómo reproducirlo:**
  1. Marcar el lote de Río Cuarto, Soja/Barbecho, todo lo demás por defecto.
  2. En Mediciones propias, subir `docs/qa/evidencias/planillas/03-diaria-1anio.csv` (también pasa con `01-…6anios…` y `04-…12anios…`).
  3. Analizar e ir a Rotaciones > Evidencia.
- **Esperado:** NASA (819 mm) corregida por la diferencia del productor y ponderada por su peso (CLAUDE.md, "NASA es la base; el productor pesa más"). El número tiene que salir de la cuenta que muestra el texto (RNF2, trazable). Si el productor mide menos, el valor baja.
- **Obtenido:** el texto no cierra con el número:

  | Planilla | Texto de la evidencia | Esperado | Obtenido |
  |---|---|---|---|
  | 1 año | "−16 % al 40 %" | ≈ 767 mm | "840 mm/año para las reglas" (más que NASA) |
  | 6 años | "−13 % al 60 %" | ≈ 755 mm | "776 mm/año" |
  | 12 años | "−5 % al 75 %" | ≈ 788 mm | "802 mm/año" |
  | 3 años (interfaz) | "−3 % al 50 %" | ≈ 807 mm | "829 mm/año" |

  Con la carga a mano la cuenta sí cierra ("−16 % al 50 %: 752 mm"), así que el problema está en el camino de la planilla.
- **Evidencia:** `docs/qa/evidencias/api-q4.txt`.
- **Posible solución:** revisar en `mezcla.py` qué diferencia se aplica con `serie_mensual` (¿por campaña, por tipo de año, sobre otra base?). Aplicar la misma fórmula del texto o redactar el texto con la cuenta real. Sumar un test: productor −X % → valor de las reglas < NASA.

### H-002 · Un polígono en el mar (o con WorldCover sin datos o caído) se analiza como lote agrícola
- **Severidad:** Alta
- **Categoría:** Bug
- **Dónde:** back, validación del lote con ESA WorldCover (`backend/app/satelite/`, `servicio.py`).
- **Modo:** B
- **Cómo reproducirlo:** `POST /analizar` con un cuadrado de 60 ha centrado en −38,8, −56,5 (mar argentino). Desde la interfaz: dibujar un lote en el mar y analizar.
- **Esperado:** "Punto fuera de zona agrícola → Marcá un lote de campo" (mvp-alcance, CU1).
- **Obtenido:** 200 con las 4 columnas completas (cercanías 54/80/84/67) y solo una nota en "Información que falta": "ESA WorldCover no tiene datos para el lote". Pasa lo mismo cuando Planetary Computer responde 429: el lote de 1 ha se aceptó con "No se pudo consultar ESA WorldCover…". La validación deja pasar el lote cuando falta el dato.
- **Evidencia:** `docs/qa/evidencias/api-q5.txt` ("Mar argentino" y "Río Cuarto 1 ha").
- **Posible solución:** si WorldCover no tiene datos, rechazar con 422 ("No hay datos de uso del suelo para este polígono: marcá un lote de campo"). Si el servicio está caído, seguir pero con un aviso visible en el encabezado, no solo en "Información que falta". También se puede rechazar si el NDVI no tiene ningún mes con dato y la pendiente da 0.

### H-003 · Alternativa B (y el calendario del panel): trigo cortado en agosto o septiembre y "Trigo + maíz" en vez de soja de 2ª
- **Severidad:** Alta
- **Categoría:** Inconsistencia
- **Dónde:** back, reglas de alternativas y calendario (`backend/app/motor/`). Front, `frontend/src/lib/calendario.ts` (`calendario()` solo convierte en "soja 2ª" a la soja).
- **Modo:** A (panel) y B
- **Cómo reproducirlo:** verano Maíz (o Girasol, Sorgo, Maní), invierno Barbecho; Analizar; mirar B en Rotaciones. En el panel, también Maíz/Trigo o Girasol/Trigo.
- **Esperado:** "B · Cultivo de invierno comercial: trigo o cebada + soja de segunda" (CLAUDE.md; mvp-alcance, tabla de las 4 columnas).
- **Obtenido:**
  - B = "Trigo + maíz" con trigo de junio a septiembre y maíz desde octubre. "Trigo + girasol" tiene trigo solo de junio a agosto.
  - En el panel, Girasol/Trigo muestra "Trigo: julio a agosto" y Maíz/Trigo "Trigo: julio a septiembre". El ciclo del trigo queda en 3 o 4 meses, sin aviso: el verano pisa al invierno en silencio.
  - Relacionado: en Girasol + vicia la vicia termina en agosto y el girasol empieza en septiembre, pero el mismo resultado dice "Secado de la cobertura ~30 días antes de la siembra".
- **Evidencia:** `docs/qa/evidencias/api-combos.txt` (calendarios de las 25 combinaciones) y `api-q2.txt` (C5).
- **Posible solución:** que B use siempre trigo o cebada + soja 2ª, como dice la documentación, o definir con la persona 3 "maíz de 2ª" o "girasol de 2ª" con su ventana (diciembre). En `calendario()`, cuando el verano pisa al invierno, pasar el verano a "de 2ª" o avisar del solapamiento en el panel.

### H-004 · No hay lote de ejemplo: el respaldo precalculado de la demo no se puede usar
- **Severidad:** Alta
- **Categoría:** Falta
- **Dónde:** `frontend/src/lib/aEntrada.ts:47` (siempre `tipo: "dibujado"`) y `PantallaMarcar`.
- **Modo:** C
- **Cómo reproducirlo:** abrir la app; no hay botón "Probar con el lote de ejemplo". Con el back caído o NASA POWER sin responder, cualquier lote da error.
- **Esperado:** CLAUDE.md: "la API la devuelve si NASA POWER no responde y el lote es el de ejemplo". mvp-alcance RNF8: "Demo a prueba de WiFi". `docs/prompt-test-e2e.md` §3.1.1.
- **Obtenido:** `frontend/CLAUDE.md` y `DESIGN.md` dicen "No hay lote de ejemplo". La rama del back que devuelve `rio_cuarto.json` nunca se activa desde la app. El riesgo para la demo de hoy a las 18:00 es concreto: si NASA POWER cae, no hay plan B en la interfaz.
- **Evidencia:** `docs/qa/evidencias/OK-modo-c-back-caido.jpg` y el código citado.
- **Posible solución:** un botón "Probar con el lote de ejemplo (Río Cuarto)" que cargue `LOTE_DEMO` y mande `tipo: "ejemplo"`. Otra opción: que el front mande `"ejemplo"` cuando el polígono coincide con `LOTE_DEMO`. Las dos son decisión de producto (los docs se contradicen).

### H-005 · El aviso de apoyo no está en "Marcá tu lote" ni en la pantalla de carga
- **Severidad:** Alta (principio no negociable)
- **Categoría:** Principio violado
- **Dónde:** `frontend/src/components/marcar/PantallaMarcar.tsx` y `frontend/src/components/carga/PantallaCarga.tsx`.
- **Modo:** A/B
- **Cómo reproducirlo:** abrir la app (etapa marcar) y después analizar (etapa carga).
- **Esperado:** CLAUDE.md: "está siempre visible". RF22: "visible en inicio y resultados".
- **Obtenido:** visible en el panel de entradas, en la barra lateral del dashboard y en la hoja de impresión. No aparece en la pantalla de inicio ni en la de carga. DESIGN.md solo lo pide en la barra lateral y en el PDF: los docs no coinciden.
- **Evidencia:** `docs/qa/evidencias/H-005-marcar-sin-aviso.jpg` y `H-005-panel-con-aviso.jpg`.
- **Posible solución:** reusar `AvisoApoyo` en la caja de `PantallaMarcar` y al pie de `PantallaCarga`, y alinear DESIGN.md.

### H-006 · Con carga a mano, el contraste y la mezcla muestran diferencias contradictorias
- **Severidad:** Media
- **Categoría:** Inconsistencia
- **Dónde:** back, `clima/correccion.py` (contraste) y `motor/mezcla.py` (mezcla).
- **Modo:** B (API; la interfaz no tiene carga a mano, ver H-009)
- **Cómo reproducirlo:** `mediciones_propias = {lluvia_anual_mm: 790, anios_registro: 1}`.
- **Esperado:** una misma comparación productor-NASA, o dos comparaciones con el motivo de la diferencia explicado.
- **Obtenido:**
  - El contraste dice "Tu pluviómetro: 790 mm/año · NASA: 819 mm (−4 %) · coinciden".
  - La evidencia de la misma salida dice "contra NASA POWER en las últimas 1 campaña (2025/26) 601 mm (+31 %) → … 922 mm/año para las reglas".
  - El productor mide menos que la media y las reglas usan 922 mm, más que las dos fuentes.
  - Con 700 mm sin años: "−15 % · coinciden" y 873 mm para las reglas.
  - Con 99.999 mm el resultado queda en 1024 mm sin decir que se limitó.
- **Evidencia:** `docs/qa/evidencias/api-q3.txt`.
- **Posible solución:** que el contraste a mano compare contra las mismas N campañas que usa la mezcla (como hace la planilla). Si no, explicar en el texto por qué son distintas. Decir en la evidencia cuando un valor se limita.

### H-007 · Los años de registro de la planilla se cuentan por años calendario, no por campañas
- **Severidad:** Media
- **Categoría:** Bug
- **Dónde:** back, `motor/mezcla.py` (o `mediciones/planilla.py`).
- **Modo:** B
- **Cómo reproducirlo:** subir `05-mensual-3anios.csv` (enero de 2022 a diciembre de 2024) y analizar.
- **Esperado:** el peso depende de los años de registro. Si se comparan 2 campañas completas, corresponde 40 % (1–2 años).
- **Obtenido:** el contraste dice "(2022/23 a 2023/24, 2 campañas)", pero la evidencia dice "tu registro 775 mm/año (50 %, 3 años)".
- **Evidencia:** `docs/qa/evidencias/api-q4.txt`, primer caso.
- **Posible solución:** usar la cantidad de campañas completas de lluvia (`campanas_completas.lluvia_mm`) como años de registro.

### H-008 · Si la rotación actual ya es trigo + soja de 2ª, la alternativa B es idéntica a la actual
- **Severidad:** Media
- **Categoría:** Inconsistencia
- **Dónde:** back, reglas de alternativas.
- **Modo:** B
- **Cómo reproducirlo:** Soja/Trigo (también Maíz/Trigo, Sorgo/Trigo, Maní/Trigo, Girasol/Trigo); Analizar.
- **Esperado:** las alternativas comparan contra algo distinto de lo actual. A y C ya lo hacen: con vicia, A pasa a centeno; con sorgo, C pasa a girasol.
- **Obtenido:** "Hoy: Soja + trigo" y "B: Trigo + soja de 2ª", con el mismo calendario y la misma cercanía (72/72). Una de las 4 columnas no aporta nada.
- **Evidencia:** `docs/qa/evidencias/api-combos.txt` (soja/trigo, maiz/trigo…).
- **Posible solución:** si la actual tiene trigo, B usa cebada (y al revés), como se hace con A y C.

### H-009 · No existe la carga a mano de mediciones; la materia orgánica es inalcanzable y un texto remite a esa carga
- **Severidad:** Media
- **Categoría:** Falta
- **Dónde:** `frontend/src/components/entradas/SeccionMediciones.tsx` y `SubirPlanilla.tsx`.
- **Modo:** A/B/C
- **Cómo reproducirlo:**
  1. Abrir Mediciones propias: solo está la planilla.
  2. Subir `13-mensual-mes-repetido.csv`.
- **Esperado:** CLAUDE.md: "Se cargan a mano (lluvia anual del pluviómetro y años de registro, materia orgánica) o subiendo una planilla". `frontend/CLAUDE.md` dice "solo por planilla": los docs se contradicen.
- **Obtenido:**
  - No hay campos de lluvia anual, años ni materia orgánica. La materia orgánica (que el back acepta y muestra como "dato del productor") no se puede cargar.
  - Al fallar una planilla, la app dice "Podés corregirla o seguir con la carga a mano.", pero esa carga no existe.
- **Evidencia:** texto del panel (sesión de prueba).
- **Posible solución:** sumar un campo de materia orgánica (y, si se decide, lluvia y años) o sacar "o seguir con la carga a mano" del mensaje y alinear `CLAUDE.md`.

### H-010 · "¿Se encharca?" no tiene ningún efecto ni aparece en el resultado
- **Severidad:** Media
- **Categoría:** Bug
- **Dónde:** back, motor; front, `SeccionDatosLote.tsx`.
- **Modo:** B
- **Cómo reproducirlo:** analizar con encharca = Sí, A veces y No sé (mismo lote y rotación).
- **Esperado:** RF6. El dato se usa o, si es "No sé", va a "Información que falta". `docs/prompt-test-e2e.md` §3.2.
- **Obtenido:** cercanías iguales y ningún texto de la salida menciona encharcamiento o anegamiento. "No sé" tampoco va a Información que falta. La textura sí se usa ("× 0,80 (suelo arcilloso)") y "No sé" en textura sí va a vacíos ("Textura del suelo: se usó franco…").
- **Evidencia:** salida del script de la sesión (casos `si/arcilloso`, `no_se/no_se`, `a_veces/arenoso`).
- **Posible solución:** una regla que use `anegable` (por ejemplo, riesgo para cultivos sensibles al anegamiento en "A revisar con el agrónomo") o, como mínimo, mostrarlo y mandar "No sé" a vacíos, igual que la textura.

### H-011 · El panel trae "No" y "Franco" precargados: el motor los usa como si el productor los hubiera dicho
- **Severidad:** Media
- **Categoría:** Principio violado (Nada inventado)
- **Dónde:** `frontend/src/lib/entradas.ts` (`ENTRADAS_INICIALES`: `anegable: "no"`, `textura: "franco"`).
- **Modo:** A/B
- **Cómo reproducirlo:** marcar un lote y analizar sin abrir "Datos del lote".
- **Esperado:** CLAUDE.md: "Lo que falta o tiene baja confianza va a Información que falta". El default de la API es `no_se`.
- **Obtenido:** la evidencia dice "lluvia 814 mm × 0,75 (suelo franco)" como dato del lote, aunque el usuario nunca lo eligió, y no aparece en Información que falta.
- **Posible solución:** valores iniciales `no_se` en los dos campos, para que el back los marque como faltantes.

### H-012 · Texto interno visible: "a validar por la persona 3"
- **Severidad:** Media
- **Categoría:** Texto interno visible
- **Dónde:** Dashboard > Mapa > Ficha técnica > Riesgo de erosión, y la nota de la capa Erosión. El texto viene del back (`backend/app/satelite/`, nota de `riesgo_erosion`).
- **Modo:** B
- **Cómo reproducirlo:** analizar cualquier lote agrícola e ir a Mapa > ficha "Riesgo de erosión".
- **Esperado:** sin referencias internas (`docs/prompt-test-e2e.md` §2).
- **Obtenido:** "… Escala de clases propuesta, a validar por la persona 3".
- **Posible solución:** sacar la frase de la nota en el back o reemplazarla por "escala de clases provisoria".

### H-013 · Los errores 429 de Planetary Computer se muestran crudos y cambian los resultados del mismo lote
- **Severidad:** Media
- **Categoría:** Bug (intermitente)
- **Dónde:** back, `satelite/` (HLS, MODIS, WorldCover, MODIS ET).
- **Modo:** B
- **Cómo reproducirlo:** hacer varios análisis seguidos del mismo lote.
- **Esperado:** mensajes en lenguaje del productor y el mismo resultado para la misma entrada.
- **Obtenido:**
  - En Información que falta aparece: "MODIS de respaldo: no se pudo buscar en MODIS: Planetary Computer respondió con error HTTP 429" (también en WorldCover y ET).
  - El mismo lote dio 4 y después 3 meses pelados vistos por satélite, con distinto texto en "A revisar".
  - Hay dos causas para el error: la intermitencia y el H-002, porque con 429 en WorldCover no se valida el lote.
- **Evidencia:** `docs/qa/evidencias/api-q2.txt` ("sin restricciones"), `api-q3.txt`, `api-q5.txt`.
- **Posible solución:** traducir el 429 a "El servicio de imágenes satelitales está saturado; probá de nuevo en un minuto". Cachear por polígono las respuestas de Planetary Computer y reintentar con espera.

### H-014 · En el hemisferio norte (Iowa) se aplica el calendario y la campaña del hemisferio sur
- **Severidad:** Media
- **Categoría:** Inconsistencia
- **Dónde:** back (calendario, campaña julio–junio, terciles) y `calendario.ts`.
- **Modo:** B
- **Cómo reproducirlo:** lote de 60 ha en 42,03, −93,75; Soja/Barbecho.
- **Esperado:** CLAUDE.md: "La app tiene que funcionar en cualquier punto".
- **Obtenido:** responde 200 con soja de noviembre a abril, en pleno invierno de Iowa. Las heladas, el calor y el agua resultan agronómicamente inválidos y no hay ningún aviso.
- **Evidencia:** `docs/qa/evidencias/api-q5.txt`.
- **Posible solución:** limitar el alcance al hemisferio sur con un mensaje ("Por ahora la app usa calendarios del hemisferio sur") o desplazar 6 meses el calendario y la campaña cuando la latitud es positiva.

### H-015 · Las coordenadas con coma decimal no se reconocen y queda visible el lugar anterior
- **Severidad:** Media
- **Categoría:** Bug
- **Dónde:** `frontend/src/lib/buscador.ts:101` (`RE_SUELTO` solo acepta punto) y `BuscadorLote.tsx`.
- **Modo:** A
- **Cómo reproducirlo:**
  1. Buscar `-33.2477, -64.2325` y pulsar Enter (funciona).
  2. Buscar `-33,2477 -64,2325` y pulsar Enter.
- **Esperado:** la app es en español con coma decimal (`docs/prompt-test-e2e.md` §3.1.2).
- **Obtenido:** "No encontré ese lugar. Probá con la localidad más cercana o pegá las coordenadas." y, debajo, el lugar anterior en verde "Tu lote está acá: 33,2477° S · 64,2325° O". Se reprodujo 2 veces. Lo mismo pasa con el GPS denegado.
- **Evidencia:** `docs/qa/evidencias/H-015-coordenadas-coma.png`.
- **Posible solución:** aceptar `-?\d{1,2},\d+\s+-?\d{1,3},\d+` (coma decimal separada por espacio o punto y coma) y limpiar el "Tu lote está acá" al mostrar un error.

### H-016 · Una planilla con fechas en formato de EE. UU. se acepta como válida
- **Severidad:** Media
- **Categoría:** Bug
- **Dónde:** back, `backend/app/mediciones/planilla.py`.
- **Modo:** B
- **Cómo reproducirlo:** subir `08-fechas-eeuu.csv` (`MM/DD/AAAA`).
- **Esperado:** "siempre día/mes" (`plan-planilla-lluvia.md` §2). Ante un archivo claramente en otro orden, un error claro.
- **Obtenido:**
  - `ok: true` con "288 / 732 filas" y "media 205,4 mm/campaña".
  - Las fechas ambiguas (01/02) se leen como 1 de febrero y el resto se descarta fila por fila ("la fecha `07/13/2023` no existe").
  - El productor puede seguir y mezclar datos corruptos con NASA.
- **Evidencia:** `docs/qa/evidencias/api-planillas.txt`.
- **Posible solución:** si alguna fecha tiene "mes" mayor que 12, o se descarta más del 20 % de las filas por fecha, rechazar con "Las fechas parecen estar en formato mes/día; usá día/mes".

### H-017 · "1 meses pelados" / "1 meses con cobertura baja"
- **Severidad:** Baja
- **Categoría:** Texto/ortografía
- **Dónde:** `backend/app/motor/reglas.py:142`, `frontend/src/components/resultados/TablaTecnica.tsx:190` y `backend/app/satelite/ndvi.py:403` ("faltan 1 meses").
- **Modo:** A/B
- **Cómo reproducirlo:** Rotaciones > Reglas aplicadas o tabla > Erosión de A o B.
- **Obtenido:** "1 meses pelados (octubre)…", "1 meses con cobertura baja × pendiente 0,7 %". También en `backend/app/demo/rio_cuarto.json`.
- **Posible solución:** singular cuando el valor es 1, y regenerar la demo.

### H-018 · Claves duplicadas en el contraste de mediciones (errores en consola)
- **Severidad:** Baja
- **Categoría:** Bug
- **Dónde:** `frontend/src/components/resultados/ContrasteMediciones.tsx:103` (`key={c.indicador}`).
- **Modo:** B
- **Cómo reproducirlo:** subir una planilla con temperaturas y abrir Clima histórico.
- **Obtenido:** 44 errores "Encountered two children with the same key … helada / calor". Hay varias filas de helada y calor, una por mes.
- **Posible solución:** `key={`${c.indicador}-${c.mes ?? i}`}`.

### H-019 · El mock está desactualizado y no coincide con el lote dibujado
- **Severidad:** Baja (solo modo A)
- **Categoría:** Inconsistencia
- **Dónde:** `frontend/src/mocks/rio-cuarto.ts` y `analizar.ts`.
- **Modo:** A
- **Cómo reproducirlo:** sin `.env.local`, dibujar un lote de 50,8 ha con Maíz/Trigo y analizar.
- **Esperado:** el contrato vigente (período 1996/97 a 2025/26).
- **Obtenido:**
  - "Superficie 95,0 ha" (el lote dibujado era de 50,8 ha), pero la hoja de impresión tiene el centro del lote dibujado.
  - "1995/96–2024/25" y "Campaña satelital 2024/25".
  - Siempre "Soja + barbecho", aunque se cargó Maíz/Trigo.
  - "Información que falta: Respuesta de prueba (mock)…" y "Serie por campaña", que sí se muestra.
  - Leyenda de Cultivo "Valor del lote: 95,1 clase", mientras la ficha dice 98 %.
- **Evidencia:** `docs/qa/evidencias/H-019-mock-95ha-periodo-viejo.jpg` y `H-019-mock-leyenda-cultivo-clase.jpg`.
- **Posible solución:** regenerar el mock desde `backend/app/demo/rio_cuarto.json` y que el mock copie el área y el centro del lote dibujado.

### H-020 · La línea de tiempo y la leyenda tapan la mitad inferior del lote; en celular se cortan
- **Severidad:** Baja
- **Categoría:** Diseño/responsive
- **Dónde:** `frontend/src/components/mapa/SeccionMapa.module.css`, `LineaTiempoLote.module.css` y el encuadre del mapa (`EncuadreCapa.tsx`).
- **Modo:** B (1440×900) y A (375×812)
- **Cómo reproducirlo:** Mapa > capa Erosión o Pendiente.
- **Obtenido:**
  - A 1440×900, la mitad de abajo del lote queda detrás de la línea de tiempo y la leyenda.
  - En celular, la línea de tiempo se sale por la derecha (se ve hasta "feb").
  - El texto "Pasá el mouse sobre el lote…" aparece también en táctil.
- **Evidencia:** `docs/qa/evidencias/H-020-overlays-tapan-lote.jpg` y `H-020-celular-linea-tiempo-cortada.jpg`.
- **Posible solución:** `fitBounds` con `paddingBottomRight` del alto de la línea de tiempo y el ancho de la leyenda; en celular, la línea de tiempo con scroll horizontal o debajo del mapa; y otro texto en táctil ("Tocá el lote…").

### H-021 · Hoja de impresión: faltan NASADEM y ESA WorldCover en Fuentes, y las restricciones
- **Severidad:** Baja
- **Categoría:** Falta
- **Dónde:** `frontend/src/components/resultados/HojaImpresion.tsx` y `frontend/src/lib/hojaImpresion.ts`.
- **Modo:** A (contenido de la hoja leído del DOM)
- **Esperado:** RF20 ("con logo, lote, fuentes y aviso") y mvp-alcance, encabezado de la tabla ("objetivos · restricciones · mediciones propias").
- **Obtenido:** Fuentes lista POWER, HLS/MODIS, Hargreaves, el balance y MODIS ET, pero no NASADEM (que la fila Erosión cita) ni ESA WorldCover. La ficha muestra las prioridades pero no las restricciones ni "No sembrar".
- **Posible solución:** armar Fuentes con todas las `fuente` distintas de `indicadores` y `lote`, y sumar "Restricciones" a la ficha de la hoja.

### H-022 · La plantilla descargable se rechaza si se sube tal cual
- **Severidad:** Baja
- **Categoría:** Mejora menor
- **Dónde:** `frontend/public/plantillas/mediciones.csv` y el mensaje de `planilla.py`.
- **Modo:** B
- **Cómo reproducirlo:** "Descargar plantilla" → subirla.
- **Obtenido:** "Ninguna variable llega a 12 meses con dato (lluvia: 1): hacen falta al menos 12". "(lluvia: 1)" no se entiende.
- **Posible solución:** que la plantilla traiga 12 meses de ejemplo (o un comentario de que hay que reemplazar los datos) y redactar "Tu planilla tiene lluvia en 1 mes: hacen falta al menos 12 meses".

### H-023 · La vista previa cuenta el encabezado como "1 fila descartada"
- **Severidad:** Baja
- **Categoría:** Bug
- **Dónde:** `frontend/src/components/entradas/SubirPlanilla.tsx` (usa `filas_leidas − filas_usadas`).
- **Modo:** B
- **Cómo reproducirlo:** subir `05-mensual-3anios.csv` (sin filas malas).
- **Obtenido:** "36 registros mensuales · 1 fila descartada". Es el encabezado; los avisos no muestran ninguna fila descartada.
- **Posible solución:** restar el encabezado o que el back no lo cuente en `filas_leidas`.

### H-024 · Subir un archivo que falla borra la planilla válida anterior
- **Severidad:** Baja
- **Categoría:** Bug
- **Dónde:** `SubirPlanilla.tsx` y `store.ts`.
- **Modo:** B/C
- **Cómo reproducirlo:** subir `05-mensual-3anios.csv` (OK); apagar el back o subir `13-mensual-mes-repetido.csv`.
- **Obtenido:** la planilla válida se pierde y queda "No se pudo usar la planilla. Podés corregirla…". Con el back caído, el problema no es el archivo, así que "corregirla" confunde.
- **Posible solución:** mantener la planilla anterior hasta que la nueva sea válida, y otro texto cuando el error es de conexión.

### H-025 · Restricciones sin efecto visible y "No sembrar" del cultivo actual sin aviso
- **Severidad:** Baja
- **Categoría:** Mejora menor
- **Dónde:** back, motor; front, `SeccionRestricciones.tsx`.
- **Modo:** B
- **Cómo reproducirlo:** comparar el resultado con "Sin riego", "Sin hacienda" o ninguna restricción; y probar Invierno = Trigo + No sembrar Trigo.
- **Obtenido:**
  - Las cercanías son iguales y "Sin riego" y "Sin hacienda" no aparecen en ningún texto.
  - "Maquinaria limitada" sí suma "Requiere maquinaria para un cultivo nuevo".
  - Con trigo actual y "No sembrar trigo" no hay ningún aviso de la contradicción (B pasa a cebada).
- **Posible solución:** mencionar en "Por qué aparece" qué restricciones se aplicaron y avisar en el panel cuando "No sembrar" incluye el cultivo actual.

### H-026 · B con cebada dice "efecto secante del trigo antecesor"
- **Severidad:** Baja
- **Categoría:** Texto/ortografía
- **Dónde:** back, plantilla de riesgos de soja de 2ª.
- **Modo:** B
- **Cómo reproducirlo:** No sembrar Trigo → B = "Cebada + soja de 2ª".
- **Obtenido:** "Soja de 2ª: efecto secante del trigo antecesor…".
- **Posible solución:** usar el nombre del cultivo de invierno de la alternativa.

### H-027 · El panel dice "Pelado" donde el `aria-label` dice "Barbecho", y la superficie se redondea distinto
- **Severidad:** Menor
- **Categoría:** Texto/ortografía
- **Dónde:** `SeccionRotacion.tsx` y `BarraDibujo.tsx`.
- **Modo:** A
- **Obtenido:**
  - El tramo se ve como "Pelado" mientras el selector y el `aria-label` dicen "Barbecho: julio a octubre".
  - La barra de dibujo dice "Lote de 51 ha" (y "46 ha") y el panel "50,8 ha" (y "45,5 ha").
- **Posible solución:** el mismo término en los dos lados ("Barbecho (pelado)", como en la tabla) y un decimal en la barra.

### H-028 · Detalles de formato
- **Severidad:** Menor
- **Categoría:** Mejora menor
- **Modo:** A/B
- **Obtenido:**
  - Ejes de Clima histórico con guion "-15 °C" y "-180 mm", mientras el resto usa "−".
  - Leyenda NDVI: "30 m, 19/07/2025, 30 m (grilla 1″ (~30 m))", con la resolución repetida y paréntesis anidados.
  - "Valor del lote: NDVI 0,2", mientras la línea de tiempo muestra "0,20".
  - Descartadas: "Descartada: No sembrar vicia ni centeno." (mayúscula a mitad de frase).
  - Card de error: "Respuesta del servidor: 422" (código HTTP visible).
  - Encabezado de B: "Cultivo de invierno", mientras CLAUDE.md dice "Cultivo de invierno comercial".
- **Posible solución:** unificar en `lib/formato.ts` y en las plantillas del back.

## Observaciones menores y preguntas para el equipo
- **Docs que se contradicen** (decidir cuál manda):
  - El lote de ejemplo y la carga a mano existen según CLAUDE.md y mvp-alcance, y no existen según `frontend/CLAUDE.md` y `DESIGN.md` (H-004, H-009).
  - DESIGN.md pide el aviso de apoyo solo en la barra lateral y el PDF (H-005).
  - `docs/prompt-test-e2e.md` también da por existentes el lote de ejemplo y la carga a mano.
- **Choque de objetivos:** lo calcula el back con las prioridades del análisis. Al mover las barras en Rotaciones, la banda de choque no se recalcula. No se vio la banda en ningún caso probado, así que no se pudo confirmar si queda desactualizada.
- **Buscador:** filtra solo Argentina (`countryCode=ARG`). Sugerencias duplicadas con y sin tilde ("Río Cuarto, Córdoba" / "Río Cuarto, Cordoba"). "asdfgh" devuelve un comercio de Resistencia. "Tu lote está acá: Río Cuarto, Córdoba" suena raro cuando el lugar es una ciudad.
- **Validación de la API sin tope superior:** `anios_registro: 150` y `lluvia_anual_mm: 99999` se aceptan (+12110 %). No es alcanzable desde la interfaz hoy.
- **Mensaje sin conexión:** con el back caído dice "Revisá la conexión a internet", pero internet anda y el que no responde es el servidor.
- **Recargar la página** pierde el lote, las entradas y el análisis (RNF6, coherente con "no se guarda nada", pero conviene un aviso `beforeunload` en el dashboard).
- **"Volver al análisis anterior"** vuelve siempre a la sección Mapa, no a la que estaba abierta.
- **"Erosión: 2,8 % × meses"** es una unidad poco intuitiva para el productor. ¿Va con la escala de clases que tiene que definir la persona 3?
- **Botones de la barra de dibujo:** "Deshacer" cambia de posición entre estados (la barra cambia de ancho), así que es fácil errar el clic.
- **Mensajes del parser con comillas invertidas** (`` `mucho` ``, `` `humedad_suelo` ``): en la interfaz se ven las comillas invertidas literales.
- **El overlay de desarrollo de Next ("N" e "8 Issues")** tapa el aviso de apoyo en la barra lateral, abajo a la izquierda. Solo pasa en `npm run dev`.

## Lo que no se pudo probar
- **"Usar mi ubicación" con permiso concedido:** el navegador integrado no concede geolocalización.
- **Diálogo real de impresión y PDF generado:** se revisó el contenido de `HojaImpresion` en el DOM, pero no la paginación ni los cortes en A4 apaisada.
- **En la interfaz:** dibujo con más de 15 esquinas, lotes de 1 ha y de 20.000 ha dibujados a mano, zoom 5 y 18, y arrastre de esquinas en "configurar". Los límites de 1 y 20.000 ha se verificaron por API.
- **Respaldo precalculado con lote de ejemplo (Modo C):** no se puede disparar desde la app (H-004). El JSON `rio_cuarto.json` está al día (1996/97 a 2025/26, 94,86 ha).
- **Modo A con las 25 combinaciones en el dashboard:** el mock devuelve siempre soja + barbecho, así que no aporta. En el modo B las 25 se corrieron por API.
- **Planilla de 10 MB / 50.000 filas en la interfaz:** por API da 413 "La planilla supera 1 MB". Las demás planillas se probaron por API y tres de ellas desde la interfaz (válida, mes repetido y con el back caído).
- **Combinaciones dirigidas en la interfaz:** solo se recorrieron completas la 1 (lote de Río Cuarto dibujado, todo por defecto) y una con planilla. Las 2 a 12 se verificaron por API.
- **Combinación 8 (mediciones a mano −20 %, 3 años, MO 2,5 %):** la interfaz no tiene carga a mano; se probó por API (OK: confianza baja, "Revisar", MO como dato del productor y sin cambio de puntaje).
