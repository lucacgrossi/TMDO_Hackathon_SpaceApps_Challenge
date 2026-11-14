# Motor de reglas (`app/motor/`)

Arma las 4 columnas de `/analizar` (actual, A, B y C) con puntajes de 0 a 100 en agua (por tipo de año), salud del suelo, erosión e ingreso, más los 5 puntos de texto de cada una. Reglas fijas, sin IA y sin red. Dueña: persona 3 (lo escribió Back 2 y lo revisa la persona 3).

| Archivo | Qué hace |
|---|---|
| `cultivos.py` | Catálogo de cultivos (kc, meses, nitrógeno, rastrojo, helada, calor). Valores orientativos para la zona centro, a validar con un agrónomo |
| `mezcla.py` | Clima del lote: mezcla las mediciones del productor (lluvia, mínimas y máximas, opcionales) con NASA POWER. El productor pesa más según sus años de registro: 1–2 años 40 %, 3–4 50 %, 5–9 60 %, 10 o más 75 %. La diferencia productor/NASA se calcula contra NASA **del mismo período** que cubre el registro (campañas en común con la planilla, o las últimas `anios_registro` con la lluvia anual), igual que el contraste de `clima/correccion.py`; después se aplica sobre los terciles de las 30 campañas. Sin `campanas_nasa`, contra el promedio de las 30, y la evidencia lo dice |
| `estrategias.py` | Las 4 columnas y su calendario. Las prioridades eligen la especie (vicia o centeno, trigo o cebada, sorgo o girasol); `no_sembrar` descarta una columna |
| `reglas.py` | `analizar(entradas, indicadores)`: puntajes, aportes trazables `{regla, efecto, dato}`, cercanía con las prioridades al cuadrado y choque de objetivos |
| `plantillas.py` | `armar(resultado, entradas, indicadores)`: resumen, por qué, evidencia, beneficios, información que falta y a revisar con el agrónomo |

**Qué cambia los puntajes:**
- Prioridades (1 a 5): eligen especies y pesan al cuadrado en la cercanía (una prioridad 5 pesa 25 veces más que una 1). El front repite la cuenta en `cercania.ts`.
- Lluvia del productor: agua (los 3 tipos de año) y erosión (lluvia en los meses pelados).
- Mínimas y máximas del productor: riesgo de helada y de calor en el ingreso, y los meses de helada/calor.
- Textura y anegamiento: lluvia efectiva, erosión y agua en años húmedos.

Las constantes de cada regla están arriba de cada archivo para calibrarlas. Tests: `pytest tests/motor`.
