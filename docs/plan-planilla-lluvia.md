# Plan · Planilla de mediciones del productor (CSV: lluvia y temperatura)

**Estado:** propuesta de Back 2 (Luca), 14/11. **Antes de implementar hace falta el OK de la persona 3**, porque cambia el alcance: el MVP 4.2 dice "carga a mano, sin subir archivo" (RF15) y deja "subir planillas" fuera de alcance. Si no se aprueba, o no entra antes del congelamiento, sigue andando la carga a mano que ya está en `dev`.

**Prioridades:** la **lluvia** es **Must** dentro de esta propuesta. Las **temperaturas** (mínima y máxima) son **Should**: columnas opcionales que se suman si hay tiempo. Si no entran, la planilla funciona solo con lluvia.

## 1. Qué resuelve
Hoy (PR #39) el productor carga **un número**: la lluvia anual de su pluviómetro y los años de registro. `clima/correccion.py` compara ese número contra el **promedio de 30 campañas** de NASA POWER. El problema es que los períodos no coinciden: el productor puede tener 6 años y NASA usa 30.

Con la planilla, el productor sube su **registro mes a mes** y la comparación se hace **en las mismas campañas** que NASA. Es la mejora que Benja dejó anotada en #39 ("compararlo con las últimas `anios_registro` campañas") y la fusión satélite + suelo que pide el desafío.

**Temperaturas (Should):** si el productor tiene una estación propia, la planilla también trae la mínima y la máxima diarias. Sirven para contrastar **las heladas y el calor** con NASA POWER, que mide en una celda de ~50 km y no ve los bajos donde se acumula el frío. Ejemplo: "Heladas en mayo: tu estación, 4 de 6 campañas · NASA en las mismas campañas, 2 de 6".

**Cómo se usan los datos de la planilla (actualizado con el MVP 4.3):**
- **Contraste al lado de NASA** (`clima/correccion.py`): filas en las mismas campañas y ajuste de la confianza de los indicadores de agua y de helada. El contraste no puntúa.
- **Puntajes:** la serie también llega al motor (`motor/mezcla.py`), que la mezcla con NASA según los años de registro (1–2 años 40 %, 3–4 50 %, 5–9 60 %, 10 o más 75 %). Esto cambia el agua, la erosión y los riesgos de helada y calor. *(Cuando se escribió este plan, la regla era "no cambia ningún puntaje"; la persona 3 aprobó el cambio con el motor, PR #53.)*
- Las **probabilidades climatológicas** no cambian: salen de las 30 campañas de NASA.

**Qué no cambia:**
- Sin la planilla, todo sigue igual que hoy.
- No se guarda nada (RNF6). El archivo se procesa en el pedido y se descarta.
- La materia orgánica sigue cargándose a mano (es un valor suelto).

## 2. Formato del archivo: CSV
**Por qué CSV:** Excel y Google Sheets lo exportan sin pasos raros, se lee con la librería estándar de Python (sin dependencias pesadas en Cloud Run), el productor puede abrir el mismo archivo y ver qué cargó, y los tests corren sin red. XLSX queda para después (pide `openpyxl` y trae varias hojas, celdas combinadas y fechas como número).

**Plantilla** (se descarga desde la app). Las columnas de medición son todas opcionales, pero tiene que venir al menos una:
```
fecha;lluvia_mm;t_min_c;t_max_c
15/01/2023;32,5;18,2;34,1
16/01/2023;;17,5;35,8
17/01/2023;0;16,9;36,2
```
o mensual:
```
mes;lluvia_mm;t_min_c;t_max_c
2023-01;120,5;12,1;37,4
2023-02;98;11,8;35,0
```
En el formato mensual, `t_min_c` es **la mínima más baja del mes** y `t_max_c` **la máxima más alta**: lo mismo que entrega NASA POWER mensual (`T2M_MIN` y `T2M_MAX` son los extremos del mes, verificado por Benja en #28).

**Qué se acepta:**

| Aspecto | Acepta | Cómo se detecta |
|---|---|---|
| Codificación | UTF-8, UTF-8 con BOM, Latin-1 / Windows-1252 | Intentar UTF-8 (quitando el BOM); si falla, Latin-1 |
| Separador | `;` `,` tabulación | `csv.Sniffer` sobre las primeras líneas; con empate, gana `;` |
| Decimal | `12,5` o `12.5` | Si el separador es `;` o tab, se acepta coma decimal; si es `,`, solo punto |
| Fecha diaria | `dd/mm/aaaa`, `dd-mm-aaaa`, `aaaa-mm-dd`, `d/m/aa` (años 00–69 → 2000s) | Por expresión regular, **siempre día/mes** (nunca el orden de Estados Unidos) |
| Mes | `aaaa-mm`, `mm/aaaa`, `mm-aaaa` | Por expresión regular |
| Encabezado | Opcional (sin encabezado, solo se lee la lluvia). Nombres reconocidos, sin distinguir mayúsculas ni tildes: fecha → `fecha`, `dia`, `mes`, `periodo`; lluvia → `lluvia`, `lluvia_mm`, `mm`, `precipitacion`, `pp`; mínima → `t_min_c`, `tmin`, `minima`, `temp_min`; máxima → `t_max_c`, `tmax`, `maxima`, `temp_max` | Si la primera fila no tiene fecha, es encabezado. Sin encabezado: columna 1 = fecha y columna 2 = lluvia |
| Columnas extra | Se ignoran, con aviso ("columna `humedad_suelo` ignorada: no se usa en esta versión") | Solo se usan las reconocidas |

**Granularidad:** se detecta por el formato de la primera fecha válida. Un archivo mezclado (diario y mensual) da error.

**Límites:** hasta **1 MB**, **20.000 filas** y **40 años**. Fuera de eso: error claro.

## 3. Reglas de procesamiento
El parser es **extensible**: tiene una tabla de variables reconocidas, cada una con su unidad, su rango válido y su regla para pasar a mensual. Sumar otra variable más adelante (por ejemplo, la humedad del suelo) es agregar una fila a esa tabla.

| Variable | Unidad | Rango válido (diario) | Rango válido (mensual) | Diario → mensual |
|---|---|---|---|---|
| `lluvia_mm` | mm | 0 a 300 | 0 a 1.000 | **suma** |
| `t_min_c` | °C | −20 a 40 | −20 a 40 | **mínimo** del mes |
| `t_max_c` | °C | −10 a 50 | −10 a 50 | **máximo** del mes |

1. **Diario → mensual:** según la tabla. Varios registros de lluvia del mismo día se suman (son varias lluvias). Para las temperaturas del mismo día se toma el mínimo de las mínimas y el máximo de las máximas.
2. **Lluvia, meses sin registros dentro del período:** el productor anota solo los días que llueve, así que un mes sin filas de lluvia entre la primera y la última fecha cuenta como **0 mm**, con un aviso: "N meses sin registros dentro del período: se tomaron como 0 mm (en invierno es normal)". Si son más de 6 meses seguidos con 0, se avisa como posible hueco del registro.
3. **Temperaturas, meses incompletos:** a diferencia de la lluvia, la falta de datos de temperatura **no** cuenta como 0. Un mes de temperatura vale solo si tiene registros en al menos **20 días**. Si tiene menos, ese mes queda sin dato, con aviso (una helada se puede perder justo en los días que faltan).
4. **Celda vacía o `-`:** el día o mes **no se registró** para esa variable. Las otras variables de la fila se usan igual.
5. **Mensual:** un mes repetido es un **error** (no se suma, porque no se sabe cuál vale).
6. **Valores fuera de rango** (tabla de arriba), `t_min_c > t_max_c` el mismo día, o fechas futuras → el valor o la fila se descarta, con aviso.
7. **Campañas completas por variable:** se arman campañas **julio–junio, igual que NASA POWER**, por separado para cada variable. Solo cuentan las que tienen los 12 meses con dato. Las parciales se informan, pero no se comparan.
8. **Errores de fila:** como mucho se informan las primeras 20, cada una con número de fila y motivo. El archivo se rechaza si ninguna variable llega a **12 meses válidos**.

## 4. Diseño por pieza

### 4.1 Parser · `backend/app/mediciones/planilla.py` (Back 2, dominio nuevo)
Es un dominio nuevo, `mediciones/`, porque procesa datos del productor y no es clima ni satélite. No importa `clima/`, `satelite/` ni `motor/`: solo `app.api.contrato`. Su dueño es Back 2.

```python
def leer_planilla(contenido: bytes, nombre: str | None = None) -> ResultadoPlanilla
```
- Nunca lanza: los problemas van en `errores` y `avisos`.
- Sin red, sin disco, y puro: los bytes de entrada determinan el resultado.
- Se puede correr solo: `py -m app.mediciones.planilla <archivo.csv>` imprime el resumen.

`ResultadoPlanilla` (modelo Pydantic en el contrato, ver 5.1):
```
ok: bool
serie: SeriePlanilla | None
errores: [ {fila: int | None, motivo: str} ]
```
```
SeriePlanilla:
  meses: [ {mes: "AAAA-MM", lluvia_mm?: float, t_min_c?: float, t_max_c?: float} ]   # cronológico
  variables: ["lluvia_mm", "t_min_c", "t_max_c"]   # las que trajo el archivo
  granularidad: "diaria" | "mensual"
  periodo: {desde: "AAAA-MM", hasta: "AAAA-MM"}
  campanas_completas: {lluvia_mm: ["2019/20", ...], t_min_c: [...], t_max_c: [...]}
  lluvia_media_campana_mm: float | None
  filas_leidas: int
  filas_usadas: int
  avisos: [ {fila: int | None, motivo: str} ]
  formato: {codificacion, separador, decimal}
```

### 4.2 Front (Front 1, `SeccionMediciones.tsx`, coordinando con #18 y #45)
- En "Mediciones propias": la opción **"Subir planilla (CSV)"**, al lado de la carga a mano, más el link **"Descargar plantilla"** (`frontend/public/plantillas/mediciones.csv`).
- Al elegir el archivo → `POST /mediciones/planilla` → **vista previa**: "Lluvia: 6 campañas completas (2018/19 a 2023/24) · Temperatura: 4 campañas · 1.248 registros diarios · 3 filas descartadas [ver]". Si hay errores, la lista por fila y la opción de seguir con la carga a mano.
- Al comparar, se mandan los `meses` en `entrada.mediciones_propias.serie_mensual`. El campo manual de lluvia se deshabilita mientras haya una planilla con lluvia.
- En la tabla, la fila del contraste ya existe (#45). Se suman las filas de helada y calor si llegan, y si llega `detalle_campanas`, una mini tabla por campaña (Could).

### 4.3 CI (Back 2)
- `.github/scripts/fronteras_dominios.py`: sumar `"mediciones"` a `DOMINIOS`.
- Fixtures CSV en `backend/tests/mediciones/fixtures/`, todas de menos de 5 KB.

## 5. Lo que tiene que hacer Benja (Back 1), paso a paso
Todo es **compatible hacia atrás**: los campos nuevos son opcionales, el mock no cambia y sin planilla `/analizar` responde igual que hoy. Los pasos 5.1 y 5.2 desbloquean al resto; 5.3 y 5.4 son independientes del parser y se pueden probar con una `serie_mensual` armada a mano.

### 5.1 Contrato · `app/api/contrato.py`
1. **`MedicionMes`**:
   ```python
   class MedicionMes(BaseModel):
       mes: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
       lluvia_mm: float | None = Field(None, ge=0, le=1000)
       t_min_c: float | None = Field(None, ge=-20, le=40)
       t_max_c: float | None = Field(None, ge=-10, le=50)
       # validador: al menos uno de los tres no es None
   ```
2. **`MedicionesPropias.serie_mensual: list[MedicionMes] | None = None`** (máximo 480 meses = 40 años). Es lo que manda el front en `/analizar`.
3. **Modelos de la ruta nueva:** `AvisoFila {fila: int | None, motivo: str}`, `SeriePlanilla` y `ResultadoPlanilla`, con los campos de 4.1. Los escribe Benja en el contrato y el parser de Back 2 los devuelve.
4. **`ContrasteMedicion`**, campos opcionales nuevos:
   - `campanas_comparadas: list[str] | None`: las campañas en común con NASA.
   - `detalle_campanas: list[DetalleCampana] | None`, con `DetalleCampana {campana, productor, nasa, diferencia}`: para la mini tabla del front (Could).
   - Valores nuevos de `indicador`: `"helada"` y `"calor"` (además de `"lluvia_anual"` y `"materia_organica"`).
5. **`Probabilidad.contraste: str | None = None`** (Should): una línea de texto fijo para mostrar al lado de la probabilidad de helada o de calor, por ejemplo "Tu estación: helada en mayo en 4 de 6 campañas".
6. Tests de contrato: un `MedicionMes` sin ninguna variable da 422, un mes con formato inválido da 422, y una `Entrada` sin `serie_mensual` sigue validando.

### 5.2 Ruta · `POST /mediciones/planilla` en `app/api/rutas.py`
1. Sumar **`python-multipart`** a `backend/requirements.txt` (lo necesita `UploadFile` de FastAPI).
2. La ruta:
   ```python
   @router.post("/mediciones/planilla", response_model=ResultadoPlanilla,
                responses={413: {"model": Error}, 422: {"model": ResultadoPlanilla}})
   async def subir_planilla(archivo: UploadFile) -> ResultadoPlanilla: ...
   ```
   - Lee como mucho **1 MB + 1 byte**. Si se pasa, responde **413** "La planilla supera 1 MB".
   - Llama a `app.mediciones.planilla.leer_planilla(contenido, archivo.filename)`. Hasta que el parser esté en `dev`, devuelve un stub con `ok: false` y "Lectura de planillas en preparación".
   - Responde **200** si `ok` y **422** con el `ResultadoPlanilla` si no.
   - No guarda el archivo ni llama a NASA.
3. Agregar la ruta al mock del front (un `ResultadoPlanilla` de ejemplo), para que Front 1 arranque sin esperar.
4. Tests en `tests/api/test_rutas.py`: un CSV chico válido da 200, un CSV inválido da 422, más de 1 MB da 413, y un archivo vacío da 422.

### 5.3 Contraste de lluvia con la serie · `app/clima/correccion.py`
Si `mediciones.serie_mensual` trae lluvia:
1. Armar las campañas julio–junio del productor con lluvia completa (las mismas reglas que en la sección 3) y cruzarlas con `ResultadoClima.campanas` por `etiqueta`.
2. **Campañas en común** = las completas del productor que también están en las 30 de NASA.
3. `valor_productor` = media de lluvia del productor en esas campañas · `valor_nasa` = media de NASA **en las mismas campañas** (no las 30) · `diferencia_pct` con la regla actual (más de 15 % → confianza del agua "baja", la misma que hoy).
4. `anios_registro` = cantidad de campañas en común. *(Implementado en #52: `MIN_ANIOS_REGISTRO = 1`, igual que el motor. Más años no cambian la confianza del contraste, pero dan más peso en los puntajes.)*
5. `campanas_comparadas` y `detalle_campanas` (por campaña: productor, NASA y diferencia %).
6. Texto de la fila: "Tu pluviómetro (2018/19 a 2023/24, 6 campañas): 702 mm/año · NASA en las mismas campañas: 781 mm (−10 %)".
7. Sin campañas en común: la fila se muestra sin comparar, con la nota "tu registro no coincide con el período de NASA (1996/97 a 2025/26)".
8. El "corregido al lado" usa el cociente productor/NASA **del período en común**.
9. Si llegan `serie_mensual` con lluvia **y** `lluvia_anual_mm`: **manda la planilla**, y la nota lo dice.

### 5.4 Contraste de temperatura · `app/clima/correccion.py` (Should)
Si `serie_mensual` trae `t_min_c` o `t_max_c`:
1. **Helada por mes:** para cada campaña en común con NASA (las completas en `t_min_c`) y cada mes, hubo helada si la mínima del mes es menor que `UMBRAL_HELADA_C` (0 °C, la constante que ya está en `indicadores.py`). Del lado de NASA, lo mismo con `CampanaClima.t_min_c`. Es la **misma regla** que usan `meses_helada_frecuente` y las probabilidades.
2. **Calor por mes:** igual, con `t_max_c >= UMBRAL_CALOR_C` (35 °C).
3. Por cada mes en el que el productor o NASA tienen al menos una campaña con helada, contar `productor_k de n` y `nasa_k de n` en las **mismas** campañas.
4. **Filas de contraste:** `indicador="helada"`, `unidad="campañas con helada"`, con texto fijo por mes: "Heladas en mayo: tu estación, 4 de 6 campañas · NASA en las mismas campañas, 2 de 6". Lo mismo para el calor.
5. **Regla de confianza** *(implementada en #54)*: si en algún mes la diferencia entre productor y NASA llega a **1 de cada 3 campañas en común** (mínimo 1; con 6 campañas da 2), la confianza de `meses_helada_frecuente` baja a "baja", con el motivo y un riesgo para "A revisar con el agrónomo": "Tu estación registra heladas que NASA POWER no ve (mayo: 4 contra 2 de 6 campañas): revisar fechas de siembra con datos locales". Lo mismo para el calor. Es el mismo criterio que la "helada frecuente" de `indicadores.py`.
6. **El contraste no cambia ninguna probabilidad:** las probabilidades siguen saliendo de las 30 campañas de NASA. `servicio.py` completa `Probabilidad.contraste` con la línea del productor para el mismo mes y evento. Los puntajes sí cambian, pero por la mezcla del motor (sección 1), no por el contraste.
7. Nueva constante `INDICADORES_HELADA = ("meses_helada_frecuente",)`, igual que `INDICADORES_AGUA`.

### 5.5 Conexión · `app/servicio.py`
1. Pasar `entrada.mediciones_propias` (con `serie_mensual`) a `correccion.contrastar`, como hoy, **y al motor** (`"mediciones": {lluvia_anual_mm, anios_registro, serie_mensual}`, sin la materia orgánica), que la mezcla en los puntajes.
2. Aplicar la confianza baja a `INDICADORES_AGUA` y, si corresponde, a `INDICADORES_HELADA`, con su motivo. **El valor no cambia.**
3. Sumar los riesgos del contraste a "A revisar con el agrónomo" de cada columna disponible (como ya se hace con la lluvia).
4. (Should) Completar `Probabilidad.contraste` en las probabilidades de helada y calor.

### 5.6 Tests de Benja
En `tests/clima/test_correccion.py` y `tests/api/test_servicio.py`:
- planilla con 6 campañas de lluvia en común → compara en el mismo período (no contra las 30);
- sin campañas en común → fila sin comparar, con nota;
- planilla y `lluvia_anual_mm` a la vez → manda la planilla;
- temperaturas con heladas que NASA no tiene → filas de helada, confianza baja y el riesgo;
- temperaturas que coinciden con NASA → filas sin cambios de confianza;
- el motor recibe las mediciones (con planilla, los puntajes del agua cambian y la evidencia dice cuánto pesó cada fuente);
- **con y sin planilla, las probabilidades son idénticas** (salen de NASA).

## 6. Casos de prueba del parser (`backend/tests/mediciones/test_planilla.py`, Back 2)

| # | Archivo | Esperado |
|---|---|---|
| 1 | Excel en español: `;`, coma decimal, `dd/mm/aaaa`, UTF-8 con BOM, solo lluvia | ok, diaria, campañas correctas |
| 2 | Google Sheets en inglés: `,`, punto decimal, `aaaa-mm-dd` | ok |
| 3 | Latin-1 con encabezados `Precipitación;Mínima;Máxima` | ok, las 3 variables reconocidas |
| 4 | Mensual `aaaa-mm` con lluvia y temperaturas | ok, mensual |
| 5 | Sin encabezado | ok, solo lluvia |
| 6 | Días sin lluvia en invierno | meses en 0 mm con aviso |
| 7 | Mes con 12 días de temperatura | temperatura de ese mes sin dato, con aviso; la lluvia sigue |
| 8 | Lluvia negativa, 350 mm en un día, `t_min > t_max`, 60 °C, fecha futura | valores o filas descartados con aviso; el resto ok |
| 9 | Mes repetido en formato mensual | error con número de fila |
| 10 | Diario y mensual mezclados | error |
| 11 | Archivo vacío, solo encabezado, o menos de 12 meses | error claro |
| 12 | Más de 1 MB o 20.000 filas | error de tamaño |
| 13 | Campaña parcial (enero–junio) | se informa, no entra en `campanas_completas` |
| 14 | Fechas `d/m/aa` | 2000s correctos |
| 15 | Columna extra `humedad_suelo` | ignorada con aviso |
| 16 | Solo temperaturas, sin lluvia | ok, `variables = [t_min_c, t_max_c]` |

## 7. Orden y dueños
| Paso | Qué | Dueño | Depende de |
|---|---|---|---|
| 0 | OK de alcance y actualizar RF15 / "Fuera de alcance" en `docs/mvp-alcance.md` | Persona 3 | — |
| 1 | Contrato (5.1) + mock | Benja | 0 |
| 2 | Parser `mediciones/planilla.py` + tests + fixtures + script de CI | Luca | 1 (puede arrancar en paralelo con modelos locales y adaptarse) |
| 3 | Ruta `POST /mediciones/planilla` + `python-multipart` (5.2) | Benja | 1; el parser se engancha cuando llega el paso 2 |
| 4 | Contraste de lluvia con la serie (5.3) + conexión (5.5) | Benja | 1 |
| 5 | Contraste de temperatura (5.4) — **Should** | Benja | 4 |
| 6 | Front: subir, vista previa, plantilla y envío en `/analizar` | Front 1 | 3 (con mock antes) |
| 7 | Regenerar `demo/rio_cuarto.json` si cambia la salida | Luca | 4 |

Los pasos 2 y 4 son independientes. El 3 junta los dos. El front puede arrancar con el mock de `ResultadoPlanilla`. Si falta tiempo, el paso 5 se corta sin afectar al resto.

**Estado (14/11, a la noche):**
- Paso 0: aprobado, MVP 4.3.
- Pasos 1, 3, 4 y 5: en `dev` (#50, #51, #52 y #54).
- Paso 2: parser en PR #55.
- Paso 6: pendiente (Front 1).
- Paso 7: después de mergear #55.

## 8. Decisiones
**Resueltas (14/11):**
- Alcance aprobado por la persona 3.
- Con más de 15 % de diferencia, la confianza baja a **"baja"**.
- Alcanza **1 año** de registro.
- Heladas y calor: diferencia de **1 de cada 3 campañas en común** (mínimo 1).
- La materia orgánica **no se usa para puntuar** (el motor no la recibe).
- La ruta es de Benja, con `python-multipart`.

**Abiertas:**
- **Front 1:** quién toma la UI y cómo convive con #18 y #45, que siguen abiertos.

## 9. Próximos pasos (fuera de esta propuesta)
- **Humedad del suelo** (sensores): no hay contraparte de NASA comparable (SMAP quedó descartado, y el índice de POWER es de 0 a 1 a 50 km), ningún indicador de la app la usa todavía y los sensores no son comparables entre sí (% volumétrico, kPa, índices; distintas profundidades y calibraciones). El parser ya queda preparado para sumarla como variable nueva.
- **Nivel de la napa** (freatímetro): muy relevante en el sur de Córdoba por el riesgo de anegamiento, pero sin contraparte de NASA a escala de lote.
- **XLSX** directo, sin exportar a CSV.
