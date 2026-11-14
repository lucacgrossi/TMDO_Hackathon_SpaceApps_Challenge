# Motor de Lógica · portado del prototipo (sábado 14)

Dominio de Lógica (persona 3). Ubicación según `backend/PLAN.md`: `app/motor/` y `tests/motor/`.

| Archivo | Qué es | Del prototipo |
|---|---|---|
| `app/motor/cultivos.py` | Tabla de cultivos y meses en el lote | `C`, `WIN` |
| `app/motor/reglas.py` | Las 4 columnas, las reglas, la cercanía y el choque | `strategies`, `ev`, `sc`, `clash` |
| `app/motor/plantillas.py` | Resumen y los 5 puntos (por qué, evidencia, beneficios, falta, revisar) | Textos de `render()` |
| `tests/motor/test_motor.py` | 15 tests con indicadores inventados | — |

Correr los tests desde `backend/`: `python -m tests.motor.test_motor` (o `python -m pytest tests/motor`).
Uso: `plantillas.armar(analizar(entradas, indicadores), entradas, indicadores)`.

El prototipo v2 (intro, dibujar lote) tiene **la misma lógica** que el v1: se comparó `C`, `WIN`, `strategies`, `ev`, `sc` y `clash` línea por línea, así que el port sigue valiendo.

## Por qué cada decisión

1. **Funciones puras, sin llamadas a NASA.** Así lo pide el doc de roles, y te deja probar todo sin esperar a Back 1.
2. **Agua en mm reales.** El prototipo hacía `cons × 80 mm` y multiplicaba la lluvia por 0,74 o 1,26. Ahora el uso es `kc × ET0` de cada mes (FAO-56) y la lluvia es la de cada tercil. Por eso el `cons` pasó a llamarse `kc`, que es lo que representa.
3. **Escala de agua: 75 + 75 × balance / lluvia.** Con la ET0 real, la fórmula vieja daba 0 en casi todos los años secos y la fila "Por tipo de año" no diferenciaba nada. Hay que calibrarla con un agrónomo.
4. **Trazabilidad.** Cada regla devuelve `{regla, efecto, dato}` y la evidencia sale de esos `dato`.
5. **Mismos números que el prototipo** en suelo, erosión, ingreso, cercanía y choque, para que el front (`cercania.ts`) dé lo mismo.
6. **Un test controla el lenguaje.** Falla si aparece "recomend", "deberías" o "la mejor".
7. **Sin pendiente, igual anda.** Si SRTM no llega, usa 1,6 % (lote demo) y lo pone en "Falta" (principio "nada inventado").

## A confirmar con Back 1
El formato de `indicadores` (docstring de `reglas.py`): terciles con `pp` y `et0` mensuales, `anios_con_helada`, `anios_con_calor`, `n_anios`, `pendiente_pct` y `visto_satelite`.
