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
│  │  ├─ power.py               ←         POWER mensual y diario, 1991–2024
│  │  ├─ indicadores.py         ←         balance hídrico (Hargreaves), heladas, calor, lluvia extrema, terciles
│  │  ├─ probabilidad.py        ←         probabilidad climatológica de cada riesgo (frecuencia en 30 años)
│  │  └─ correccion.py          ←         corrección de la serie NASA con las mediciones del productor
│  ├─ satelite/                 ← Back 2  datos satelitales del lote
│  │  ├─ pc.py                  ←         cliente de Planetary Computer (búsqueda STAC + estadísticas por polígono)
│  │  ├─ lote.py                ←         polígono por defecto a partir de lat/lon
│  │  ├─ cobertura.py           ←         ESA WorldCover: ¿el punto es un lote agrícola?
│  │  ├─ ndvi.py                ←         NDVI MODIS (serie) + HLS (lote) → meses de cobertura baja
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

### Back 1 · núcleo, clima y predicción estadística
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Esqueleto, contrato Pydantic y mock para el front | `main.py`, `api/` | El front puede trabajar con el mock y `/analizar` responde con la forma del contrato |
| 2 | NASA POWER mensual y diario, 1991–2024 | `clima/power.py` | Series por mes y por día del punto. Descarta la clave `AAAA13` (total anual) y pasa la lluvia de mm/día a mm/mes |
| 3 | Indicadores climáticos | `clima/indicadores.py` | Balance hídrico mensual (lluvia − ET0 de Hargreaves), fecha de última y primera helada, días > 35 °C, días con lluvia > 50 mm, terciles seco/normal/húmedo por balance de la campaña |
| 4 | **Probabilidad climatológica** | `clima/probabilidad.py` | Para cada riesgo y mes: cantidad de años en que ocurrió sobre el total, y su porcentaje ("balance de julio negativo en 22 de 30 años → 73 %"). Cubre helada, calor > 35 °C, déficit de agua y lluvia extrema |
| 5 | **Corrección con mediciones** | `clima/correccion.py` | Con la lluvia del pluviómetro y sus años de registro: factor = medición / POWER en el mismo período. Devuelve el valor NASA, la medición, el factor, el valor corregido y la confianza resultante. Sin mediciones, devuelve la serie tal cual |
| 6 | Orquestación | `servicio.py` | `analizar()` llama a `clima/`, `satelite/` y `motor/` y arma la `Salida` completa, con "Información que falta" |


### Back 2 · datos satelitales del lote
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | Cliente de Planetary Computer | `satelite/pc.py` | Búsqueda STAC y `item/statistics` sobre un polígono, con timeout y sin excepciones hacia afuera |
| 2 | Lote y validación agrícola | `satelite/lote.py`, `satelite/cobertura.py` | Rectángulo de ~95 ha alrededor del punto; WorldCover dice si el punto es cultivo (clase 40) y el % del lote que lo es. Si no es agrícola → "Marcá un lote de campo" |
| 3 | Pendiente | `satelite/elevacion.py` | NASADEM recortado como array (`item/crop/.npy`) → plano por mínimos cuadrados → pendiente general y máxima (%). AWS Terrain Tiles de respaldo. En el lote demo ≈ 0,6 % |
| 4 | NDVI | `satelite/ndvi.py` | MODIS MOD13Q1: NDVI medio del lote por mes en los últimos 10 años → meses de cobertura baja y "en N de 10 años". HLS: NDVI del lote en la última campaña, a 30 m. Filtra nubes con la banda de confiabilidad |
| 5 | ET satelital | `satelite/et.py` | ET real anual de MODIS (escala 0,1 → mm/año), para mostrarla al lado del balance de Back 1 |
| 6 | Capas del mapa | `satelite/capas.py` | `ndvi_mensual[12]` y erosión (pendiente × meses de cobertura baja), con el formato que se acuerde con Front 1 |
| 7 | Demo precalculada | `scripts/precalcular_demo.py`, `demo/rio_cuarto.json` | El JSON sale de `servicio.analizar()` para el lote demo y se regenera después de cada cambio de contrato |
| 8 | Deploy y merges | Cloud Run, `dev` | `/analizar` deployado y respondiendo en menos de 30 s |

### Para acordar entre los dos (y con Lógica / Front)
- **Orden de los meses** en todos los arrays de 12: campaña julio → junio o enero → diciembre. Tiene que ser el mismo en el clima, el NDVI, el motor y el front.
- **Umbral de cobertura baja por fuente:** MODIS a 250 m mezcla el lote con los vecinos (julio de 2024: MODIS 0,31 contra HLS 0,264). Lo define Lógica.
- **Si la corrección cambia los puntajes** o solo se muestra al lado: lo define la persona 3 (hoy `docs/mvp-alcance.md` dice que no cambia ninguno).
- **Formato de las capas** del mapa: lo acuerdan Back 2 y Front 1.
- **Qué confianza lleva cada indicador** (alta / media / baja), según la resolución, los años y el contraste con la medición.

## 3. Interfaz entre Back 1 y Back 2
Back 2 expone funciones en `satelite/`; **Back 1 las llama desde `servicio.py`**. Back 2 nunca edita `servicio.py`.

**Reglas de la interfaz:**
- `Indicador` = `{valor, unidad, fuente, anios, resolucion, confianza}` y lo define Back 1 en `api/contrato.py`. Hasta que exista, Back 2 devuelve un `dict` con esas mismas claves.
- **Nunca lanzan excepción hacia afuera.** Si falla una fuente: `valor: None`, `confianza: "sin_dato"` y un `motivo` en texto. Back 1 lo manda a "Información que falta".
- Cada llamada externa tiene un timeout, para que `/analizar` responda en menos de 30 s (RNF7).
- Las funciones son puras respecto del input (lat/lon → resultado): se prueban sueltas, sin levantar FastAPI.
- Cada módulo se puede correr solo desde `backend/`: `python -m app.satelite.elevacion -33.2476 -64.2325` imprime el resultado del lote demo.

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
| MODIS en Planetary Computer, o 10 años tardan demasiado | Menos años, o HLS solo para la última campaña | La serie dice cuántos años cubre |
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
