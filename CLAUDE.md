# Field Shift — NASA Space Apps Córdoba 2026

Proyecto de hackathon (equipo de 6, FCEFyN-UNC). **Demo: domingo 15/11 a las 18:00 · código congelado el domingo a las 12:00.**
Objetivo: un MVP que funcione de punta a punta y se pueda demostrar. Si algo traba más de 45 min, se recorta o se simula con datos fijos.

**Detalle del alcance** (pantallas, casos de uso, requerimientos, contrato de API propuesto, orden de construcción): [docs/mvp-alcance.md](docs/mvp-alcance.md). Leerlo antes de implementar una funcionalidad.

## Qué es
Una herramienta web donde un **productor experto o su agrónomo** marca un lote, carga su rotación, sus objetivos y sus restricciones, y recibe **una tabla técnica que compara su rotación actual con 3 alternativas**. La tabla se arma con 20–30 años de datos de NASA de ese punto y viene con un mapa de riesgos con línea de tiempo de 12 meses.

Responde al desafío *"Field Shift: Adapting Farms with NASA Data"*: comparar rotaciones que mejoren la salud del suelo y la resiliencia al clima y al agua, mostrando trade-offs, riesgos e incertidumbre.

## Principios (no negociables)
- **Compara, no recomienda.** La app nunca dice cuál es mejor ni qué hacer. Prohibido escribir "te recomendamos", "deberías" o "la mejor"; los textos describen datos ("5 meses más de cobertura, −60 mm de balance en años secos").
- **Sin IA dentro de la app.** No hay LLM ni machine learning en tiempo de uso: todo sale de reglas fijas, estadística y plantillas de texto.
- **Trazable.** Cada valor y cada texto se puede rastrear hasta el dato y la regla que lo produjo.
- **NASA es la base.** Los puntajes salen solo de datos de NASA; las mediciones del productor se muestran al lado, solo para contrastar.
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

**Lote de la demo:** zona de Río Cuarto (sur de Córdoba), lote de soja con barbecho invernal (≈ 33,2477° S, 64,2325° O). Sus datos y capas se precalculan para que la demo no dependa del WiFi. La app tiene que funcionar en cualquier punto.

**Fuera de alcance:** IA en la app · texto libre · login o cuentas · guardar historial · varios lotes · precios de mercado · elegir ganador · pasturas/alfalfa · app nativa.

## Datos disponibles (cubren Argentina)
| Fuente | Aporta | Resolución | Acceso |
|---|---|---|---|
| NASA POWER | Lluvia, temperaturas, heladas, radiación, ET | ~50 km, diaria, desde 1981 | API REST sin login (comunidad `AG`) |
| GPM IMERG | Lluvia y extremos | ~10 km | GES DISC / Giovanni (Earthdata) |
| SMAP | Humedad del suelo y anomalías | 9 km, desde 2015 | NSIDC / AppEEARS (Earthdata) |
| MODIS / VIIRS | NDVI → meses de cobertura baja | 250–500 m, 16 días | AppEEARS, NASA GIBS (tiles sin login) |
| Landsat / Sentinel-2 | NDVI a escala de lote | 30 m / 10 m | EarthExplorer / Copernicus Data Space |
| SRTM | Elevación → pendiente | 30 m | AppEEARS, AWS Terrain Tiles |
| ECOSTRESS | Estrés térmico (pasadas irregulares) | ~70 m | AppEEARS |
| GLDAS, ERA5 | Respaldo de clima y suelo | 0.25° / 0.1° | GES DISC / Copernicus CDS |
| FAO GAEZ | Aptitud de cada cultivo | ~9 km | gaez.fao.org, sin login |
| SoilGrids | Textura, materia orgánica (no NASA) | 250 m | API sin login |

Prioridad: POWER primero; después MODIS y SRTM; SoilGrids y GAEZ solo si sobra tiempo. Todo se lleva a **escala mensual + climatología de 20–30 años**. Los datos gruesos se presentan como "contexto regional". Los nombres de producto y las resoluciones se verifican en la fuente antes de usarlos.

## Equipo
1 Backend clima + líder técnico (único que mergea a `main`) · 2 Datos satelitales y suelo · 3 Scoring y agronomía (dueño de las reglas y de la tabla de cultivos) · 4 Front: mapa y entradas · 5 Front: resultados y diseño · 6 Producto, pitch y coordinación (desempata y recorta alcance).

## Cómo trabajamos
- Una branch por persona, commits frecuentes; solo la persona 1 mergea a `main`.
- Stack y contrato de API: los define la persona 1. No asumir nada que no figure en el repo.
- Secretos en variables de entorno, nunca en el repo.
- App en español, con lenguaje agronómico técnico; lo satelital se explica en una línea.
- Diseño pensado primero para la compu.
- Al recortar alcance, **nunca** se tocan las 4 columnas, los 5 puntos de cada una (por qué, evidencia, beneficios, información que falta, a revisar con el agrónomo) ni la incertidumbre por tipo de año.
- El equipo usa IA (Claude Code) solo para programar; se declara en la entrega.
