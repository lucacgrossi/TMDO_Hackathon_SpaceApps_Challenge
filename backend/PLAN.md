# Plan del backend · Back 1 + Back 2

Cómo trabajamos los dos del back sin pisarnos. Contexto general: `../CLAUDE.md`. Alcance: `../docs/mvp-alcance.md`.
**Stack:** Python + FastAPI. Monorepo: `backend/` y `frontend/`.
**Meta:** `/analizar` deployado, con datos reales de NASA para cualquier punto y la tabla de 4 columnas armada.
**Alcance que manda:** MVP **4.5** (`../docs/mvp-alcance.md`).
**Planilla CSV del productor** (aprobada por la persona 3): dominio `mediciones/` (Back 2) y ruta `POST /mediciones/planilla` (Back 1). Ver `../docs/plan-planilla-lluvia.md`.
**Capas armonizadas:** grilla común del lote; el back calcula los rasters (`CapaRaster`) y el front los dibuja. Ver `../docs/plan-armonizacion-capas.md`. **Implementada (15/11)**; queda abierta la escala de clases de erosión.

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
│  │  ├─ contrato.py            ←         modelos Pydantic (Entrada, Salida, Indicador, CapaRaster)
│  │  └─ mock.py                ←         mock fijo para el front (mock_rio_cuarto.json, mock_planilla.json)
│  ├─ servicio.py               ← Back 1  analizar(entrada) -> salida: orquesta los dominios, sin FastAPI
│  ├─ clima/                    ← Back 1  NASA POWER e indicadores climáticos
│  │  ├─ power.py               ←         POWER mensual: un solo pedido, últimas 30 campañas (jul–jun)
│  │  ├─ indicadores.py         ←         balance hídrico (Hargreaves), heladas, calor, terciles
│  │  ├─ serie.py               ←         serie por campaña (RF24) con sus 12 meses
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
│  │  ├─ grilla.py              ←         grilla común del lote (1″) y máscara
│  │  ├─ raster.py              ←         PNG, cuantización y resumen de cada CapaRaster
│  │  ├─ escalas.py             ←         escalas de color de las capas y umbral NDVI 0,3
│  │  └─ capas.py               ←         capas del mapa: ndvi_mensual[12], erosión y capas raster
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

## 2. Estado (15/11)
Todo lo del back está en `dev`: clima, probabilidades, contraste, servicio, motor, satélite (con las capas armonizadas), planilla y demo. El detalle de cada módulo está en su docstring y en `../docs/`. El alcance que manda es el **MVP 4.5** (`../docs/mvp-alcance.md`).

- **Back 1 (Benja):** `CapaRaster`, `GrillaLote` y los campos `*_mapa` en `api/contrato.py`; `servicio.py` arma las capas y manda las que fallan a `capas.no_disponibles`; el mock (`api/mock_rio_cuarto.json`) trae capas raster de ejemplo. El contrato vigente es el código: `api/contrato.py`.
- **Back 2 (Luca):** armonización completa (pasos 2 a 5 de `../docs/plan-armonizacion-capas.md`: grilla, pendiente, cultivo, NDVI × 12 y erosión por píxel) y demo regenerada con el motor nuevo (#139).

### Back 2 (Luca), lo que sigue
| # | Tarea | Archivo | Hecho cuando |
|---|---|---|---|
| 1 | **Regenerar la demo** | `scripts/precalcular_demo.py` → `demo/rio_cuarto.json` | Después de cada cambio de contrato o del motor y **antes del congelamiento** (domingo 15/11, 18:00) |
| 2 | **Deploy** | Cloud Run (`DEPLOY.md`) | Sale solo en cada push a `main` (`.github/workflows/deploy.yml`). Para la demo: `--min-instances=1` (`DEPLOY.md`, paso 6) y prueba de `/salud` y `/analizar` (paso 5) |
| 3 | Mergear a `dev` | GitHub | Revisar la descripción de cada PR (sobre todo los de Benja) antes de mergear |

### Front (para coordinar, no es del back)
Lo que el back le había pedido al front ya está en `dev`: barritas de 1 a 5 (#12), la planilla CSV sin carga a mano (#18, #121), NDVI con la escena del back y capas raster (#25 y la armonización), y `cercania.ts` con las prioridades al cuadrado (`Σ p²·v / Σ p²`), igual que el motor.

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
- `Indicador` = `{valor, unidad, fuente, anios, resolucion, confianza}` y lo define Back 1 en `api/contrato.py` (`class Indicador`). Como `satelite/` no importa del contrato, Back 2 devuelve un `dict` con esas mismas claves y `servicio.py` lo convierte.
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
| Planetary Computer entero | AWS Terrain Tiles para la pendiente (`terrario.py`). Para el NDVI no hay respaldo fuera de PC (ORNL MODIS subsets quedó sin implementar) | La pendiente con otra fuente; el NDVI, como la fila siguiente |
| Todo el NDVI numérico | "Visto por satélite" sin dato; el mapa cae a GIBS MODIS como capa visual. Los meses pelados de cada columna salen siempre del calendario (el NDVI no puntúa) | Los meses sin NDVI en "Información que falta" |
| Pendiente (NASADEM y AWS) | La pendiente del lote va sin dato; el motor puntúa con 1,6 % por defecto (`reglas.PENDIENTE_DEFECTO`, la del prototipo) | "Pendiente del lote: se usó 1,6 % por defecto" en "Información que falta" |
| Planilla inválida | `ResultadoPlanilla` con los errores por fila; la planilla anterior (si había) se conserva y se puede seguir sin mediciones | La lista de errores (no hay carga a mano) |
| Sin mediciones del productor | Todo sale solo de NASA | Sin cambios |
| NASA POWER | Sin plan B en vivo: es la base. `demo/rio_cuarto.json` servido por la API si el pedido llega con `lote.tipo = "ejemplo"` (la app siempre manda `"dibujado"`, así que desde la web se ve el error 503) | Desde la app: "El sistema de NASA (NASA POWER) no responde" y "Probar de nuevo" |

## 6. Deploy
- El backend va en **GCP Cloud Run**, región `southamerica-east1` (São Paulo). Dueño: Back 2. Guía paso a paso: `DEPLOY.md`.
- Deploy automático en cada push a `main` (`.github/workflows/deploy.yml`, `gcloud run deploy --source backend`); a mano, desde `backend/` con `gcloud run deploy --source .` (solo para cambiar variables, instancias o permisos). Cloud Run construye el contenedor solo, con Python 3.13 (`.python-version`; la CI corre en 3.12). La cuenta de servicio del build necesita `roles/run.builder` una vez.
- Secretos y configuración en variables de entorno de Cloud Run, nunca en el repo.
- CORS abierto al dominio del front (`CORS_ORIGINS`, con `agropixel.earth`, `www` y las dos URL `run.app` de `agropixel-web`; ver `DEPLOY.md`).
- Durante la demo: `--min-instances=1`, para que no haya arranque en frío.
- Se deploya solo en cada push a `main` (lo mergea la persona 3), después de probar en `dev` (ver `DEPLOY.md`).
- `CORS_ORIGIN_REGEX` (opcional, en `app/main.py`) acepta orígenes por expresión regular. Hoy no está configurado: era para las vistas previas de Vercel, que ya no se usa.
