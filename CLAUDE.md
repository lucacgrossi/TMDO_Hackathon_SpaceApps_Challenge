# Field Shift — NASA Space Apps Córdoba 2026

Proyecto de hackathon (equipo de 5, FCEFyN-UNC). **Demo: domingo 15/11 a las 18:00 · código congelado el domingo a las 12:00.**
Objetivo: un MVP que funcione de punta a punta y se pueda demostrar. Si algo se traba, se avisa y se decide en equipo si se recorta o se simula con datos fijos.

**Stack:** monorepo con `backend/` (Python + FastAPI, organizado por dominio: ver `backend/PLAN.md`) y `frontend/` (ver `frontend/CLAUDE.md`).

**Documentación** (leer lo que corresponda antes de implementar):
- [docs/mvp-alcance.md](docs/mvp-alcance.md): alcance, pantallas, casos de uso y requerimientos (RF/RNF).
- [backend/PLAN.md](backend/PLAN.md): dominios del back, dueños, interfaz y estado.
- [docs/plan-planilla-lluvia.md](docs/plan-planilla-lluvia.md): planilla CSV del productor (aprobada).
- [docs/plan-armonizacion-capas.md](docs/plan-armonizacion-capas.md): capas del mapa sobre una grilla común (el back calcula, el front dibuja).
- [frontend/CLAUDE.md](frontend/CLAUDE.md) y [frontend/DESIGN.md](frontend/DESIGN.md): front. [backend/DEPLOY.md](backend/DEPLOY.md): deploy. [.github/README.md](.github/README.md): CI. [backend/app/motor/README.md](backend/app/motor/README.md): motor de reglas.
- **El contrato vigente de la API es el código:** `backend/app/api/contrato.py` (lo mantiene Back 1). El del MVP es solo un resumen.

## Qué es
Una herramienta web donde un **productor experto o su agrónomo** marca un lote, carga su rotación, sus objetivos y sus restricciones, y recibe **una tabla técnica que compara su rotación actual con 3 alternativas**. La tabla se arma con las últimas 30 campañas de datos de NASA de ese lote (y, si las carga, con las mediciones del productor) y viene con un mapa de riesgos con línea de tiempo de 12 meses.

Responde al desafío *"Field Shift: Adapting Farms with NASA Data"*: comparar rotaciones que mejoren la salud del suelo y la resiliencia al clima y al agua, mostrando trade-offs, riesgos e incertidumbre.

## Principios (no negociables)
- **Compara, no recomienda.** La app nunca dice cuál es mejor ni qué hacer. Prohibido escribir "te recomendamos", "deberías" o "la mejor"; los textos describen datos ("5 meses más de cobertura, −60 mm de balance en años secos").
- **Sin IA dentro de la app.** No hay LLM ni machine learning en tiempo de uso: todo sale de reglas fijas, estadística y plantillas de texto. Las predicciones son **estadísticas**: frecuencias observadas en 30 años, no un modelo entrenado.
- **Trazable.** Cada valor y cada texto se puede rastrear hasta el dato y la regla que lo produjo.
- **NASA es la base; el productor pesa más.** Sin mediciones propias, los puntajes salen solo de datos de NASA. Si el productor carga su lluvia o sus temperaturas mínima y máxima (opcionales), **se mezclan con NASA y pesan más** según sus años de registro (1–2 años 40 %, 3–4 50 %, 5–9 60 %, 10 o más 75 %), y cada valor dice cuánto pesó cada fuente. Sus **prioridades** (de 1 a 5) eligen las especies y pesan al cuadrado en la cercanía. *(Decisión 2026-11-14, aprobada por la persona 3.)*
- **Nada inventado.** Lo que falta o tiene baja confianza va a "Información que falta".
- **Estandarizado.** Misma estructura de salida para todos: siempre 4 columnas (actual + A, B, C). Una alternativa descartada por restricción aparece en gris con el motivo.
- **Técnico por defecto.** Cada valor muestra unidad, fuente, años, resolución y confianza. Cada capa del mapa se dibuja a la escala real del dato.
- **Apoya, no reemplaza.** El aviso "Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo" está siempre visible.

## Alcance
**Las 4 columnas:**
- **Actual:** la rotación que cargó el usuario.
- **A · Cobertura de invierno:** mismos cultivos de verano + vicia o centeno en el hueco invernal.
- **B · Cultivo de invierno comercial:** trigo o cebada + soja de segunda.
- **C · Diversificar el verano:** sumar sorgo o girasol a la secuencia.

**Incertidumbre:** los 30 años se ordenan por balance de agua y se cortan en terciles (secos / normales / húmedos). Cada alternativa muestra sus valores por tipo de año y se marca "sensible al clima" si la diferencia es grande.

**Predicción estadística (probabilidad climatológica):** la probabilidad de cada evento sale de la frecuencia con que ocurrió en las 30 campañas del punto, según el calendario de cada estrategia: helada con cultivo sensible, siembra con menos de la mitad de la lluvia normal, máxima ≥ 35 °C. Ejemplo: "Siembra de vicia (mayo) con menos de la mitad de la lluvia normal: 14 de 30 años (47 %)". Siempre muestra el conteo de años, no solo el porcentaje.

**Mediciones del productor:** se cargan **a mano** (lluvia anual del pluviómetro y años de registro, materia orgánica) o **subiendo una planilla CSV** con su registro diario o mensual de lluvia y, si tiene estación, de temperaturas mínima y máxima (ruta `POST /mediciones/planilla`; ver `docs/plan-planilla-lluvia.md`). Se usan de dos formas:
- **Contraste al lado de NASA** (`clima/correccion.py`): "Tu pluviómetro (2018/19 a 2023/24, 6 campañas): 702 mm/año · NASA en las mismas campañas: 781 mm (−10 %)"; con planilla, la comparación es en las **mismas campañas** que NASA. Si la lluvia difiere más del 15 %, la confianza del agua baja a "baja"; si las heladas o el calor difieren en 1 de cada 3 campañas en común o más, baja la de las heladas. Todo va a "Revisar con el agrónomo". El contraste **no cambia puntajes**.
- **Mezcla en los puntajes del motor** (`motor/mezcla.py`): la lluvia y las temperaturas del productor se mezclan con NASA según sus años de registro y mueven el agua, la erosión y los riesgos de helada y calor. Las **probabilidades climatológicas** siguen saliendo solo de las 30 campañas de NASA. La materia orgánica se muestra como "dato del productor" y no puntúa.
- Sin mediciones, todo funciona solo con NASA.

**Capas del mapa:** el back las calcula y el front solo las dibuja. Todas usan la misma campaña y el mismo mes que la tabla, y las escalas salen del back. El plan para llevarlas a una grilla común del lote (1″, ~30 m), con cada número del lote calculado como resumen de su capa, está en `docs/plan-armonizacion-capas.md`.

**Clima:** un solo pedido mensual a NASA POWER con las **últimas 30 campañas completas de julio a junio**. Todo lo climático (lluvia, heladas, calor, terciles, serie por campaña) sale de ese mismo período.

**Lote:** es un polígono que dibuja el usuario (de 1 a 20.000 ha) o el lote de ejemplo. Todo lo satelital se calcula sobre el polígono, no sobre un punto.

**Lote de la demo:** zona de Río Cuarto (sur de Córdoba), lote de soja con barbecho invernal (≈ 33,2477° S, 64,2325° O). Su respuesta completa está precalculada en `backend/app/demo/rio_cuarto.json` (`scripts/precalcular_demo.py`; se regenera después de cada cambio de contrato o del motor), y la API la devuelve si NASA POWER no responde y el lote es el de ejemplo. La app tiene que funcionar en cualquier punto.

**Fuera de alcance:** IA en la app · modelos de predicción entrenados (machine learning) · texto libre · login o cuentas · guardar historial · varios lotes · precios de mercado · elegir ganador · pasturas/alfalfa · app nativa · planillas en XLSX y otras variables del productor (humedad del suelo, napa).

## Datos que usamos
Verificados el 14/11 contra el lote demo: todos funcionan sin login y responden en 1–2 s. La campaña de toda la salida es la última completa de POWER (hoy **2025/26**; el período es 1996/97 a 2025/26). "PC" = Microsoft Planetary Computer (`planetarycomputer.microsoft.com/api`, STAC + endpoint de estadísticas por polígono).

| Fuente | Aporta | Resolución | Acceso | Dueño |
|---|---|---|---|---|
| NASA POWER mensual | Lluvia, temperaturas mínima y máxima, últimas 30 campañas (jul–jun) | ~50 km | API REST, comunidad `AG` | Back 1 |
| Hargreaves (FAO-56) | ET de referencia → balance hídrico | ~50 km | Calculada con las temperaturas de POWER | Back 1 |
| HLS (Landsat + Sentinel-2) | NDVI del lote por mes en la última campaña → visto por satélite | 30 m | PC `hls2-s30` / `hls2-l30` | Back 2 |
| MODIS MOD13Q1 | NDVI de respaldo cuando HLS no tiene escena limpia | 250 m | PC `modis-13Q1-061` | Back 2 |
| NASADEM | Elevación → pendiente → erosión | 30 m | PC `nasadem` (AWS Terrain Tiles de respaldo) | Back 2 |
| ESA WorldCover | ¿El punto es un lote agrícola? | 10 m | PC `esa-worldcover` | Back 2 |
| MODIS MOD16A3GF | ET real anual, para contrastar Hargreaves | 500 m | PC `modis-16A3GF-061` | Back 2 |
| NASA GIBS | NDVI como imagen (capa visual) | 250 m | Teselas WMTS | Front |
| Esri World Imagery | Mapa base | — | Teselas | Front |
| Esri World Geocoding | Buscar el lugar del lote | — | `suggest` / `findAddressCandidates`, sin cuenta | Front |
| Mediciones del productor | Lluvia, temperaturas mínima y máxima, materia orgánica | Su lote | A mano o planilla CSV (`mediciones/planilla.py`, Back 2) | Contraste (Back 1) y mezcla en el motor (Lógica) |

Todo se lleva a **escala mensual + climatología de 30 años**. Los datos gruesos se presentan como "contexto regional".

**Detalles que importan:**
- POWER mensual trae una clave `AAAA13` (total anual) que hay que descartar. Con `PRECTOTCORR_SUM` la lluvia viene en mm/mes; con `PRECTOTCORR`, en mm/día. No mezclar con la climatología precalculada de POWER (otro período, extremos absolutos).
- MODIS a 250 m mezcla el lote con los vecinos: en julio de 2024 dio NDVI 0,31, mientras HLS a 30 m dio 0,264. Por eso el lote se mide con HLS y el umbral de cobertura baja (0,3) está pensado para HLS.

**Descartados:** ERA5 y GPM en PC (zarr pesado, solo hasta ~2021) · SMAP (desde 2015, pide Earthdata) · ECOSTRESS (pasadas irregulares) · GRACE (solo regional) · SoilGrids (recortado; no está en PC) · Meteomatics (no es de NASA, el acceso vence y no es trazable). **Solo si sobra tiempo:** FAO GAEZ.

## Equipo
1 Backend núcleo + líder técnico (contrato, clima, `servicio.py`) · 2 Datos satelitales y mediciones (`satelite/`, `mediciones/`, demo precalculada, deploy en Cloud Run y merges a `dev`) · 3 Producto y lógica: motor de reglas y definición de producto (mergea a `main`) · 4 Front: mapa y entradas · 5 Front: resultados y comparación.

## Cómo trabajamos
- Una branch por feature, fix, etc., con el formato `<nombre-colaborador>/<tipo>/<area>-<descripcion-corta>`. Commits frecuentes.
- Formato de commit: `<tipo>(<area>): <qué hace, en presente>` [opcional: por qué o detalle, si no es obvio].
- Todo se trabaja sobre `dev`: las branches salen de `dev` y vuelven por PR. La persona 2 mergea a `dev`; después de probar, **solo la persona 3 mergea `dev` → `main`**. El backend se deploya desde `main` (`backend/DEPLOY.md`).
- `dev` exige que pase la CI (lint, tests sin red, build, gitleaks y los checks del proyecto: `.github/README.md`).
- El contrato de la API lo define la persona 1 en `backend/app/api/contrato.py`. No asumir nada que no figure en el repo.
- Secretos en variables de entorno, nunca en el repo.
- App en español, con lenguaje agronómico técnico; lo satelital se explica en una línea.
- Diseño pensado primero para la compu.
- Al recortar alcance, **nunca** se tocan las 4 columnas, los 5 puntos de cada una (por qué, evidencia, beneficios, información que falta, a revisar con el agrónomo) ni la incertidumbre por tipo de año con su probabilidad climatológica.
- El equipo usa IA (Claude Code) solo para programar; se declara en la entrega.
