# Field Shift — NASA Space Apps Córdoba 2026

Proyecto de hackathon (equipo de 5, FCEFyN-UNC). **Demo: domingo 15/11 a las 18:00 · código congelado el domingo a las 12:00.**
Objetivo: un MVP que funcione de punta a punta y se pueda demostrar. Si algo se traba, se avisa y se decide en equipo si se recorta o se simula con datos fijos.

**Stack:** monorepo con `backend/` (Python + FastAPI, organizado por dominio: ver `backend/PLAN.md`) y `frontend/` (ver `frontend/CLAUDE.md`).

**Detalle del alcance** (pantallas, casos de uso, requerimientos, contrato de API propuesto, orden de construcción): [docs/mvp-alcance.md](docs/mvp-alcance.md). Leerlo antes de implementar una funcionalidad.

## Qué es
Una herramienta web donde un **productor experto o su agrónomo** marca un lote, carga su rotación, sus objetivos y sus restricciones, y recibe **una tabla técnica que compara su rotación actual con 3 alternativas**. La tabla se arma con 20–30 años de datos de NASA de ese punto y viene con un mapa de riesgos con línea de tiempo de 12 meses.

Responde al desafío *"Field Shift: Adapting Farms with NASA Data"*: comparar rotaciones que mejoren la salud del suelo y la resiliencia al clima y al agua, mostrando trade-offs, riesgos e incertidumbre.

## Principios (no negociables)
- **Compara, no recomienda.** La app nunca dice cuál es mejor ni qué hacer. Prohibido escribir "te recomendamos", "deberías" o "la mejor"; los textos describen datos ("5 meses más de cobertura, −60 mm de balance en años secos").
- **Sin IA dentro de la app.** No hay LLM ni machine learning en tiempo de uso: todo sale de reglas fijas, estadística y plantillas de texto. Las predicciones son **estadísticas**: frecuencias observadas en 30 años, no un modelo entrenado.
- **Trazable.** Cada valor y cada texto se puede rastrear hasta el dato y la regla que lo produjo.
- **NASA es la base.** Todo parte de datos de NASA. Las mediciones del productor solo **corrigen** esos datos, y de forma explícita: siempre se muestran el valor NASA original, la medición y la corrección aplicada.
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

**Predicción estadística (probabilidad climatológica):** la probabilidad de cada riesgo sale de la frecuencia con que ocurrió en los 30 años del punto. Ejemplos: "balance de julio negativo en 22 de 30 años → 73 %", "helada después del 15 de septiembre en 9 de 30 años → 30 %". Se aplica a los riesgos del calendario (helada, calor > 35 °C, déficit de agua, lluvia extrema) y siempre muestra el conteo de años, no solo el porcentaje.

**Corrección con mediciones propias:** si el productor carga sus mediciones (por ejemplo, la lluvia del pluviómetro y los años de registro), se calcula el sesgo frente a NASA en el mismo período y se corrige la serie con un factor. La tabla muestra el valor NASA, la medición, el factor y el valor corregido. La confianza del indicador sube o baja según la diferencia y la cantidad de años de registro. Sin mediciones, todo funciona solo con NASA.

**Lote de la demo:** zona de Río Cuarto (sur de Córdoba), lote de soja con barbecho invernal (≈ 33,2477° S, 64,2325° O). Sus datos y capas se precalculan para que la demo no dependa del WiFi. La app tiene que funcionar en cualquier punto.

**Fuera de alcance:** IA en la app · modelos de predicción entrenados (machine learning) · texto libre · login o cuentas · guardar historial · varios lotes · precios de mercado · elegir ganador · pasturas/alfalfa · app nativa.

## Datos que usamos
Verificados el 14/11 contra el lote demo: todos funcionan sin login y responden en 1–2 s. "PC" = Microsoft Planetary Computer (`planetarycomputer.microsoft.com/api`, STAC + endpoint de estadísticas por polígono).

| Fuente | Aporta | Resolución | Acceso | Dueño |
|---|---|---|---|---|
| NASA POWER mensual | Lluvia, temperaturas, humedad del suelo, 1991–2024 | ~50 km | API REST, comunidad `AG` | Back 1 |
| NASA POWER diario | Días de helada, días > 35 °C, lluvia extrema | ~50 km | API REST, comunidad `AG` | Back 1 |
| Hargreaves (FAO-56) | ET de referencia → balance hídrico | ~50 km | Calculada con las temperaturas de POWER | Back 1 |
| MODIS MOD13Q1 | NDVI cada 16 días desde el 2000 → meses de cobertura baja | 250 m | PC `modis-13Q1-061` | Back 2 |
| HLS (Landsat + Sentinel-2) | NDVI del lote en la última campaña | 30 m | PC `hls2-s30` / `hls2-l30` | Back 2 |
| NASADEM | Elevación → pendiente → erosión | 30 m | PC `nasadem` (AWS Terrain Tiles de respaldo) | Back 2 |
| ESA WorldCover | ¿El punto es un lote agrícola? | 10 m | PC `esa-worldcover` | Back 2 |
| MODIS MOD16A3GF | ET real anual, para contrastar Hargreaves | 500 m | PC `modis-16A3GF-061` | Back 2 |
| NASA GIBS | NDVI como imagen (capa visual) | 250 m | Teselas WMTS | Front |
| Esri World Imagery | Mapa base | — | Teselas | Front |
| Mediciones del productor | Pluviómetro, materia orgánica | Su lote | Carga en la app | Corrección |

Todo se lleva a **escala mensual + climatología de 30 años**. Los datos gruesos se presentan como "contexto regional".

**Detalles que importan:**
- POWER mensual trae una clave `AAAA13` (total anual) que hay que descartar, y la lluvia viene en mm/día.
- MODIS a 250 m mezcla el lote con los vecinos: en julio de 2024 dio NDVI 0,31, mientras HLS a 30 m dio 0,264. El umbral de "cobertura baja" se define por fuente.

**Descartados:** ERA5 y GPM en PC (zarr pesado, solo hasta ~2021) · SMAP (desde 2015, pide Earthdata) · ECOSTRESS (pasadas irregulares) · GRACE (solo regional) · SoilGrids (recortado; no está en PC) · Meteomatics (no es de NASA, el acceso vence y no es trazable). **Solo si sobra tiempo:** FAO GAEZ.

## Equipo
1 Backend nucleo + líder técnico · 2 Datos satelitales y suelo · 3 Producto y logica: Motor de reglas y definicion de producto (Mergea a 'main')· 4 Front: mapa y entradas · 5 Front: resultados y comparacion.

## Cómo trabajamos
- Una branch por feature, fix, etc. Con el formato: <nombre-colaborador>/<tipo>/<area>-<descripcion-corta>. Commits frecuentes; **solo la persona 3 mergea a `main`**.
- Formato de commit: <tipo>(<area>): <qué hace, en presente>
                      [opcional: por qué o detalle, si no es obvio]
-Para desarrollo siempre se trabaja sobre la rama dev, ahi se mergean las branch, y luego de testear, recien se puede hacer el PR a main.
- El contrato de la API lo define la persona 1. No asumir nada que no figure en el repo.
- Secretos en variables de entorno, nunca en el repo.
- App en español, con lenguaje agronómico técnico; lo satelital se explica en una línea.
- Diseño pensado primero para la compu.
- Al recortar alcance, **nunca** se tocan las 4 columnas, los 5 puntos de cada una (por qué, evidencia, beneficios, información que falta, a revisar con el agrónomo) ni la incertidumbre por tipo de año con su probabilidad climatológica.
- El equipo usa IA (Claude Code) solo para programar; se declara en la entrega.
