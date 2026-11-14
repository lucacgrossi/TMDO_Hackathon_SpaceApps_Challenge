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
│  │  ├─ power.py               ←         30 años mensuales
│  │  └─ indicadores.py         ←         balance hídrico (Hargreaves si falta ET), heladas, calor, terciles
│  ├─ satelite/                 ← Back 2  datos satelitales del lote
│  │  ├─ lote.py                ←         polígono por defecto a partir de lat/lon
│  │  ├─ ndvi.py                ←         NDVI numérico mensual → meses de cobertura baja
│  │  ├─ elevacion.py           ←         pendiente (plano ajustado) + capa de pendiente
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
| **Además** | Integra `motor/` en `servicio.py`, mock para el front, deploy, merges a `dev` | Ayuda con la integración y el deploy cuando termina lo suyo |
| **No toca** | `satelite/`, `demo/` | `api/`, `clima/`, `servicio.py`, `main.py`, `motor/` |
| **Le entrega al otro** | `contrato.py` (tipo `Indicador`) y `servicio.analizar()` | Las funciones públicas de `satelite/` |

**Regla entre dominios:** un dominio no importa a otro, salvo `api/contrato.py` (los tipos compartidos). Solo `servicio.py` conecta `clima/`, `satelite/` y `motor/`.

## 2. Interfaz entre Back 1 y Back 2
Back 2 expone funciones en `satelite/`; **Back 1 las llama desde `servicio.py`**. Back 2 nunca edita `servicio.py`.

**Reglas de la interfaz:**
- `Indicador` = `{valor, unidad, fuente, anios, resolucion, confianza}` y lo define Back 1 en `api/contrato.py`. Hasta que exista, Back 2 devuelve un `dict` con esas mismas claves.
- **Nunca lanzan excepción hacia afuera.** Si falla una fuente: `valor: None`, `confianza: "sin_dato"` y un `motivo` en texto. Back 1 lo manda a "Información que falta".
- Cada llamada externa tiene un timeout, para que `/analizar` responda en menos de 30 s (RNF7).
- Las funciones son puras respecto del input (lat/lon → resultado): se prueban sueltas, sin levantar FastAPI.
- Cada módulo se puede correr solo desde `backend/`: `python -m app.satelite.elevacion -33.2476 -64.2325` imprime el resultado del lote demo.

**Interfaz Back 1 → Back 2:** `servicio.analizar(entrada: Entrada) -> Salida`. La usan `/analizar` y `scripts/precalcular_demo.py`. Así el JSON de la demo sale del mismo código que la API, no a mano.

## 3. Formato de trabajo
**Branches:** salen de `dev` y vuelven a `dev` por PR. Formato: `<nombre>/<tipo>/<area>-<descripcion-corta>`.
Áreas del back: `api` y `clima` (Back 1) · `satelite` (Back 2) · `motor` (Lógica).

**Commits:** `<tipo>(<area>): <qué hace, en presente>`.

**Merges:** Back 1 mergea a `dev` seguido; **solo la persona 3 mergea `dev` → `main`**, después de probar.

**PRs:** chicos (un módulo o una función) y con descripción de 3 líneas: qué agrega, cómo se probó (comando y resultado en el lote demo) y si toca algo ajeno.

**Un PR está listo cuando:**
- Corre solo contra el lote demo y da un valor razonable (pendiente ≈ 0,6 %; NDVI bajo en julio).
- Cada valor lleva fuente, años, resolución y confianza.
- Si la fuente falla, devuelve `None` + motivo sin romper nada.
- No tiene keys ni datos pesados commiteados.
- No toca dominios ajenos (o lo avisó).

**Cambios de contrato:** solo Back 1 edita `api/contrato.py`. Si Back 2 necesita un campo nuevo, se lo pide por el canal del equipo con: campo, tipo, para qué. Back 1 actualiza `contrato.py` **y el mock en el mismo commit**, y avisa a los dos front. Después de cada cambio de contrato, Back 2 regenera `demo/rio_cuarto.json`.

## 4. Planes B de Back 2
| Si falla | Plan B | Qué ve el usuario |
|---|---|---|
| ORNL MODIS no responde o es muy lento | NDVI con HLS vía Planetary Computer (ya funciona en el prototipo, `hlsScene`/`hlsMean`) | Igual, a 30 m y solo la última campaña |
| HLS tampoco | GIBS solo como capa visual; meses de cobertura baja desde el calendario | "Información que falta: NDVI numérico" |
| Terrarium de AWS falla | Pendiente fija del lote demo (0,6 %) con `confianza: "baja"` | Nota en "Información que falta" |
| Internet en la demo | `demo/rio_cuarto.json` servido por la API cuando el lote es el de la demo | Sin cambios |

## 5. Deploy
- El backend va en **GCP Cloud Run**, región `southamerica-east1` (São Paulo). Dueño: Back 1; Back 2 ayuda.
- Deploy desde `backend/` con `gcloud run deploy --source .`. Cloud Run construye el contenedor solo.
- Secretos y configuración en variables de entorno de Cloud Run, nunca en el repo.
- CORS abierto al dominio del front.
- Durante la demo: `--min-instances=1`, para que no haya arranque en frío.
- Se deploya desde `main` (lo mergea la persona 3), después de probar en `dev`.
