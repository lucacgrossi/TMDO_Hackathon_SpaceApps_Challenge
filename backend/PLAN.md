# Plan del backend · Back 1 + Back 2

Cómo trabajamos los dos del back sin pisarnos. Contexto general: `../CLAUDE.md`. Alcance: `../docs/mvp-alcance.md`.
**Stack:** Python + FastAPI. Monorepo: `backend/` y `frontend/`.
**Meta:** `/analizar` deployado, con datos reales de NASA para cualquier punto y la tabla de 4 columnas armada.
**Alcance que manda:** MVP **4.3** (`../docs/mvp-alcance.md`).
**Planilla CSV del productor** (aprobada por la persona 3): dominio `mediciones/` (Back 2) y ruta `POST /mediciones/planilla` (Back 1). Ver `../docs/plan-planilla-lluvia.md`.
**Capas armonizadas:** grilla común del lote; el back calcula los rasters y el front los dibuja. Ver `../docs/plan-armonizacion-capas.md`.

## 1. Estructura por dominio y dueños
Cada dominio es una carpeta con **un solo dueño**. Para tocar un dominio ajeno: avisar antes y que lo cambie el dueño, o hacer un PR chico que el dueño revise.

```
backend/
├─ PLAN.md                      ← los dos (cambios acordados)
├─ requirements.txt             ← Back 1 (Back 2 agrega líneas en su PR y avisa)
├─ app/
│  ├─ main.py                   ← Back 1  FastAPI, CORS, monta las rutas
│  ├─ api/                      ← Back 1  rutas (/analizar) y contrato
│  │  ├─ rutas.py
│  │  └─ contrato.py            ←         modelos Pydantic (Entrada, Salida, Indicador)
│  ├─ servicio.py               ← Back 1  analizar(entrada) -> salida: orquesta los dominios, sin FastAPI
│  ├─ clima/                    ← Back 1  NASA POWER e indicadores climáticos
│  │  ├─ power.py               ←         POWER mensual: un solo pedido, últimas 30 campañas (jul–jun)
│  │  ├─ indicadores.py         ←         balance hídrico (Hargreaves), heladas, calor, terciles, serie por campaña
│  │  ├─ probabilidad.py        ←         probabilidad climatológica por estrategia (frecuencia en 30 campañas)
│  │  └─ correccion.py          ←         contraste con las mediciones del productor, al lado de NASA (no puntúa)
│  ├─ satelite/                 ← Back 2  datos satelitales del lote
│  │  ├─ pc.py                  ←         cliente de Planetary Computer (búsqueda STAC, estadísticas, recortes)
│  │  ├─ red.py                 ←         cliente HTTP con los certificados del sistema + certifi
│  │  ├─ lote.py                ←         polígono del lote: validación, área, centro y lote de ejemplo
│  │  ├─ cobertura.py           ←         ESA WorldCover: ¿el punto es un lote agrícola?
│  │  ├─ ndvi.py                ←         NDVI HLS 30 m por mes de la campaña (MODIS de respaldo) → visto por satélite
│  │  ├─ elevacion.py           ←         pendiente con NASADEM (plano ajustado)
│  │  ├─ terrario.py            ←         respaldo de la pendiente con AWS Terrain Tiles
│  │  ├─ et.py                  ←         ET real anual de MODIS, para contrastar Hargreaves
│  │  └─ capas.py               ←         capas del mapa: ndvi_mensual[12], erosión
│  ├─ mediciones/               ← Back 2  planilla CSV del productor
│  │  └─ planilla.py            ←         lee y valida el CSV → serie mensual (PR #55)
│  ├─ motor/                    ← Lógica  cultivos, estrategias, mezcla, reglas, plantillas (ningún back lo toca)
│  └─ demo/
│     └─ rio_cuarto.json        ← Back 2  respuesta completa precalculada
├─ scripts/
│  └─ precalcular_demo.py       ← Back 2  genera el JSON llamando a servicio.analizar()
└─ tests/                       ← cada uno los de su dominio
   ├─ api/                      ← Back 1
   ├─ clima/                    ← Back 1
   ├─ satelite/                 ← Back 2
   ├─ mediciones/               ← Back 2
   └─ motor/                    ← Lógica
```

| | Back 1 · núcleo y líder técnico | Back 2 · datos satelitales |
|---|---|---|
| **Dominios** | `api/`, `clima/`, `servicio.py`, `main.py` | `satelite/`, `mediciones/`, `demo/`, `scripts/precalcular_demo.py` |
| **Además** | Integra `motor/` en `servicio.py`, mocks para el front | Deploy en Cloud Run y merges a `dev` |
| **No toca** | `satelite/`, `mediciones/`, `demo/` | `api/`, `clima/`, `servicio.py`, `main.py`, `motor/` |
| **Le entrega al otro** | `contrato.py` (tipos compartidos) y `servicio.analizar()` | Las funciones públicas de `satelite/` y `mediciones/` |

**Regla entre dominios:** un dominio no importa a otro, salvo `api/contrato.py` (los tipos compartidos). Solo `servicio.py` y `api/` conectan `clima/`, `satelite/`, `mediciones/` y `motor/`. Lo controla la CI (`.github/scripts/fronteras_dominios.py`).

## 2. Qué hace cada uno
Las fuentes están verificadas contra el lote demo (ver "Datos que usamos" en `../CLAUDE.md`). Todas andan sin login.
El alcance que manda es el de **MVP 4.3** (`../docs/mvp-alcance.md`):
- el lote es un **polígono dibujado** (de 1 a 20.000 ha);
- el NDVI del lote sale de **HLS a 30 m**;
- POWER es **un solo pedido mensual con las últimas 30 campañas** (hoy 1996/97 a 2025/26);
- las mediciones del productor se muestran **al lado** de NASA (`clima/correccion.py`, no puntúa) y **además entran en los puntajes** mezcladas con NASA según sus años de registro (`motor/mezcla.py`).

**Estado (14/11, a la noche):** todas las tareas de abajo están en `dev`, salvo las que dicen otra cosa.

### Back 1 · núcleo, clima y predicción estadística
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Esqueleto, contrato Pydantic y mock para el front | `main.py`, `api/` | El front puede trabajar con el mock y `/analizar` responde con la forma del contrato |
| 2 | NASA POWER mensual, últimas 30 campañas | `clima/power.py` | **Un solo pedido** mensual (`PRECTOTCORR_SUM`, `T2M`, `T2M_MIN`, `T2M_MAX`, `T2M_RANGE`, comunidad `AG`) hasta el año en curso, con las últimas 30 campañas completas de julio a junio (hoy 1996/97 a 2025/26). La última campaña de POWER es la campaña de toda la salida: `servicio.py` se la pasa a `ndvi.calcular` y a la erosión. Descarta la clave `AAAA13` (anual) y los meses −999. `T2M_MIN`/`T2M_MAX` mensuales son extremos del mes (heladas, días ≥ 35 °C); `T2M` y `T2M_RANGE` son medias (Hargreaves). No mezclar con la climatología precalculada de POWER (otro período, extremos absolutos) |
| 3 | Indicadores climáticos | `clima/indicadores.py` | `clima_mensual` (lluvia, mínima y máxima media, años con helada, años con ≥ 35 °C, por mes); balance hídrico (lluvia − ET0 de Hargreaves); mes de "helada frecuente" si tuvo mínima < 0 °C en ≥ 1 de cada 3 años; terciles seco/normal/húmedo por balance de la campaña (si falta la ET, por lluvia, y se dice); `clima_celda` (bbox de la celda de POWER y posición del lote) |
| 4 | **Probabilidad climatológica** (RF25, Must) | `clima/probabilidad.py` | Por estrategia, frecuencia en las 30 campañas de los eventos de su calendario: helada con cultivo sensible, siembra con menos de la mitad de la lluvia normal, máxima ≥ 35 °C. Devuelve `probabilidades: [{evento, mes, cultivo, anios, de, pct, texto, fuente}]` con texto fijo ("Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)") |
| 5 | **Contraste con mediciones** (RF15) | `clima/correccion.py` | Pluviómetro contra POWER: `contraste_mediciones` con valor del productor, valor NASA, diferencia %, confianza resultante (diferencia > 15 % → "baja") y un `corregido_al_lado` informativo. Con planilla: en las **mismas campañas** (`campanas_comparadas`, `detalle_campanas`), y heladas y calor por mes contra NASA (1 de cada 3 campañas en común de diferencia, mínimo 1 → confianza baja en `meses_helada_frecuente`). Alcanza 1 año de registro (`MIN_ANIOS_REGISTRO = 1`). **El contraste no puntúa**; la mezcla en los puntajes la hace el motor. Sin mediciones, devuelve la lista vacía |
| 6 | Orquestación | `servicio.py` | `analizar()` llama a `clima/`, `satelite/` y `motor/` y arma la `Salida` completa, con "Información que falta". Le pasa al motor las mediciones (`lluvia_anual_mm`, `anios_registro`, `serie_mensual`; no la materia orgánica). Si el NDVI observado no coincide con la rotación cargada (2 meses o más), lo manda a "Revisar con el agrónomo" (RF14) |
| 7 | Serie por campaña (RF24, Could) | `clima/indicadores.py` | `serie_anual`: lluvia (y balance si existe) de cada una de las 30 campañas, su tercio, el promedio de las últimas 10 contra las 20 previas. Describe, no proyecta |
| 8 | Ruta de la planilla (RF26) | `api/rutas.py` | `POST /mediciones/planilla` (multipart, hasta 1 MB) → `ResultadoPlanilla`; 200, 422 o 413. Usa `mediciones.planilla.leer_planilla` cuando llega el parser (PR #55) |
| 9 | **Pendiente:** prioridades de 1 a 5 | `api/contrato.py` | `Prioridades` con `ge=1` (hoy acepta 0; el motor ya lleva un 0 a 1) |


### Back 2 · datos satelitales del lote
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Cliente de Planetary Computer | `satelite/pc.py` | Búsqueda STAC y `item/statistics` sobre un polígono, con timeout y sin excepciones hacia afuera |
| 2 | Lote y validación agrícola | `satelite/lote.py`, `satelite/cobertura.py` | `lote.py`: recibe el polígono GeoJSON (`[lon, lat]`) que dibujó el usuario o el lote de ejemplo; valida de 1 a 20.000 ha y sin líneas cruzadas; calcula área, centroide y bbox. `cobertura.py`: WorldCover dice qué % del polígono es cultivo (clase 40). Si no es agrícola → "Marcá un lote de campo" |
| 3 | Pendiente | `satelite/elevacion.py` | NASADEM recortado al bbox como array (`item/crop/.npy`), solo con los píxeles dentro del polígono → plano por mínimos cuadrados → pendiente general y máxima (%). AWS Terrain Tiles de respaldo. En el lote demo ≈ 0,6 %. Probar también con un lote grande (20.000 ha) para el tamaño y el tiempo |
| 4 | NDVI · visto por satélite (RF14) | `satelite/ndvi.py` | **HLS 30 m** (`hls2-s30` + `hls2-l30`): por cada mes de la última campaña, la escena con menos nubes (< 30 %) y el NDVI medio del polígono → `visto_por_satelite: {campana, fuente, meses[12]: {fecha, ndvi_medio, nubes_escena} \| null, meses_ndvi_bajo, umbral: 0.3}`. 12 meses en paralelo. **MODIS MOD13Q1 de respaldo** para los meses sin escena limpia (se dice en la fuente) |
| 5 | ET satelital | `satelite/et.py` | ET real anual de MODIS (escala 0,1 → mm/año), para mostrarla al lado del balance de Back 1 |
| 6 | Capas del mapa | `satelite/capas.py` | `ndvi_mensual[12]`: la escena HLS de cada mes (colección, item, fecha), para que el front arme las teselas de Planetary Computer sin repetir la búsqueda. Erosión: pendiente × meses de cobertura baja (valor del lote) |
| 7 | Demo precalculada | `scripts/precalcular_demo.py`, `demo/rio_cuarto.json` | El JSON sale de `servicio.analizar()` para el lote demo, con los puntajes del motor. Se regenera después de cada cambio de contrato o del motor, y antes del congelamiento |
| 8 | Deploy y merges | Cloud Run, `dev` | `/analizar` deployado y respondiendo en menos de 30 s (`DEPLOY.md`) |
| 9 | Parser de la planilla (RF26) | `mediciones/planilla.py` | **En PR #55.** `leer_planilla(bytes)` → `ResultadoPlanilla`: codificación, separador y decimal detectados, diario o mensual, lluvia y temperaturas, campañas julio–junio, avisos y errores por fila |
| 10 | Capas armonizadas | `satelite/grilla.py`, `raster.py`, `escalas.py` y los módulos de capas | **Planificado** (`../docs/plan-armonizacion-capas.md`): grilla común de 1″, rasters con PNG y valores por píxel, números del lote como resumen de su capa |

### Decidido (ya no se discute)
- **Orden de los meses:** índice 0 = enero en todos los arrays de 12 (back y front). La campaña es julio–junio.
- **Campaña de la salida:** la última completa de POWER (hoy 2025/26), también para el NDVI, la erosión y las capas.
- **Umbral de cobertura baja:** NDVI < 0,3 sobre HLS. Si un mes cae a MODIS de respaldo, la fuente del mes lo dice (MODIS mezcla el lote con los vecinos).
- **Mediciones del productor (MVP 4.3):** se muestran al lado (`correccion.py`, no puntúa) **y** se mezclan en los puntajes del motor según los años de registro. Las probabilidades salen solo de NASA. La materia orgánica no puntúa.
- **Prioridades de 1 a 5**, que pesan al cuadrado en la cercanía (el front repite la cuenta en `cercania.ts`).
- Probabilidad climatológica sí (Must) · sin tendencias ni años análogos · sin modelo de predicción entrenado · NDVI del lote con HLS · POWER con un solo período de 30 campañas.

### Abierto
- **Formato de las capas armonizadas** (`CapaRaster`): propuesto en `../docs/plan-armonizacion-capas.md`; lo acuerdan Back 1 (contrato), Back 2 y Front 1 (PR #25).
- **Qué confianza lleva cada indicador** (alta / media / baja), según la resolución, los años y el contraste con la medición.

## 3. Interfaz entre Back 1 y Back 2
Back 2 expone funciones en `satelite/`; **Back 1 las llama desde `servicio.py`**. Back 2 nunca edita `servicio.py`.

**Reglas de la interfaz:**
- `Indicador` = `{valor, unidad, fuente, anios, resolucion, confianza}` y lo define Back 1 en `api/contrato.py`. Hasta que exista, Back 2 devuelve un `dict` con esas mismas claves.
- **Nunca lanzan excepción hacia afuera.** Si falla una fuente: `valor: None`, `confianza: "sin_dato"` y un `motivo` en texto. Back 1 lo manda a "Información que falta".
- Cada llamada externa tiene un timeout, para que `/analizar` responda en menos de 30 s (RNF7).
- **Las funciones reciben el polígono del lote** (GeoJSON Polygon en `[lon, lat]`, el de `entrada.lote.poligono`), no lat/lon sueltos. `lat`/`lon` (el centroide) solo se usan para lo que es por punto (POWER, WorldCover del centro).
- Las funciones son puras respecto del input (polígono → resultado): se prueban sueltas, sin levantar FastAPI.
- Cada módulo se puede correr solo desde `backend/`: `py -m app.satelite.elevacion` sin argumentos usa el lote de ejemplo e imprime el resultado.

**Interfaz Back 1 → Back 2:** `servicio.analizar(entrada: Entrada) -> Salida`. La usan `/analizar` y `scripts/precalcular_demo.py`. Así el JSON de la demo sale del mismo código que la API, no a mano.

## 4. Formato de trabajo
**Branches:** salen de `dev` y vuelven a `dev` por PR. Formato: `<nombre>/<tipo>/<area>-<descripcion-corta>`.
Áreas del back: `api` y `clima` (Back 1) · `satelite` y `mediciones` (Back 2) · `motor` (Lógica).

**Commits:** `<tipo>(<area>): <qué hace, en presente>`.

**Merges:** Back 2 mergea a `dev` seguido; **solo la persona 3 mergea `dev` → `main`**, después de probar.

**PRs:** chicos (un módulo o una función) y con descripción de 3 líneas: qué agrega, cómo se probó (comando y resultado en el lote demo) y si toca algo ajeno.

**Un PR está listo cuando:**
- Corre solo contra el lote demo y da un valor razonable (pendiente ≈ 0,6 %; NDVI bajo en julio).
- Cada valor lleva fuente, años, resolución y confianza.
- Si la fuente falla, devuelve `None` + motivo sin romper nada.
- No tiene keys ni datos pesados commiteados.
- No toca dominios ajenos (o lo avisó).

**Cambios de contrato:** solo Back 1 edita `api/contrato.py`. Si Back 2 necesita un campo nuevo, se lo pide por el canal del equipo con: campo, tipo, para qué. Back 1 actualiza `contrato.py` **y el mock en el mismo commit**, y avisa a los dos front. Después de cada cambio de contrato, Back 2 regenera `demo/rio_cuarto.json`.

## 5. Planes B
| Si falla | Plan B | Qué ve el usuario |
|---|---|---|
| HLS sin escena limpia en un mes | MODIS MOD13Q1 (250 m) para ese mes | La fuente del mes dice "MODIS 250 m" |
| Planetary Computer entero | ORNL MODIS subsets para el NDVI; AWS Terrain Tiles para la pendiente | Igual, con otra fuente |
| Todo el NDVI numérico | GIBS solo como capa visual; meses de cobertura baja desde el calendario | "Información que falta: NDVI numérico" |
| Pendiente (NASADEM y AWS) | Pendiente fija del lote demo (0,6 %) con `confianza: "baja"` | Nota en "Información que falta" |
| NASA POWER | Sin plan B en vivo: es la base. Para la demo, el JSON precalculado | Sin cambios en la demo |
| Planilla inválida | `ResultadoPlanilla` con los errores por fila; se puede seguir con la carga a mano | La lista de errores y la opción manual |
| Sin mediciones del productor | Todo sale solo de NASA | Sin cambios |
| Internet en la demo | `demo/rio_cuarto.json` servido por la API cuando el lote es el de la demo | Sin cambios |

## 6. Deploy
- El backend va en **GCP Cloud Run**, región `southamerica-east1` (São Paulo). Dueño: Back 2. Guía paso a paso: `DEPLOY.md`.
- Deploy desde `backend/` con `gcloud run deploy --source .`. Cloud Run construye el contenedor solo, con Python 3.13 (`.python-version`; la CI corre en 3.12). La cuenta de servicio del build necesita `roles/run.builder` una vez.
- Secretos y configuración en variables de entorno de Cloud Run, nunca en el repo.
- CORS abierto al dominio del front.
- Durante la demo: `--min-instances=1`, para que no haya arranque en frío.
- Se deploya desde `main` (lo mergea la persona 3), después de probar en `dev`.
