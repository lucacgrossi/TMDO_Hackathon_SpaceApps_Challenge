# Plan · Armonización de las capas del mapa

**Estado:** propuesta de Back 2 (Luca), 14/11. **Implementada (15/11):** los pasos 1 a 7 de la sección 9 están en `dev`. Queda abierta solo la escala de clases de erosión (sección 10).

## 1. El problema
*Diagnóstico del 14/11, ya resuelto:* el mapa y la tabla calculaban **por separado** y podían mostrar cosas distintas sobre el mismo lote:

| Capa | Tabla / panel (back) | Mapa (front, PR #25) | Riesgo |
|---|---|---|---|
| Pendiente | NASADEM 30 m, plano ajustado en `satelite/elevacion.py` | El navegador la calcula con las teselas terrarium de AWS y un blur r=5 (`lib/pendiente.ts`); si falla, muestra **1,6 % "ilustrativo"** | El número del panel y los colores del mapa salen de datos distintos; el 1,6 % viola "nada inventado" |
| NDVI | HLS de la **campaña de POWER** (2025/26), escena elegida por `ndvi.py`, media con `item/statistics` | El front busca **su propia** escena HLS por mes, con su propio año de campaña, y su propia media | El mapa puede mostrar otra escena, u otro año, que "visto por satélite" |
| Erosión | Un valor del lote (pendiente × meses bajos) | No hay capa por píxel | No se ve **dónde** está el riesgo dentro del lote |
| Cultivo | % del lote (WorldCover) | No hay capa | — |
| Clima | Celda POWER de ~50 km | Recuadro de la celda (`CapaClima`) | Bien: contexto regional |

**Objetivo:** que cada píxel del mapa salga de **los mismos datos, la misma grilla, la misma fecha y la misma escala de colores** que los números de la tabla. Si alguien toca un píxel, el valor tiene que cerrar con el resumen del lote.

## 2. Principio que se mantiene
"**Cada capa se dibuja a la escala real del dato**" (`CLAUDE.md`). Armonizar **no** es inventar resolución:
- Los datos a 30 m o menos (NASADEM, HLS, WorldCover) se muestran **por píxel dentro del lote**, sobre la misma grilla.
- MODIS de respaldo (250 m) se pone en la grilla con **vecino más cercano**: se ven bloques de 250 m a propósito, y la leyenda lo dice.
- Lo regional (POWER ~50 km, MODIS ET 500 m) **nunca se pinta dentro del lote**: va como recuadro o como número, con la leyenda "contexto regional".

## 3. La estrategia: el back calcula, el front dibuja
Una sola fuente de verdad: **el backend arma todas las capas sobre una grilla común del lote y las entrega listas para dibujar**. El front deja de calcular datos (salvo la cercanía, RF13) y solo superpone imágenes y lee valores. La armonización tiene tres ejes:

### 3.1 Espacio: una grilla por lote
- **Sistema de coordenadas:** EPSG:4326 (lat/lon).
- **Paso:** **1 segundo de arco** (1/3600°), que es la grilla nativa de NASADEM: ~30 m de norte a sur y ~26 m de este a oeste en Córdoba. Así la pendiente no se remuestrea.
- **Extensión:** el bbox del polígono, **ajustado a los bordes de los píxeles de NASADEM**, que caen en (j + ½)″ porque NASADEM centra cada píxel en el segundo entero (`ORIGEN_SEGUNDOS = 0.5` en `grilla.py`). Ancho y alto se calculan una vez y se usan para todas las capas.
- **Máscara del lote:** un píxel está adentro si su centro cae dentro del polígono (point-in-polygon con `numpy`, sin shapely). Es **la misma máscara** para todas las capas y todos los resúmenes.
- **Tamaño máximo:** 250.000 píxeles por capa. Un lote de 20.000 ha da ~540 × 430: entra. Si un lote lo supera, el paso sube de a 1″ (2″ ≈ 60 m, 3″…) hasta que entre, y la nota lo dice. Con más de 1″, NASADEM se remuestrea con `average`.
- **Verificado el 14/11 en el lote demo** (41 × 30 píxeles, `dst_crs=epsg:4326`):

| Fuente | Pedido a Planetary Computer | Resultado |
|---|---|---|
| NASADEM | `GET /data/v1/item/crop/{bbox}/{W}x{H}.npy?…&assets=elevation` | (30, 41) + máscara, 5 KB, 1,0 s |
| WorldCover | `GET /data/v1/item/crop/{bbox}/{W}x{H}.npy?…&assets=map&resampling=nearest` | (30, 41), 2,6 KB, 1,2 s |
| MODIS 13Q1 | `GET /data/v1/item/crop/{bbox}/{W}x{H}.npy?…&assets=250m_16_days_NDVI&resampling=nearest` | (30, 41), 1,0 s |
| HLS (NDVI) | `GET /data/v1/item/bbox/{bbox}/{W}x{H}.npy?…&expression=(B08-B04)/(B08+B04)&asset_as_band=true` (con `crop` da **404**; también anda `POST /item/crop/{W}x{H}.npy` con el polígono) | (30, 41), 1,5 s |

Todas vuelven **alineadas píxel a píxel**: la misma forma y los mismos bordes. En el código, `pc.raster_en_grilla` usa `item/bbox` para las cuatro fuentes (sección 7).

**Remuestreo por fuente:**
- NASADEM: ninguno (`nearest`), porque la grilla es la suya; `average` si el paso sube a 2″ o más.
- HLS (UTM, 30 m): `bilinear`, porque es un índice continuo de resolución parecida.
- WorldCover (10 m): `mode` (la clase mayoritaria de cada píxel de 30 m), verificado el 14/11 en `item/bbox`.
- MODIS (250 m): `nearest`, para que se vean los bloques.

**Distorsión en el mapa:** Leaflet estira la imagen lat/lon linealmente entre sus bordes en Web Mercator. Para 0,15° de latitud (un lote de 20.000 ha) a −33°, el error es de ~0,1 píxel: no se nota.

### 3.2 Tiempo: una campaña y un mismo mes
- **Campaña única:** la última de POWER (hoy 2025/26), que decidió Benja en #28. `servicio.py` ya se la pasa a `ndvi.calcular`, y vale para todas las capas.
- **Mes:** índice 0 = enero en todos los arrays de 12 (back y front). La línea de tiempo del mapa mueve un solo `mes`, y todas las capas mensuales leen ese índice.
- **Escena del mes:** la que eligió `ndvi.py` (la misma de "visto por satélite"). El front **no busca escenas propias**.
- Cada capa dice su fecha: la de la escena (NDVI), "estática" (pendiente) o el año (WorldCover 2021).

### 3.3 Significado: las mismas escalas en todos lados
Un módulo `satelite/escalas.py` con **una sola definición** de cada escala, que viaja con cada capa y que usa la leyenda del front:

| Capa | Cortes | Colores | Fuente de la escala |
|---|---|---|---|
| NDVI | 0 · 0,15 · **0,3** · 0,45 · 0,6 · 0,75 | `#E6D8AE #CDBA86 #94AF63 #689C49 #3F8139 #1B5E2E` | MVP 4.2 ("Mapa interactivo"); 0,3 = umbral de cobertura baja (`ndvi.UMBRAL_NDVI_BAJO`) |
| Pendiente (%) | 0 · 1 · 2,5 · 4 · 6 | verde → amarillo → rojo, como `slopeColor` del prototipo | Prototipo |
| Meses con cobertura baja | 0 · 1 · 3 · 5 · 7 | `#1B5E2E #94AF63 #E6D8AE #CDA35F #8D5524` | `escalas.MESES_BAJOS` |
| Erosión (índice, % × meses) | 0 · 2 · 5 · 10 · 20 (**provisoria**, ver sección 10) | Misma rampa que la pendiente | `escalas.EROSION` |
| Cultivo | Clase 40 sí / no (el píxel vale 100 o 0) | Relleno gris (`#9E9E9E`) u amarillo (`#F2C94C`) | `escalas.CULTIVO` (WorldCover) |

El umbral 0,3 y los cortes se leen **de la capa**, no se repiten en el front.

## 4. Qué se calcula por píxel
Sobre la grilla y la máscara del lote:
- **Pendiente por píxel** (gradiente del modelo de elevación con un suavizado chico) para la capa. La **pendiente general** sigue siendo el plano por mínimos cuadrados **sobre la misma grilla**: es el número de la tabla.
- **NDVI por mes:** 12 rasters (uno por escena). El **NDVI medio del lote** de cada mes pasa a ser la media del raster dentro de la máscara, en lugar de `item/statistics`, para que el número sea **exactamente** el promedio de lo que se ve.
- **Meses con cobertura baja por píxel:** cuántos meses ese píxel estuvo bajo 0,3.
- **Erosión por píxel** = pendiente del píxel × meses bajos del píxel: se ve **dónde** está el riesgo. El **valor del lote** es la pendiente general (plano) × la media de los meses bajos por píxel, no la media del mapa: la pendiente por píxel de NASADEM es ruidosa y sesgada hacia arriba en terreno llano (en el lote demo daba 5,5 contra 2,6). `resumen.valor_lote` de la capa es ese valor y `resumen.media` sigue siendo la media por píxel (`capas.erosion_por_pixel`).
- **Cultivo por píxel** (WorldCover). El % del lote es la proporción dentro de la máscara.

**Regla de coherencia:** todo número del lote que también es una capa se calcula **como resumen del raster de esa capa**. Si un raster falla, el número sale de su método anterior y la capa va a `no_disponibles`.

## 5. Formato de entrega (contrato, Benja)
Un modelo nuevo, **aditivo** (no rompe lo que hay):
```
CapaRaster:
  id: "ndvi" | "pendiente" | "erosion" | "cultivo" | ...
  titulo, unidad, fuente, fecha | campana
  resolucion_nativa: "30 m" | "250 m (MODIS, respaldo)" | ...
  resolucion_grilla: "1″ (~30 m)"
  bounds: [[sur, oeste], [norte, este]]          # los mismos para todas las capas del lote
  ancho, alto
  png: str                                        # base64, pintado con la escala; transparente fuera del lote
  valores: str | None                             # base64 de int16 cuantizado, para leer el valor de un píxel (RF18)
  factor: float, nodata: int                      # valor = entero × factor
  escala: {cortes: [float], colores: [str], etiquetas: [str]}
  resumen: {media, min, max, pixeles}
  confianza, nota
```
**Formato de `valores` y del PNG** (confirmado con Front 1 en #25, 14/11):
- int16 **little-endian** (`<i2`, como los `.npy` de Planetary Computer), `ancho × alto` valores en **orden por filas**, en base64.
- **Fila 0 = norte** (borde superior de `bounds`) y **columna 0 = oeste**. El PNG usa la misma orientación.
- El píxel `[f][c]` cubre desde `norte − f·paso_lat` hacia el sur y desde `oeste + c·paso_lon` hacia el este, con `paso_lat = (norte − sur) / alto` y `paso_lon = (este − oeste) / ancho`.
- Valor real = entero × `factor`. `nodata` (y todo píxel fuera de la máscara del lote) no tiene valor.

En `Capas`, solo se **agregan** campos opcionales:
- `CapaNdviMes.mapa: CapaRaster | None`: el raster de ese mes. Los campos de hoy (colección, item, fecha) se mantienen.
- `pendiente_mapa`, `erosion_mapa` y `cultivo_mapa: CapaRaster | None`.
- `grilla: {bounds, ancho, alto, paso}`: la grilla común, para que el front verifique que todo coincide.

**Peso:** en el lote demo, cada capa pesa unos pocos KB. Para 20.000 ha, ~30–80 KB por PNG. Con 12 NDVI + 3 capas, menos de ~1,5 MB en el peor caso, y la grilla de 60 m baja eso a la cuarta parte.

**Demo sin internet:** como las capas viajan en la respuesta, `demo/rio_cuarto.json` **incluye el mapa completo**. Hoy, sin internet, las teselas de NDVI de Planetary Computer no cargan.

## 6. Front (Front 1)
- Las capas del lote (NDVI, pendiente, erosión y cultivo) se dibujan con un solo componente, `CapaRasterLote` (`ImageOverlay` con `png` y `bounds` de la respuesta), `className="px"` y `image-rendering: pixelated`. **Todas con los mismos `bounds`**, así que los píxeles se superponen exactamente.
- Se sacan el cálculo de pendiente del navegador (`lib/pendiente.ts`) y el valor ilustrativo de 1,6 %. Sin dato, la capa no se dibuja y la leyenda dice "sin dato" con el motivo.
- NDVI: el mes sale de `capas.ndvi_mensual[mes].mapa`. Si un mes no tiene raster, se usa GIBS MODIS **de la fecha que dice el back** (no un año calculado en el front), y la leyenda lo aclara.
- `Leyenda` usa `escala` y `resumen` de la capa. Tocar un píxel (RF18) lee `valores[fila][columna]` y muestra el valor, la fuente, la fecha y la resolución.
- `CapaClima` sigue como está: el recuadro de la celda de POWER y los valores en la leyenda.
- Hasta que el back entregue los rasters, el front puede seguir con las teselas de Planetary Computer, pero **usando el `item` que manda el back** (`capas.ndvi_mensual[mes].item`), no una búsqueda propia.

## 7. Back 2 (Luca): piezas
| Pieza | Qué hace |
|---|---|
| `satelite/grilla.py` | `Grilla` (bounds ajustados a 1″, ancho, alto, paso) a partir del polígono; `mascara(grilla, poligono)`; regla de 250.000 píxeles → 2″ |
| `satelite/pc.py` | `raster_en_grilla(coleccion, item, grilla, assets=… o expresion=…, resampling=…)` → `numpy` con NaN fuera de datos. Usa `item/bbox/{bbox}/{W}x{H}.npy` con `dst_crs=epsg:4326` (anda para las 4 fuentes, y HLS lo necesita) |
| `satelite/escalas.py` | Las escalas de la tabla 3.3 y el umbral |
| `satelite/raster.py` | `pintar(array, mascara, escala) → png base64` (Pillow, transparente fuera del lote) y `cuantizar(array, mascara, factor=0.01) → (base64, factor, nodata)` |
| `elevacion.py` | El DEM sobre la grilla; pendiente por píxel para la capa; la pendiente general con el mismo plano sobre la misma grilla |
| `ndvi.py` | Por mes, el raster de la escena elegida sobre la grilla; la media del lote desde el raster (en lugar de `item/statistics`); MODIS de respaldo con `nearest` |
| `cobertura.py` | El raster de WorldCover sobre la grilla y el % desde la máscara |
| `capas.py` | Arma los `CapaRaster` (NDVI × 12, pendiente, erosión por píxel, cultivo) y la `grilla` |
| `scripts/precalcular_demo.py` | Regenera `rio_cuarto.json` con los rasters |

**Tiempo:** las 12 escenas en paralelo (~1,5 s cada una) más 3 rasters → dentro del presupuesto de 25 s de `servicio.py`, como hoy.

## 8. Tests
- **Alineación:** todos los rasters de un lote tienen la misma forma y los mismos `bounds` que la `grilla`.
- **Máscara:** un polígono en L deja afuera los píxeles del hueco, y un píxel en el borde se decide por su centro.
- **Coherencia:** la media del raster NDVI dentro de la máscara es igual al `ndvi_medio` del mes; el `resumen.valor_lote` de erosión es igual al valor del lote (pendiente general × media de meses bajos); el % de cultivo es igual a `cobertura_agricola_pct`.
- **PNG:** es transparente fuera de la máscara, y el color de un píxel corresponde a su clase de la escala.
- **Cuantización:** ida y vuelta con un error menor que `factor / 2`.
- **Lote grande:** más de 250.000 píxeles → grilla de 2″ (o más) con nota.
- **Sin red:** fixtures `.npy` chicas de las 4 fuentes (de menos de 10 KB cada una).

## 9. Orden y dueños
| Paso | Qué | Dueño | Depende de | Estado (15/11) |
|---|---|---|---|---|
| 0 | Acordar este plan y qué pasa con #25 (mergear tal cual y reemplazar las capas después, o ajustarlo antes) | Luca + Benja + Front 1 | — | Hecho |
| 1 | Contrato: `CapaRaster`, campos `*_mapa`, `grilla` (sección 5) | Benja | 0 | En `dev` (`contrato.py`: `CapaRaster`, `GrillaLote`, `Capas`) |
| 2 | `grilla.py`, `pc.raster_en_grilla`, `escalas.py`, `raster.py` + tests | Luca | — (con modelos locales hasta el paso 1) | En `dev` |
| 3 | Pendiente y cultivo en la grilla + `capas.py` | Luca | 1, 2 | En `dev` |
| 4 | NDVI × 12 en la grilla, con la media desde el raster | Luca | 2 | En `dev` |
| 5 | Erosión por píxel | Luca | 3, 4 | En `dev` (`capas.erosion_por_pixel`) |
| 6 | Front: `ImageOverlay` con la respuesta, leyenda desde `escala`, RF18 | Front 1 | 1 (con un mock de `CapaRaster` antes) | En `dev` (`lib/capaRaster.ts`, `CapaRasterLote.tsx`) |
| 7 | Regenerar `demo/rio_cuarto.json` con el mapa completo | Luca | 3–5 | En `dev` (#139) |

**Si falta tiempo, se recorta en este orden:** erosión por píxel → cultivo por píxel → `valores` (RF18) → NDVI × 12 (queda el front con las teselas de Planetary Computer **usando el `item` del back**). **Lo mínimo para que todo sea coherente:** la pendiente desde el back (sin el cálculo en el navegador ni el 1,6 %) y el NDVI con la escena del back.

## 10. Decisiones
**Resueltas:** el PR #25 se mergeó y las capas se migraron después (el front ya no calcula la pendiente ni muestra el 1,6 % ilustrativo: `CapaPendiente.tsx`); el contrato aditivo de la sección 5 está en `contrato.py`.

**Abierta:**
- **Persona 3:** la escala de clases de erosión (sección 3.3). Hoy usa los cortes propuestos por Back 2 y la nota de la capa dice "Escala de clases provisoria".
