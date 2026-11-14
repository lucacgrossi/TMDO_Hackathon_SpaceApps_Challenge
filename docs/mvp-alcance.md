# Field Shift · MVP (versión 4.2, 2026-11-14)

**Cambios de la 4.2 (sábado 14):**
- **Dos decisiones de producto** (de las 4 opciones estadísticas que trajo el back, validadas con el guía): **probabilidad climatológica** (RF25) y **mediciones del productor como contraste al lado de NASA** (RF15). Descartadas: tendencia por pendiente y años análogos. Sin modelo de predicción propio (va a "próximos pasos").
- **Ubicar el lote** (RF1): buscador de lugares, coordenadas o link de Google Maps, GPS del celu, o lote de ejemplo. El lote es un polígono dibujado por puntos.
- **Flujo en 2 pasos** con intro, en lugar de 5 pantallas (ver "Flujo").
- **Un solo período de clima** para todo: POWER mensual, últimas 30 campañas.
- **NDVI a 30 m** con NASA HLS (Planetary Computer); MODIS de respaldo.
- **Alineado con `backend/PLAN.md`:** las dos decisiones coinciden con `clima/probabilidad.py` y `clima/correccion.py`. Esta versión cierra lo que el plan dejaba abierto: **la corrección con el pluviómetro se muestra al lado y no cambia ningún puntaje**. *Actualizado 2026-11-14 (a confirmar por la persona 3): las mediciones del productor sí entran en los puntajes del motor; ver RF15.*


**Último ajuste (4.1):**
- Lote de la demo ubicado sobre un campo real.
- Mapa base satelital real.
- Fuentes probadas en el prototipo (`docs/`) (ver "Lote de la demo" y "Mapa interactivo").

**Cambios respecto de la v3** (decididos por el equipo):
- **El resultado muestra la estrategia actual + 3 alternativas** del modelo (antes eran 2).
- **Sin IA dentro de la app.** Todo sale de reglas y estadística trazable. Ningún texto se genera con IA. Se saca el endpoint `/explicar` con Claude y la restricción en texto libre.
- **No toma ni saca conclusiones:** muestra datos comparados.
- **Empezamos por Córdoba:** el lote de la demo es de Córdoba.

Se mantiene de la v3:
- Solo usuarios expertos.
- Salida estandarizada, igual para todos.
- NASA es la base del análisis.
- Mediciones propias como Should, solo para contrastar.
- Mapa de riesgos con línea de tiempo.
- No se guarda nada.

**En una frase:** el productor experto o su agrónomo marca el lote, carga qué siembra, sus objetivos, sus restricciones y, si quiere, sus mediciones. Recibe **una tabla técnica que compara su rotación actual con 3 alternativas**, construida con datos de NASA de 20 a 30 años de ese punto, más un mapa de riesgos con línea de tiempo.

## Usuario
Productor con experiencia y agrónomo o asesor. Conocen el agro; lo que puede ser nuevo para ellos es lo satelital (resolución, confianza, NDVI).

## Principios de producto
1. **No receta y no concluye: compara datos.** La app no dice qué hacer ni cuál es mejor.
2. **Si un objetivo no se puede cumplir**, la tabla muestra qué alternativa queda más cerca y qué le falta, en números.
3. **Sin IA dentro de la app.** Indicadores, reglas de puntaje y textos salen de cálculos y plantillas fijas. Todo resultado se puede rastrear hasta el dato y la regla que lo produjo.
4. **Técnico por defecto:** valores con unidades, fuente, años, resolución y confianza siempre visibles.
5. **Estandarizado.** Mismas pantallas, misma tabla, mismas filas, unidades y escalas, **mismas 4 columnas (actual + 3 alternativas tipo)** y mismas reglas para todos. Solo cambian los datos de entrada.
6. **NASA es la base; el productor pesa más.** Sin mediciones propias, los puntajes salen solo de datos de NASA. La lluvia y las temperaturas mínima y máxima del productor (opcionales) se mezclan con NASA y pesan más según sus años de registro; se muestran también al lado, para contrastar.
7. **Cada capa del mapa se dibuja a la escala real del dato.**
8. **Nada inventado.** Lo que falta va a "Información que falta".
9. **Lenguaje:** nunca "te recomendamos", "deberías" ni "la mejor". Los textos describen datos: "esta alternativa tiene 5 meses más de cobertura y un balance de agua 60 mm menor en años secos".
10. **Apoya, no reemplaza:** el aviso "Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo" está siempre visible.

---

## Las 4 columnas del resultado (estandarizadas)

| Columna | Qué es | Cómo se arma (regla fija) |
|---|---|---|
| **Actual** | La rotación que cargó el usuario | Tal cual |
| **A · Cobertura de invierno** | Mismos cultivos de verano + un cultivo de servicio en el hueco de invierno | **Vicia** si el peso de "suelo" es mayor o igual que el de "erosión"; **centeno** si erosión pesa más o la pendiente es alta. Secado ~30 días antes de la siembra de verano |
| **B · Cultivo de invierno comercial** | Trigo (o cebada) en invierno y soja de segunda después (doble cultivo) | Trigo por defecto; cebada si el balance de agua de invierno es bajo |
| **C · Diversificar el verano** | Sumar un cultivo de verano distinto a la secuencia | **Sorgo** si el peso de "agua" es alto o el balance de verano es negativo; si no, **girasol** |

- Si una restricción descarta una alternativa (por ejemplo, "no sembrar trigo" o "maquinaria limitada"), la columna aparece en gris con el motivo ("descartada por: no sembrar trigo"). Así la tabla siempre tiene la misma forma.
- La alfalfa o pastura queda fuera del MVP: depende de la hacienda y rompe la estandarización.
- **Lo confirma la persona 3** con la tabla de cultivos.

---

## Flujo dentro de la app (intro + 2 pasos, desde la 4.2)

```
[Intro 3,5 s] → [Paso 1 · Tu caso] → [Paso 2 · Mapa + comparación]
```

**Intro:** foto real de campo con el cielo nublado que se abre y deja ver el sol. Una vez por sesión, se saltea tocando, y no aparece si la compu pide menos movimiento.

**Paso 1 · Tu caso (sin mapa):**
- **¿Cómo marcás tu lote?** Dos opciones:
  - **Usar el lote de ejemplo:** campo real cerca de Río Cuarto, 95 ha.
  - **Marcar mi lote:** "¿Dónde está tu lote?" con buscador de localidad, paraje o ruta (Esri); acepta coordenadas (decimales o grados) o un link de Google Maps; "Usar mi ubicación" toma el GPS si está en el campo. Hasta elegir el lugar, el botón dice "Elegí dónde está tu lote".
- Rotación actual (verano, invierno, campaña pasada).
- Objetivos con barritas de 0 a 5 ("cuánto te importa cada uno: 0 nada, 5 mucho").
- Restricciones de lista y "No sembrar".
- Datos del lote (se encharca, textura) y mediciones propias (pluviómetro, materia orgánica), plegados.

**Paso 2 · Mapa + comparación:** la caja se achica hacia la derecha, el mapa aparece detrás y vuela al lote (o al lugar elegido, ya en modo dibujo).
- Selector "Lote de ejemplo / Dibujar mi lote"; las esquinas se arrastran; tocar el mapa mueve el lote sin cambiar su forma.
- Capas: Vista aérea · Vegetación (NDVI) · Pendiente · Lluvia y heladas, con desplegable de meses.
- "Comparar alternativas": serie de lluvia de 30 campañas y las 4 tarjetas (actual + A, B, C), con la fila "visto por satélite" en la actual y la probabilidad climatológica en cada una.
- Compartir por mail, copiar o PDF.

---

## Casos de uso

| CU | Nombre | Prioridad |
|---|---|---|
| CU1 | Comparar la rotación actual con 3 alternativas para un lote | **Must** |
| CU2 | Mover los objetivos y ver cómo cambia la cercanía | **Must** |
| CU3 | Explorar el mapa de riesgos con capas y línea de tiempo | **Should** (capas regionales: Could) |
| CU4 | Sumar mediciones propias y contrastarlas con NASA | **Should** |
| CU5 | Enviar la comparación por mail o PDF | **Should** |
| CU6 | Ver qué significa un término satelital (tooltip fijo) | **Could** |

**CU1, flujos alternativos:**
- Falla un dataset → la tabla sale igual y el dato va a "Información que falta".
- Una restricción descarta una alternativa → la columna queda en gris con el motivo.
- Punto fuera de zona agrícola → "Marcá un lote de campo".

**CU2:** con los mismos valores ya calculados, se recalcula la cercanía a los objetivos ponderada por las barritas. No se vuelve a llamar a NASA. **No se elige ganador:** solo cambia el indicador de cercanía.

**CU4:**
- La lluvia del pluviómetro se muestra junto a NASA POWER. Si la diferencia pasa del 15 %, la confianza de los indicadores de agua baja a "media" y aparece una nota.
- La materia orgánica se muestra en la fila Suelo como "dato del productor".
- La lluvia y las temperaturas del productor entran en los puntajes del motor, mezcladas con NASA según los años de registro (RF15).

**CU5:** `mailto:` con la comparación en texto armado con una plantilla fija. Plan B: PDF.

---

## La tabla comparativa

**Encabezado:** lote (lat/lon, localidad) · fecha y hora · objetivos · restricciones · mediciones propias · aviso.

**Columnas:** Actual · A Cobertura de invierno · B Cultivo de invierno comercial · C Diversificar el verano.

| Fila | Qué muestra | Fuente |
|---|---|---|
| Resumen (plantilla fija) | "Cobertura: +5 meses · Agua: −60 mm en años secos · Erosión: −X" | Diferencias vs. actual |
| Calendario 12 meses | Cultivo por mes con días de helada y días > 35 °C marcados | NASA POWER + tabla de cultivos |
| Meses con cobertura baja | Actual: observado (NDVI). Alternativas: según el calendario | MODIS / calendario |
| Agua | Balance por temporada (mm) y diferencia vs. actual; pluviómetro al lado si existe | POWER (+ medición propia) |
| Suelo | Aporte de N, rastrojo, materia orgánica | Tabla de cultivos + SoilGrids / productor |
| Erosión | Meses con cobertura baja × pendiente (%) | MODIS + SRTM |
| Ingreso | Cultivos comerciales o forraje (sin precios) | Tabla de cultivos |
| Riesgo de helada / calor | Meses en conflicto con el calendario del cultivo | POWER |
| Cercanía a los objetivos | Por objetivo, en %, y qué le falta | Reglas de puntaje |
| Por tipo de año | Valores en años secos, normales y húmedos; "sensible al clima" si la diferencia es grande. Arriba de la tabla, la serie de las 30 campañas (RF24) | POWER, terciles |
| Reglas aplicadas | Qué reglas sumaron y restaron (plantilla) | Reglas de puntaje |
| Evidencia | "Balance negativo en julio en 22 de 30 años · NASA POWER · ~50 km" | Indicadores |
| Información que falta | Datos ausentes o de baja confianza | Indicadores |
| A revisar con el agrónomo | Reglas negativas y lo sensible al clima | Reglas de puntaje |

**Un solo período para todo (desde 2026-11-14):** todo lo que sale de POWER (lluvia y temperatura de cada mes, heladas, serie por campaña y terciles) sale de **un solo pedido mensual con las últimas 30 campañas completas, de julio a junio** (hoy, 1995/96 a 2024/25). **A alinear con Back 1:** `backend/PLAN.md` hoy pide POWER 1991–2024 por año calendario; si se mantiene, que sean 30 campañas completas y que la app diga el período. No mezclar con la climatología precalculada de POWER: usa otro período (2001-2025) y su mínima y máxima son extremos absolutos, no medias. Heladas: un mes es "de helada frecuente" si tuvo mínima < 0 °C en al menos 1 de cada 3 años, y se muestra como "helada en X de 30 años".

**Incertidumbre sin IA:** los 30 años se ordenan por el balance de agua de la campaña (en el prototipo, por la lluvia de la campaña; si el backend no llega con la evapotranspiración, se usa la lluvia y se dice) y se cortan en **tercios**: el tercio más seco son los "años secos", el del medio los "normales" y el más húmedo los "húmedos". Es una técnica estándar de climatología, simple de explicar, y reemplaza al k-means de la guía. Cada indicador muestra su confianza (alta / media / baja) según la resolución, los años y el contraste con la medición propia.

---

## Mapa interactivo

| Capa | Dato y escala | ¿Dentro del lote? | Prioridad |
|---|---|---|---|
| Riesgo de erosión (pendiente × meses con cobertura baja) | SRTM 30 m + MODIS | Sí | **Should** |
| NDVI mes a mes, con línea de tiempo | **NASA HLS 30 m** (Landsat + Sentinel-2, servido por Microsoft Planetary Computer) de la última campaña; MODIS 250 m de respaldo | Sí, lote por lote | **Should** |
| Balance de agua del mes | POWER ~50 km | No: contexto regional ("cada celda ≈ 50 km") | **Could** |
| Heladas del mes | POWER ~50 km | No: contexto regional | **Could** |

- Línea de tiempo de 12 meses, sincronizada con el calendario de la tabla.
- Leyenda con valores y escala.
- Las capas del lote de la demo se precalculan.

**Configuración del mapa para que se vea bien al acercar y alejar** (probada en el prototipo, Leaflet 1.9.4; copiar tal cual):

| Qué | Valor | Por qué |
|---|---|---|
| Zoom del mapa | `minZoom: 5`, `maxZoom: 18`, `zoomSnap: 0.25`, `wheelPxPerZoomLevel: 90` | En 19, Esri muestra "Map data not yet available" en el campo. Medio paso de zoom encuadra mejor el lote y la rueda queda suave |
| Imagen satelital (Esri World Imagery) | `maxNativeZoom: 17`, `maxZoom: 18`, `keepBuffer: 4` | Hasta 17 hay imagen real en la zona; en 18 se estira la de 17. Con el buffer no aparecen bordes grises al moverse |
| NDVI (NASA HLS 30 m, vía Planetary Computer; respaldo: GIBS `MODIS_Terra_L3_NDVI_16Day`) | HLS: buscar en `POST https://planetarycomputer.microsoft.com/api/stac/v1/search` las colecciones `hls2-s30` y `hls2-l30` que tocan el lote, en el mes, con `eo:cloud_cover < 30`, ordenadas por nubes; usar la primera. Tiles: `/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=…&item=…&expression=(B08-B04)/(B08+B04)` (en `hls2-l30`: `(B05-B04)/(B05+B04)`) `&asset_as_band=true&rescale=0,0.9&colormap=<6 clases>&format=png`. Escala clasificada de suelo a vegetación (arena = pelado, verdes = cubierto), validada con la skill de visualización: cortes 0 / 0,15 / 0,3 / 0,45 / 0,6 / 0,75 con `#E6D8AE #CDBA86 #94AF63 #689C49 #3F8139 #1B5E2E`; la leyenda marca el umbral 0,3 y el valor del lote. La fila del satélite en la tarjeta usa la misma escala, con el `+` codificado como `%2B`. Capa: `minZoom: 9`, `maxNativeZoom: 16`, `opacity: 0.85`, CSS `image-rendering: pixelated`, zoom máximo 17. MODIS de respaldo: `maxNativeZoom: 9`, zoom máximo 16 | Sin cuenta y con CORS abierto: anda desde el navegador. Se ve lote por lote (30 m contra 250 m de MODIS) y sigue siendo dato de NASA. Si no hay escena sin nubes en el mes, cae a MODIS y la leyenda lo dice |
| Lote chico en pantalla | Si el lote mide menos de 28 px, se muestra un punto en su centro; tocarlo vuelve a encuadrar el lote | Alejando, el lote nunca se pierde |
| Encuadre | `fitBounds` con lugar para el panel y la hoja (zoom máximo 17); en NDVI, el lote con un margen del 35 % | El lote siempre queda visible, aunque sea chico |
| Clima (POWER) | Recuadro de la celda de ~50 km, nunca pintado dentro del lote | Escala real del dato |

**Fuentes probadas en el prototipo (todas responden desde el navegador, sin login):**

| Para qué | Fuente | Nota |
|---|---|---|
| Mapa base satelital | Esri World Imagery (tiles) | Con atribución "Imagen © Esri, Maxar, Earthstar Geographics" |
| NDVI por mes | NASA GIBS, capa `MODIS_Terra_L3_NDVI_16Day`, `GoogleMapsCompatible_Level9` | `MODIS_Terra_NDVI_8Day` da 404 |
| Clima del punto | NASA POWER API **mensual** (`PRECTOTCORR_SUM`, `T2M_MIN`, `T2M_MAX`, comunidad AG), últimas 30 campañas | Un solo pedido y un solo período para todo (desde la 4.2; antes, climatología) |
| Buscar el lugar del lote | Esri World Geocoding (`suggest`, `findAddressCandidates`), sin cuenta y con CORS | Mostrar "Búsqueda: Esri" |
| NDVI del lote a 30 m | NASA HLS vía Planetary Computer (STAC + `item/statistics`) | Ver `backend/PLAN.md` (Back 2, `satelite/ndvi.py`) |
| Pendiente | AWS Terrain Tiles (formato terrarium, incluye SRTM), zoom 14 | Usar el **plano ajustado** sobre el lote para la pendiente general; el valor por píxel es ruidoso |
| Celda de clima | Grilla de NASA POWER de 0,5° × 0,625° | Se dibuja como recuadro de ~50 km para mostrar la escala |

Ojo: las páginas de artifact de Claude bloquean estos mapas. El prototipo es un HTML que se abre en el navegador; la app real (Next.js + Leaflet) los carga sin problema.

---

## Lote de la demo: Córdoba

**Decidido (2026-11-13): zona de Río Cuarto, sur de Córdoba.** Lote de soja con barbecho invernal.

**Punto usado en el prototipo:** campo real a ~17 km de Río Cuarto, centro ≈ 33,2477° S, 64,2325° O, ~95 ha. Pendiente general 0,6 % (plano ajustado sobre la elevación). En el NDVI de julio de 2024 (NASA) se ve marrón, en barbecho, entre lotes verdes. El equipo lo puede confirmar o cambiar; si lo cambia, se precalcula de nuevo.

Por qué Río Cuarto:
- Es zona agrícola frágil, con riesgo de erosión por viento y por agua.
- Hay ensayos de Aapresid ahí mismo: en el sur cordobés, los cultivos de servicio capturaron más agua que los barbechos (Bichos de Campo). Es evidencia local para la alternativa A.

La app funciona en cualquier punto; Río Cuarto es el lote precalculado para la demo.

---

## Requerimientos funcionales

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF1 | Ubicar y marcar el lote: lote de ejemplo, o buscador de lugares (Esri `suggest` + `findAddressCandidates`, sin cuenta), coordenadas o link de Google Maps, o GPS. **Dibujo por puntos** (polígono de cualquier forma, una L por ejemplo), esquinas arrastrables, mínimo 1 ha y máximo 20.000 ha, sin líneas cruzadas; tocar el mapa mueve el lote sin cambiar su forma. Probado en el prototipo | Must |
| RF2 | Cultivo de verano, invierno y campaña pasada; calendario de 12 meses automático | Must |
| RF3 | Editar las fechas del calendario | Should |
| RF4 | 4 objetivos con barritas de 0 a 5, por defecto en 3 | Must |
| RF5 | Restricciones de lista: sin riego (por defecto), sin hacienda, maquinaria limitada, no sembrar | Must |
| RF6 | Campos del lote: se encharca, textura del suelo | Should |
| RF7 | Traer datos de NASA: POWER (P0); MODIS y SRTM (P1); SoilGrids y GAEZ (P2) | Must (P0) / Should (P1) |
| RF8 | Generar las 3 alternativas tipo (A, B, C) con reglas fijas, respetando las restricciones; descartadas en gris con el motivo | Must |
| RF9 | Calcular valores, diferencias vs. actual y cercanía a los objetivos **con datos de NASA y reglas fijas** | Must |
| RF10 | Calcular valores por tipo de año (terciles de 30 años) y marcar "sensible al clima" | Must |
| RF11 | Tabla comparativa técnica de 4 columnas con valores, unidades, fuente, años, resolución y confianza | Must |
| RF12 | Textos de la tabla generados con plantillas fijas a partir de los valores (sin IA) | Must |
| RF13 | Recalcular la cercanía al mover las barritas, sin volver a llamar a NASA | Must |
| RF14 | Mostrar lo que vio el satélite: NDVI medio del lote en cada mes de la última campaña (HLS 30 m, `POST /api/data/v1/item/statistics` con el polígono del lote). Mes "pelado" si el NDVI medio es < 0,3 (regla a validar con la persona 3). Si no coincide con la rotación cargada (2 meses o más de diferencia), va a "Revisar con el agrónomo". No cambia los puntajes | Should |
| RF15 | **Decisión 2026-11-14.** Mediciones propias **al lado** de NASA: "Tu pluviómetro: 650 mm/año · NASA: 824 mm (−21 %)". Diferencia > 15 % baja la confianza del agua a "baja" y va a "Revisar con el agrónomo". Se muestra un "corregido con tu pluviómetro" informativo (por ejemplo, el umbral de año seco). Carga a mano, sin subir archivo. **Actualizado 2026-11-14 (a confirmar por la persona 3):** la lluvia y las temperaturas mínima y máxima del productor **sí cambian los puntajes**: el motor las mezcla con NASA con un peso que crece con los años de registro (1–2 años 40 %, 3–4 50 %, 5–9 60 %, 10 o más 75 %) y lo dice en la evidencia | Should |
| RF16 | Capa de riesgo de erosión dentro del lote | Should |
| RF17 | Capa NDVI por mes con línea de tiempo sincronizada con el calendario | Should |
| RF18 | Leyenda con valores y escala; tocar una zona muestra el valor y la fuente | Should |
| RF19 | Capas regionales de balance de agua y heladas | Could |
| RF20 | Enviar por mail (`mailto:`, plantilla fija) y descargar PDF | Should |
| RF21 | "Información que falta" por columna | Must |
| RF22 | Aviso de apoyo visible en inicio y resultados | Must |
| RF23 | Tooltips fijos de términos satelitales | Could |
| RF25 | **Decisión 2026-11-14. Probabilidad climatológica** por estrategia: frecuencia observada en las 30 campañas de los eventos que importan para su calendario (helada con cultivo sensible; siembra con menos de la mitad de la lluvia normal; máxima de 35 °C o más). Texto fijo: "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)". La primera va en la tarjeta; todas, en el detalle. Implementado en el prototipo | Must |
| RF24 | Serie año a año: lluvia de cada una de las 30 campañas (julio a junio, POWER mensual), pintada por tercio, con el promedio de las últimas 10 contra las 20 previas. Describe, no proyecta: sin tendencias ni pronósticos. Sale de los mismos datos que RF10 | Could (primero del sábado a la noche) |

## Requerimientos no funcionales

| ID | Requerimiento |
|---|---|
| RNF1 | **Sin IA en la app:** ningún modelo de lenguaje ni de machine learning en tiempo de uso. Todo es reglas, estadística y plantillas |
| RNF2 | **Trazable:** cada valor y cada texto se puede rastrear hasta el dato y la regla que lo produjo |
| RNF3 | **Estandarizado:** misma estructura de salida para todos los usuarios y lotes |
| RNF4 | **Para expertos:** lenguaje agronómico técnico; lo satelital, en una línea |
| RNF5 | **Compu primero:** la tabla de 4 columnas se diseña para la compu; en el celu, scroll horizontal |
| RNF6 | **Sin login y sin guardar datos** |
| RNF7 | **Respuesta:** menos de 30 s, con progreso por fuente |
| RNF8 | **Demo a prueba de WiFi:** el lote de Córdoba, con capas, está precalculado |
| RNF9 | **Seguridad:** claves en variables de entorno |
| RNF10 | **Idioma:** español en la app; confirmar con la organización si la entrega va en inglés |
| RNF11 | **Accesibilidad básica:** buen contraste; el color nunca es la única señal |

---

## Fuera del alcance
- IA dentro de la app (LLM, chat, machine learning). **Incluye un modelo de predicción propio** (decidido el 2026-11-14): no hay datos de resultados por lote para entrenarlo ni tiempo de validarlo. Va al pitch como próximo paso.
- Tendencias por pendiente sobre 30 años y años análogos (2026-11-14): la primera es ruidosa en una celda de ~50 km; la segunda queda como próximo paso.
- Restricciones en texto libre.
- Login, cuentas.
- Guardar comparaciones o historial.
- Varios lotes.
- Subir planillas o historial de mediciones.
- Precios de mercado reales.
- Elegir "la mejor" alternativa.
- Mails desde un servidor propio.
- App nativa.
- Línea de tiempo por años **en el mapa** (NDVI de 25 años sobre el lote). La serie por campaña sí entra, en la tabla (RF24).
- Pasturas o alfalfa.
- Vistas personalizadas.

---

## Contrato de la API (confirmar con la persona 1)

```
POST /analizar
entrada: {
  lote: { tipo: 'ejemplo' | 'dibujado', poligono: GeoJSON Polygon [lon, lat], centro: [lat, lon] (centroide), area_ha },
  lat, lon,  (= centro, por compatibilidad)
  cultivo_verano, invierno, campana_pasada,
  calendario: [12] (opcional; pisa al automático),
  prioridades: { agua, suelo, ingreso, erosion } (0 a 5),
  restricciones: ['sin_riego', 'sin_hacienda', 'maquinaria_limitada'],
  no_sembrar: [cultivos],
  anegable: 'si' | 'a_veces' | 'no' | 'no_se',
  textura_suelo: 'arenoso' | 'franco' | 'arcilloso' | 'no_se',
  mediciones_propias: { lluvia_anual_mm?, anios_registro?, materia_organica_pct? }
}

salida: {
  lote: { localidad_aprox, pendiente_pct },
  visto_por_satelite: { campana, fuente: 'NASA HLS 30 m', meses: [12] { fecha, ndvi_medio, nubes_escena } | null, meses_ndvi_bajo, umbral: 0.3 },
  indicadores: { nombre: { valor, unidad, fuente, anios, resolucion, confianza } },
  contraste_mediciones: [ { indicador, valor_productor, valor_nasa, diferencia_pct, confianza_resultante: 'alta' | 'baja', corregido_al_lado: { umbral_seco_mm, nota } } ],
  clima_celda: { bbox: [oeste, sur, este, norte], posicion_lote: 'bien adentro' | 'cerca del borde sur' | … },
  clima_mensual: { lluvia_mm[12], minima_media_c[12], maxima_media_c[12], anios_con_helada[12], anios_con_35c[12] },
  tipos_de_anio: { metodo: 'terciles', seco: [años], normal: [años], humedo: [años], umbral_seco_mm, umbral_humedo_mm },
  serie_anual: { fuente, resolucion, periodo, campanas: [ { campana: '2021/22', lluvia_mm, balance_mm?, tipo: 'seco'|'normal'|'humedo' } ],
    ultimas_10_mm, previas_20_mm, secos_en_ultimas_10 },
  capas: { erosion, ndvi_mensual[12], agua_regional_mensual[12] (Could), heladas_regional_mensual[12] (Could), no_disponibles },
  estrategias: [ x4: actual, A, B, C {
    id, nombre, disponible, motivo_descarte,
    calendario: [12],
    valores: { agua_mm, meses_cobertura_baja, aporte_n, rastrojo, erosion, ingreso, conflictos_helada_calor },
    valores_por_tipo_anio: { seco, normal, humedo },
    diferencia_vs_actual: { agua, suelo, erosion, ingreso },
    cercania_objetivos: { agua, suelo, erosion, ingreso }, que_le_falta, sensible_clima,
    reglas_aplicadas: [ { regla, efecto, dato } ],
    probabilidades: [ { evento, mes, cultivo, anios, de, pct, texto, fuente } ],
    evidencia, vacios, riesgos
  } ]
}
```

Los textos (resumen, "qué le falta", evidencia, riesgos, probabilidades) los arma el backend con plantillas fijas. No hay endpoint `/explicar`.

---

## Orden de construcción

| Cuándo | Qué tiene que estar |
|---|---|
| Viernes 01:00 | API con indicadores reales de POWER para el lote de Córdoba; front con pantallas 2 a 5 con datos falsos |
| Sábado 13:00 | De punta a punta: RF1, RF2, RF4, RF5, RF7 (POWER), RF8-RF13, RF21, RF22. Primer deploy |
| Sábado 20:00 | + RF14, RF16-RF18 (MODIS, SRTM, mapa precalculado para la demo), RF15, RF20, RF3, RF6. **Deploy estable: lo que no anda se recorta** |
| Sábado noche | Solo si todo está estable: RF24 (primero), RF19, SoilGrids, GAEZ, RF23 |
| Domingo 12:00 | Congelado total |

Orden de recorte a las 20:00: capas regionales → tooltips → mail/PDF → mediciones propias → mapa. **Nunca:** las 4 columnas, los 5 puntos de cada una ni la incertidumbre por tipo de año.

---

## Para el pitch y el jurado
- El desafío menciona SI (inteligencia) como **opción**, no como obligación ("may"). Nuestra respuesta a "¿dónde está la inteligencia?": **"Decidimos a propósito no poner IA en la app: reglas agronómicas y estadística de 30 años de datos de NASA. Cada resultado se puede rastrear hasta el dato que lo produjo. Para que un agrónomo confíe, tiene que poder verificarlo."** Coincide con lo que pidieron los técnicos en la encuesta (4 de 7: "que explique por qué").
- **"¿Predicen?"** Sí, con estadística explicable: "en 14 de 30 años la siembra de vicia en mayo tuvo menos de la mitad de la lluvia normal (47 %)". Es frecuencia observada en 30 campañas de NASA, no un modelo de caja negra.
- **"¿Y el dato del productor?"** Se contrasta con NASA y ajusta la confianza; no la reemplaza.
- **Próximos pasos:** modelo entrenado y validado con rendimientos por lote (productores, INTA) y años análogos.
- Ojo: el equipo sí usa IA (Claude Code) **para programar**. Eso se declara en la sección "Use of SI" de la entrega.
