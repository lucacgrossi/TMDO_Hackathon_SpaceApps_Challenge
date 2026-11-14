# Plan del backend · Back 1 + Back 2

Cómo trabajamos los dos del back sin pisarnos. Contexto general: `../CLAUDE.md`. Alcance: `../docs/mvp-alcance.md`.
**Stack:** Python + FastAPI. Monorepo: `backend/` y `frontend/`.
**Meta:** `/analizar` deployado, con datos reales de NASA para cualquier punto y la tabla de 4 columnas armada.
**Alcance que manda:** MVP **4.3** (`../docs/mvp-alcance.md`).
**Planilla CSV del productor** (aprobada por la persona 3): dominio `mediciones/` (Back 2) y ruta `POST /mediciones/planilla` (Back 1). Ver `../docs/plan-planilla-lluvia.md`.
**Capas armonizadas:** grilla común del lote; el back calcula los rasters (`CapaRaster`) y el front los dibuja. Ver `../docs/plan-armonizacion-capas.md`. **En curso.**

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
│  │  └─ planilla.py            ←         lee y valida el CSV → serie mensual
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

## 2. Qué falta
Lo que ya está en `dev` (clima, probabilidades, contraste, servicio, motor, satélite, planilla y demo) no se repite acá: el detalle de cada módulo está en su docstring y en `../docs/`. El alcance que manda es el **MVP 4.3** (`../docs/mvp-alcance.md`).

### Back 1 (Benja)
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | **`CapaRaster` en el contrato** (paso 1 de `../docs/plan-armonizacion-capas.md`) | `api/contrato.py` + mock | Ver el detalle abajo. Destraba al front (Tobias ya tiene `lib/capaRaster.ts` y `CapaRasterLote.tsx` en #25) y a Back 2, que arma las capas |
| 2 | **Conectar las capas nuevas** en la salida | `servicio.py` | `salida.capas.pendiente_mapa`, `cultivo_mapa` y `grilla` salen de `satelite/capas.py` (PR de Back 2 en curso: `luca/feat/satelite-grilla`). Si una capa falla, va a `capas.no_disponibles` con el motivo, sin romper `/analizar` |
| 3 | Regenerar el mock después del cambio de contrato | `api/mock.py`, `mock_rio_cuarto.json` | El mock trae `CapaRaster` de ejemplo para que el front pruebe |

**Detalle de `CapaRaster` para Benja** (sección 5 del plan de armonización; **todo aditivo y opcional**, sin romper lo que hay):
```python
class EscalaCapa(BaseModel):
    cortes: list[float]
    colores: list[str]          # hex, uno por clase
    etiquetas: list[str]

class ResumenCapa(BaseModel):
    media: float | None
    min: float | None
    max: float | None
    pixeles: int                # píxeles dentro del lote con dato

class CapaRaster(BaseModel):
    id: str                     # "pendiente" | "cultivo" | "ndvi" | "erosion"
    titulo: str
    unidad: str
    fuente: str
    fecha: str | None = None    # escena (NDVI) o "estática"
    campana: str | None = None
    resolucion_nativa: str      # "30 m", "250 m (MODIS, respaldo)", …
    resolucion_grilla: str      # "1″ (~30 m)"
    bounds: list[list[float]]   # [[sur, oeste], [norte, este]], iguales para todas las capas
    ancho: int
    alto: int
    png: str                    # base64; transparente fuera del lote
    valores: str | None = None  # base64 de int16 little-endian (<i2), por filas, fila 0 = norte, columna 0 = oeste
    factor: float = 1.0         # valor real = entero × factor
    nodata: int = -32768
    escala: EscalaCapa
    resumen: ResumenCapa
    confianza: Literal["alta", "media", "baja", "sin_dato"]
    nota: str | None = None

class GrillaLote(BaseModel):
    bounds: list[list[float]]
    ancho: int
    alto: int
    paso: float                 # grados (1/3600 o 2/3600)
```
En `Capas` se agregan: `pendiente_mapa: CapaRaster | None = None`, `cultivo_mapa: CapaRaster | None = None`, `erosion_mapa: CapaRaster | None = None`, `grilla: GrillaLote | None = None`. En `CapaNdviMes`: `mapa: CapaRaster | None = None` (paso 4, más adelante). Los campos que ya existen no cambian. El front copia estos tipos a `src/lib/contrato.ts`.

### Back 2 (Luca)
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | **Armonización, pasos 2 y 3** (en curso, sesión `armonizacion-capas`) | `satelite/grilla.py`, `raster.py`, `escalas.py`, `pc.raster_en_grilla`, `elevacion.py`, `cobertura.py`, `capas.py` | Grilla común de 1″ con máscara; pendiente y cultivo como `CapaRaster`; la pendiente general (≈ 0,6 % en el lote de ejemplo) y el % de cultivo salen como resumen de sus capas. PR a `dev` |
| 2 | Armonización, paso 4 (si hay tiempo) | `ndvi.py`, `capas.py` | El raster de cada mes sobre la grilla y la media del lote desde el raster (`CapaNdviMes.mapa`) |
| 3 | Armonización, paso 5 (si hay tiempo) | `capas.py` | Erosión por píxel = pendiente × meses bajos del píxel (`erosion_mapa`) |
| 4 | **Regenerar la demo** | `scripts/precalcular_demo.py` → `demo/rio_cuarto.json` | Después del #57 (prioridades de 1 a 5), después de cada paso de la armonización y **antes del congelamiento** (domingo 12:00) |
| 5 | **Deploy estable** | Cloud Run (`DEPLOY.md`) | Cuando la persona 3 mergee `dev` → `main`: deploy, prueba de `/salud` y `/analizar` con el lote de ejemplo, URL al front, `--min-instances=1` para la demo |
| 6 | Mergear a `dev` | GitHub | Revisar la descripción de cada PR (sobre todo los de Benja) antes de mergear |

### Front (para coordinar, no es del back)
- **Tobias (#12):** barritas de **1 a 5**; hoy `min={0}` da 422 en `/analizar`.
- **Tobias (#18):** campo de años de registro y la planilla CSV (`POST /mediciones/planilla`).
- **Tobias (#25, en la auditoría):** NDVI con la escena del back (`capas.ndvi_mensual[mes]`) y la leyenda de clima con `clima_mensual` (hoy muestra valores ilustrativos).
- **Front 2:** `cercania.ts` con las prioridades al cuadrado (`Σ p²·v / Σ p²`), igual que el motor.

### Decidido (ya no se discute)
- **Orden de los meses:** índice 0 = enero en todos los arrays de 12 (back y front). La campaña es julio–junio.
- **Campaña de la salida:** la última completa de POWER (hoy 2025/26), también para el NDVI, la erosión y las capas.
- **Umbral de cobertura baja:** NDVI < 0,3 sobre HLS. Si un mes cae a MODIS de respaldo, la fuente del mes lo dice.
- **Mediciones del productor (MVP 4.3):** al lado (`correccion.py`, no puntúa) **y** mezcladas en los puntajes del motor según los años de registro. Las probabilidades salen solo de NASA. La materia orgánica no puntúa.
- **Prioridades de 1 a 5**, al cuadrado en la cercanía (#57).
- **Capas:** el back calcula y el front dibuja, con `CapaRaster` (`valores` en int16 little-endian, fila 0 = norte; confirmado con el front en #25).

### Abierto
- **Qué confianza lleva cada indicador** (alta / media / baja), según la resolución, los años y el contraste con la medición.
- **Escala de clases de la erosión** (persona 3).

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
