# Plan del backend · Back 1 + Back 2

Cómo trabajamos los dos del back sin pisarnos. Contexto general: `../CLAUDE.md`. Alcance: `../docs/mvp-alcance.md`.
**Stack:** Python + FastAPI. Monorepo: `backend/` y `frontend/`.
**Meta:** `/analizar` deployado, con datos reales de NASA para cualquier punto y la tabla de 4 columnas armada.

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
│  │  └─ correccion.py          ←         contraste con las mediciones del productor (al lado, no cambia puntajes)
│  ├─ satelite/                 ← Back 2  datos satelitales del lote
│  │  ├─ pc.py                  ←         cliente de Planetary Computer (búsqueda STAC + estadísticas por polígono)
│  │  ├─ lote.py                ←         polígono del lote: validación, área, centro y lote de ejemplo
│  │  ├─ cobertura.py           ←         ESA WorldCover: ¿el punto es un lote agrícola?
│  │  ├─ ndvi.py                ←         NDVI HLS 30 m por mes de la última campaña (MODIS de respaldo) → visto por satélite
│  │  ├─ elevacion.py           ←         pendiente con NASADEM (plano ajustado) + capa de pendiente
│  │  ├─ et.py                  ←         ET real anual de MODIS, para contrastar Hargreaves
│  │  └─ capas.py               ←         capas del mapa: ndvi_mensual[12], erosión
│  ├─ motor/                    ← Lógica  cultivos, reglas, plantillas (ningún back lo toca)
│  └─ demo/
│     └─ rio_cuarto.json        ← Back 2  respuesta completa precalculada
├─ scripts/
│  └─ precalcular_demo.py       ← Back 2  genera el JSON llamando a servicio.analizar()
└─ tests/                       ← cada uno los de su dominio
   ├─ clima/                    ← Back 1
   ├─ satelite/                 ← Back 2
   └─ motor/                    ← Lógica
```

| | Back 1 · núcleo y líder técnico | Back 2 · datos satelitales |
|---|---|---|
| **Dominios** | `api/`, `clima/`, `servicio.py`, `main.py` | `satelite/`, `demo/`, `scripts/precalcular_demo.py` |
| **Además** | Integra `motor/` en `servicio.py`, mock para el front | Deploy en Cloud Run y merges a `dev` |
| **No toca** | `satelite/`, `demo/` | `api/`, `clima/`, `servicio.py`, `main.py`, `motor/` |
| **Le entrega al otro** | `contrato.py` (tipo `Indicador`) y `servicio.analizar()` | Las funciones públicas de `satelite/` |

**Regla entre dominios:** un dominio no importa a otro, salvo `api/contrato.py` (los tipos compartidos). Solo `servicio.py` conecta `clima/`, `satelite/` y `motor/`.

## 2. Qué hace cada uno
Las fuentes están verificadas contra el lote demo (ver "Datos que usamos" en `../CLAUDE.md`). Todas andan sin login.
El alcance que manda es el de **MVP 4.2** (`../docs/mvp-alcance.md`): el lote es un **polígono dibujado** (de 1 a 20.000 ha), el NDVI del lote sale de **HLS a 30 m**, POWER es **un solo pedido mensual con las últimas 30 campañas** y las mediciones del productor **se muestran al lado sin cambiar puntajes**.

### Back 1 · núcleo, clima y predicción estadística
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Esqueleto, contrato Pydantic y mock para el front | `main.py`, `api/` | El front puede trabajar con el mock y `/analizar` responde con la forma del contrato |
| 2 | NASA POWER mensual, últimas 30 campañas | `clima/power.py` | **Un solo pedido** mensual (`PRECTOTCORR_SUM`, `T2M_MIN`, `T2M_MAX`, comunidad `AG`) con las últimas 30 campañas completas de julio a junio (hoy 1995/96 a 2024/25). Descarta la clave `AAAA13` (anual). No mezclar con la climatología precalculada de POWER (otro período, extremos absolutos) |
| 3 | Indicadores climáticos | `clima/indicadores.py` | `clima_mensual` (lluvia, mínima y máxima media, años con helada, años con ≥ 35 °C, por mes); balance hídrico (lluvia − ET0 de Hargreaves); mes de "helada frecuente" si tuvo mínima < 0 °C en ≥ 1 de cada 3 años; terciles seco/normal/húmedo por balance de la campaña (si falta la ET, por lluvia, y se dice); `clima_celda` (bbox de la celda de POWER y posición del lote) |
| 4 | **Probabilidad climatológica** (RF25, Must) | `clima/probabilidad.py` | Por estrategia, frecuencia en las 30 campañas de los eventos de su calendario: helada con cultivo sensible, siembra con menos de la mitad de la lluvia normal, máxima ≥ 35 °C. Devuelve `probabilidades: [{evento, mes, cultivo, anios, de, pct, texto, fuente}]` con texto fijo ("Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)") |
| 5 | **Contraste con mediciones** (RF15) | `clima/correccion.py` | Pluviómetro contra POWER en el mismo período: `contraste_mediciones` con valor del productor, valor NASA, diferencia %, confianza resultante (diferencia > 15 % → "baja") y un `corregido_al_lado` informativo (por ejemplo, el umbral de año seco). **No cambia ningún puntaje.** Sin mediciones, devuelve la lista vacía |
| 6 | Orquestación | `servicio.py` | `analizar()` llama a `clima/`, `satelite/` y `motor/` y arma la `Salida` completa, con "Información que falta". Si el NDVI observado no coincide con la rotación cargada (2 meses o más), lo manda a "Revisar con el agrónomo" (RF14) |
| 7 | Serie por campaña (RF24, Could) | `clima/indicadores.py` | `serie_anual`: lluvia (y balance si existe) de cada una de las 30 campañas, su tercio, el promedio de las últimas 10 contra las 20 previas. Describe, no proyecta |


### Back 2 · datos satelitales del lote
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Cliente de Planetary Computer | `satelite/pc.py` | Búsqueda STAC y `item/statistics` sobre un polígono, con timeout y sin excepciones hacia afuera |
| 2 | Lote y validación agrícola | `satelite/lote.py`, `satelite/cobertura.py` | `lote.py`: recibe el polígono GeoJSON (`[lon, lat]`) que dibujó el usuario o el lote de ejemplo; valida de 1 a 20.000 ha y sin líneas cruzadas; calcula área, centroide y bbox. `cobertura.py`: WorldCover dice qué % del polígono es cultivo (clase 40). Si no es agrícola → "Marcá un lote de campo" |
| 3 | Pendiente | `satelite/elevacion.py` | NASADEM recortado al bbox como array (`item/crop/.npy`), solo con los píxeles dentro del polígono → plano por mínimos cuadrados → pendiente general y máxima (%). AWS Terrain Tiles de respaldo. En el lote demo ≈ 0,6 %. Probar también con un lote grande (20.000 ha) para el tamaño y el tiempo |
| 4 | NDVI · visto por satélite (RF14) | `satelite/ndvi.py` | **HLS 30 m** (`hls2-s30` + `hls2-l30`): por cada mes de la última campaña, la escena con menos nubes (< 30 %) y el NDVI medio del polígono → `visto_por_satelite: {campana, fuente, meses[12]: {fecha, ndvi_medio, nubes_escena} \| null, meses_ndvi_bajo, umbral: 0.3}`. 12 meses en paralelo. **MODIS MOD13Q1 de respaldo** para los meses sin escena limpia (se dice en la fuente) |
| 5 | ET satelital | `satelite/et.py` | ET real anual de MODIS (escala 0,1 → mm/año), para mostrarla al lado del balance de Back 1 |
| 6 | Capas del mapa | `satelite/capas.py` | `ndvi_mensual[12]`: la escena HLS de cada mes (colección, item, fecha), para que el front arme las teselas de Planetary Computer sin repetir la búsqueda. Erosión: pendiente × meses de cobertura baja, con el formato que se acuerde con Front 1 |
| 7 | Demo precalculada | `scripts/precalcular_demo.py`, `demo/rio_cuarto.json` | El JSON sale de `servicio.analizar()` para el lote demo y se regenera después de cada cambio de contrato |
| 8 | Deploy y merges | Cloud Run, `dev` | `/analizar` deployado y respondiendo en menos de 30 s |

### Para acordar entre los dos (y con Lógica / Front)
- **Orden de los meses** en todos los arrays de 12 (`clima_mensual`, `visto_por_satelite.meses`, `capas.ndvi_mensual`, calendario): la campaña es de julio a junio, pero hay que fijar si el índice 0 es julio o enero. Tiene que ser igual en el clima, el NDVI, el motor y el front.
- **Umbral de cobertura baja:** la 4.2 fija NDVI < 0,3 sobre HLS (a validar con la persona 3). Si un mes cae a MODIS de respaldo, el mismo umbral marca menos meses (julio de 2024: MODIS 0,31 contra HLS 0,264): avisarlo en la fuente de ese mes.
- **Formato de las capas** del mapa (erosión y la escena NDVI por mes): lo acuerdan Back 2 y Front 1.
- **Qué confianza lleva cada indicador** (alta / media / baja), según la resolución, los años y el contraste con la medición.
- **Contrato:** la 4.2 propone campos nuevos (`lote.poligono`, `visto_por_satelite.meses`, `clima_celda`, `clima_mensual`, `serie_anual`, `probabilidades`). Back 1 los pasa a `api/contrato.py` y al mock.

**Decidido en la 4.2 (ya no se discute):** las mediciones del productor no cambian puntajes · probabilidad climatológica sí (Must) · sin tendencias ni años análogos · sin modelo de predicción propio · NDVI del lote con HLS · POWER con un solo período de 30 campañas.

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
Áreas del back: `api` y `clima` (Back 1) · `satelite` (Back 2) · `motor` (Lógica).

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
| Mediciones del productor inválidas o con pocos años | No se corrige; se muestra la medición al lado y la confianza baja | Nota con el motivo |
| Internet en la demo | `demo/rio_cuarto.json` servido por la API cuando el lote es el de la demo | Sin cambios |

## 6. Deploy
- El backend va en **GCP Cloud Run**, región `southamerica-east1` (São Paulo). Dueño: Back 2.
- Deploy desde `backend/` con `gcloud run deploy --source .`. Cloud Run construye el contenedor solo.
- Secretos y configuración en variables de entorno de Cloud Run, nunca en el repo.
- CORS abierto al dominio del front.
- Durante la demo: `--min-instances=1`, para que no haya arranque en frío.
- Se deploya desde `main` (lo mergea la persona 3), después de probar en `dev`.
