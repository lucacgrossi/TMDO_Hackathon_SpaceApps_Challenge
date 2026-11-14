# Field Shift · MVP (versión 4.1, 2026-11-13)

**Último ajuste (4.1):**
- Lote de la demo ubicado sobre un campo real.
- Mapa base satelital real.
- Fuentes probadas en el prototipo `prototipo/field-shift-mapa.html` (ver "Lote de la demo" y "Mapa interactivo").

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
6. **NASA es la base.** Los puntajes salen solo de datos de NASA. Las mediciones propias se muestran al lado para contrastar y ajustar la confianza.
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

## Flujo dentro de la app (5 pantallas)

```
[1 Inicio] → [2 Lote] → [3 Rotación y mediciones] → [4 Objetivos y restricciones] → [Analizando…] → [5 Comparación]
```

**Pantalla 1 · Inicio**
- "Compará rotaciones para un lote con 20 a 30 años de observaciones de NASA."
- Aviso de apoyo.
- Botón "Empezar".

**Pantalla 2 · Lote**
- Mapa **centrado en Córdoba** con buscador de localidad.
- Un click marca el lote; lat/lon visible y editable.
- Confirmación: "Lote cerca de [localidad] · pendiente media X %".

**Pantalla 3 · Rotación y mediciones**
- Cultivo de verano · invierno · campaña pasada.
- Calendario de 12 meses armado solo y editable.
- Se encharca (Sí / A veces / No / No sé) · Textura del suelo (Arenoso / Franco / Arcilloso / No sé).
- **Mediciones propias (opcional):** lluvia anual del pluviómetro (mm) y años de registro · materia orgánica (%).

**Pantalla 4 · Objetivos y restricciones**
- 4 barritas de 0 a 5: agua · suelo · erosión · ingreso. Todas en 3 por defecto.
- Restricciones **solo de lista** (sin texto libre, porque no hay IA que lo interprete):
  - ☑ Sin riego (por defecto)
  - ☐ Sin hacienda
  - ☐ Maquinaria limitada
  - "No sembrar…" (varios cultivos)
- Botón "Comparar".

**Analizando:** progreso por fuente ("NASA POWER: 30 años de clima… MODIS: cobertura… SRTM: pendiente…").

**Pantalla 5 · Comparación**
1. Mapa de riesgos con capas y línea de tiempo de 12 meses.
2. Lo que vio el satélite: "NDVI bajo de mayo a octubre en 8 de los últimos 10 años (MODIS, 250 m)".
3. Mediciones propias vs. NASA, si las hay.
4. **Tabla comparativa: Actual · A · B · C.**
5. Barritas de objetivos al costado: si se mueven, se recalcula la cercanía en el momento.
6. Botones: "Enviar por mail" · "Descargar PDF" · "Nueva comparación".

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
- Ningún puntaje cambia.

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
| Por tipo de año | Valores en años secos, normales y húmedos; "sensible al clima" si la diferencia es grande | POWER, terciles |
| Reglas aplicadas | Qué reglas sumaron y restaron (plantilla) | Reglas de puntaje |
| Evidencia | "Balance negativo en julio en 22 de 30 años · NASA POWER · ~50 km" | Indicadores |
| Información que falta | Datos ausentes o de baja confianza | Indicadores |
| A revisar con el agrónomo | Reglas negativas y lo sensible al clima | Reglas de puntaje |

**Incertidumbre sin IA:** los 30 años se ordenan por el balance de agua de la campaña y se cortan en **tercios**: el tercio más seco son los "años secos", el del medio los "normales" y el más húmedo los "húmedos". Es una técnica estándar de climatología, simple de explicar, y reemplaza al k-means de la guía. Cada indicador muestra su confianza (alta / media / baja) según la resolución, los años y el contraste con la medición propia.

---

## Mapa interactivo

| Capa | Dato y escala | ¿Dentro del lote? | Prioridad |
|---|---|---|---|
| Riesgo de erosión (pendiente × meses con cobertura baja) | SRTM 30 m + MODIS | Sí | **Should** |
| NDVI mes a mes, con línea de tiempo | MODIS 250 m | Sí, a grandes rasgos | **Should** |
| Balance de agua del mes | POWER ~50 km | No: contexto regional ("cada celda ≈ 50 km") | **Could** |
| Heladas del mes | POWER ~50 km | No: contexto regional | **Could** |

- Línea de tiempo de 12 meses, sincronizada con el calendario de la tabla.
- Leyenda con valores y escala.
- Las capas del lote de la demo se precalculan.

**Fuentes probadas en el prototipo (todas responden desde el navegador, sin login):**

| Para qué | Fuente | Nota |
|---|---|---|
| Mapa base satelital | Esri World Imagery (tiles) | Con atribución "Imagen © Esri, Maxar, Earthstar Geographics" |
| NDVI por mes | NASA GIBS, capa `MODIS_Terra_L3_NDVI_16Day`, `GoogleMapsCompatible_Level9` | `MODIS_Terra_NDVI_8Day` da 404 |
| Clima del punto | NASA POWER API, climatología (`T2M_MIN`, `T2M_MAX`, `PRECTOTCORR`, comunidad AG) | Lluvia en mm/día × días del mes |
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
| RF1 | Seleccionar el lote en un mapa centrado en Córdoba (click, buscador, lat/lon) | Must |
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
| RF14 | Mostrar lo que vio el satélite (meses con NDVI bajo) | Should |
| RF15 | Mediciones propias junto a NASA; diferencia > 15 % baja la confianza; no cambian puntajes | Should |
| RF16 | Capa de riesgo de erosión dentro del lote | Should |
| RF17 | Capa NDVI por mes con línea de tiempo sincronizada con el calendario | Should |
| RF18 | Leyenda con valores y escala; tocar una zona muestra el valor y la fuente | Should |
| RF19 | Capas regionales de balance de agua y heladas | Could |
| RF20 | Enviar por mail (`mailto:`, plantilla fija) y descargar PDF | Should |
| RF21 | "Información que falta" por columna | Must |
| RF22 | Aviso de apoyo visible en inicio y resultados | Must |
| RF23 | Tooltips fijos de términos satelitales | Could |

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
- IA dentro de la app (LLM, chat, machine learning).
- Restricciones en texto libre.
- Login, cuentas.
- Guardar comparaciones o historial.
- Varios lotes.
- Subir planillas o historial de mediciones.
- Precios de mercado reales.
- Elegir "la mejor" alternativa.
- Mails desde un servidor propio.
- App nativa.
- Línea de tiempo por años.
- Pasturas o alfalfa.
- Vistas personalizadas.

---

## Contrato de la API (confirmar con la persona 1)

```
POST /analizar
entrada: {
  lat, lon,
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
  visto_por_satelite: { meses_ndvi_bajo, anios_observados },
  indicadores: { nombre: { valor, unidad, fuente, anios, resolucion, confianza } },
  contraste_mediciones: [ { indicador, valor_productor, valor_nasa, diferencia_pct, confianza_resultante } ],
  tipos_de_anio: { metodo: 'terciles', seco: [años], normal: [años], humedo: [años] },
  capas: { erosion, ndvi_mensual[12], agua_regional_mensual[12] (Could), heladas_regional_mensual[12] (Could), no_disponibles },
  estrategias: [ x4: actual, A, B, C {
    id, nombre, disponible, motivo_descarte,
    calendario: [12],
    valores: { agua_mm, meses_cobertura_baja, aporte_n, rastrojo, erosion, ingreso, conflictos_helada_calor },
    valores_por_tipo_anio: { seco, normal, humedo },
    diferencia_vs_actual: { agua, suelo, erosion, ingreso },
    cercania_objetivos: { agua, suelo, erosion, ingreso }, que_le_falta, sensible_clima,
    reglas_aplicadas: [ { regla, efecto, dato } ],
    evidencia, vacios, riesgos
  } ]
}
```

Los textos (resumen, "qué le falta", evidencia, riesgos) los arma el backend con plantillas fijas. No hay endpoint `/explicar`.

---

## Orden de construcción

| Cuándo | Qué tiene que estar |
|---|---|
| Viernes 01:00 | API con indicadores reales de POWER para el lote de Córdoba; front con pantallas 2 a 5 con datos falsos |
| Sábado 13:00 | De punta a punta: RF1, RF2, RF4, RF5, RF7 (POWER), RF8-RF13, RF21, RF22. Primer deploy |
| Sábado 20:00 | + RF14, RF16-RF18 (MODIS, SRTM, mapa precalculado para la demo), RF15, RF20, RF3, RF6. **Deploy estable: lo que no anda se recorta** |
| Sábado noche | Solo si todo está estable: RF19, SoilGrids, GAEZ, RF23 |
| Domingo 12:00 | Congelado total |

Orden de recorte a las 20:00: capas regionales → tooltips → mail/PDF → mediciones propias → mapa. **Nunca:** las 4 columnas, los 5 puntos de cada una ni la incertidumbre por tipo de año.

---

## Para el pitch y el jurado
- El desafío menciona SI (inteligencia) como **opción**, no como obligación ("may"). Nuestra respuesta a "¿dónde está la inteligencia?": **"Decidimos a propósito no poner IA en la app: reglas agronómicas y estadística de 30 años de datos de NASA. Cada resultado se puede rastrear hasta el dato que lo produjo. Para que un agrónomo confíe, tiene que poder verificarlo."** Coincide con lo que pidieron los técnicos en la encuesta (4 de 7: "que explique por qué").
- Ojo: el equipo sí usa IA (Claude Code) **para programar**. Eso se declara en la sección "Use of SI" de la entrega.
