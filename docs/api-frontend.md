# API del backend — guía para el front

Qué rutas expone el back, qué mandarles y qué devuelven. Está escrita para las personas 4 (mapa y entradas) y 5 (resultados y comparación).

> **La fuente de verdad es el código:** [`backend/app/api/contrato.py`](../backend/app/api/contrato.py) (tipos) y [`backend/app/api/rutas.py`](../backend/app/api/rutas.py) (rutas). Si este documento y el código no coinciden, manda el código y se avisa a Back 1 para corregir esto. Los tipos del front (`frontend/src/lib/contrato.ts`) copian `contrato.py`.
>
> La documentación interactiva (Swagger, con todos los esquemas y un botón "Try it out") está en `<URL del back>/docs`.

## 1. Dónde está el back

| Entorno | URL base |
|---|---|
| Local | `http://localhost:8000` (desde `backend/`: `py -m uvicorn app.main:app --reload --port 8000`) |
| Cloud Run | `https://field-shift-api-757348191517.southamerica-east1.run.app` |

- En el front, la URL va en `NEXT_PUBLIC_API_URL` (sin barra final) y `NEXT_PUBLIC_USAR_MOCK=false` para usar la API real (ver `frontend/.env.example`).
- **CORS:** el back acepta solo los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:3000`; en producción, `agropixel.earth`, `www` y las dos URL `run.app` del front). Si el front se publica en otro dominio, hay que pedirle a Back 2 que lo agregue en el deploy (`backend/DEPLOY.md`). Métodos permitidos: `GET` y `POST`.
- No hay login, ni tokens, ni cookies.

## 2. Resumen de rutas

| Método | Ruta | Para qué | Cuerpo | Respuestas |
|---|---|---|---|---|
| `GET` | `/salud` | Saber si el back está vivo | — | `200 {"estado": "ok"}` |
| `POST` | `/analizar` | Comparar la rotación actual con A, B y C | JSON `Entrada` | `200 Salida` · `422 Error` · `503 Error` · `500 Error` |
| `POST` | `/mediciones/planilla` | Leer la planilla CSV del productor | `multipart/form-data`, campo `archivo` | `200 ResultadoPlanilla` · `422 ResultadoPlanilla` · `413 Error` |

`Error` siempre es `{"mensaje": "<texto en español listo para mostrar>"}`.

**Flujo típico:**

1. (Opcional) El productor sube su planilla → `POST /mediciones/planilla` → el front muestra la vista previa y guarda `serie.meses`.
2. El usuario aprieta "Comparar" → `POST /analizar` con el lote, la rotación, las prioridades, las restricciones y (si hay) `mediciones_propias.serie_mensual = serie.meses`.
3. El front dibuja la tabla, el mapa y la línea de tiempo con la `Salida`. **Mover las barritas de prioridad no vuelve a llamar a la API** (ver 4.6).

---

## 3. `GET /salud`

Sin parámetros. Responde `{"estado": "ok"}`. Sirve para "despertar" Cloud Run al cargar la página (el primer pedido después de un rato quieto tarda más).

---

## 4. `POST /analizar`

Header `Content-Type: application/json`. **Tarda hasta ~25 s** (llama a NASA POWER y a Planetary Computer en paralelo): poné un timeout de al menos 30 s y mostrá un estado de carga.

### 4.1 Entrada

| Campo | Tipo | Obligatorio | Por defecto | Notas |
|---|---|---|---|---|
| `lote.tipo` | `"ejemplo"` \| `"dibujado"` | sí | — | `"ejemplo"` = lote de Río Cuarto; habilita la respuesta precalculada si NASA cae |
| `lote.poligono` | GeoJSON `Polygon` | sí | — | `{"type": "Polygon", "coordinates": [[[lon, lat], …]]}`. **Orden `[lon, lat]`**, mínimo 3 puntos y cerrado (el último = el primero, o sea ≥ 4 pares) |
| `lote.centro` | `[lat, lon]` | sí | — | **Ojo: acá el orden es `[lat, lon]`** (como Leaflet) |
| `lote.area_ha` | número | sí | — | Entre 1 y 20 000 |
| `lat`, `lon` | número | sí | — | Iguales a `lote.centro[0]` y `lote.centro[1]` (compatibilidad) |
| `cultivo_verano` | `soja` `maiz` `girasol` `sorgo` `mani` | sí | — | Cultivo de verano de la rotación actual |
| `invierno` | `barbecho` `trigo` `cebada` `vicia` `centeno` | sí | — | Qué hay en el invierno hoy |
| `campana_pasada` | igual que `cultivo_verano` | sí | — | Cultivo de verano de la campaña anterior |
| `calendario` | 12 × `CultivoMes` | no | `null` | Pisa el calendario automático. **Índice 0 = enero.** `CultivoMes` = los anteriores + `soja2` |
| `prioridades` | `{agua, suelo, ingreso, erosion}` | no | todas en 3 | Enteros **de 1 a 5** (no hay 0) |
| `restricciones` | lista de `sin_riego` `sin_hacienda` `maquinaria_limitada` | no | `["sin_riego"]` | |
| `no_sembrar` | lista de `vicia` `centeno` `trigo` `cebada` `sorgo` `girasol` | no | `[]` | Las alternativas que los usan salen en gris con motivo |
| `anegable` | `si` `a_veces` `no` `no_se` | no | `no_se` | |
| `textura_suelo` | `arenoso` `franco` `arcilloso` `no_se` | no | `no_se` | |
| `mediciones_propias` | objeto | no | vacío | Ver abajo |

**`mediciones_propias`** (todo opcional):

| Campo | Tipo | Notas |
|---|---|---|
| `lluvia_anual_mm` | número > 0 y ≤ 4000 | Carga a mano: lluvia anual del pluviómetro |
| `anios_registro` | entero de 1 a 100 | Años de registro del pluviómetro (define cuánto pesa frente a NASA: 1–2 años 40 %, 3–4 50 %, 5–9 60 %, 10+ 75 %) |
| `materia_organica_pct` | 0–100 | Se muestra como "dato del productor"; no puntúa |
| `serie_mensual` | lista de `MedicionMes` (hasta 480) | **Mandar tal cual `serie.meses` de `/mediciones/planilla`.** Si trae lluvia, manda sobre `lluvia_anual_mm` |

`MedicionMes` = `{"mes": "AAAA-MM", "lluvia_mm": 0–1000 | null, "t_min_c": -20–40 | null, "t_max_c": -10–50 | null}` (al menos uno no nulo; `t_min_c` es la mínima más baja del mes y `t_max_c` la máxima más alta).

**Ejemplo mínimo (lote de la demo):**

```json
{
  "lote": {
    "tipo": "ejemplo",
    "poligono": {
      "type": "Polygon",
      "coordinates": [[
        [-64.2365, -33.2447], [-64.2285, -33.2447],
        [-64.2285, -33.2507], [-64.2365, -33.2507],
        [-64.2365, -33.2447]
      ]]
    },
    "centro": [-33.2477, -64.2325],
    "area_ha": 50
  },
  "lat": -33.2477,
  "lon": -64.2325,
  "cultivo_verano": "soja",
  "invierno": "barbecho",
  "campana_pasada": "soja",
  "prioridades": {"agua": 3, "suelo": 3, "ingreso": 3, "erosion": 3},
  "restricciones": ["sin_riego"],
  "no_sembrar": [],
  "anegable": "no_se",
  "textura_suelo": "franco",
  "mediciones_propias": {}
}
```

Si un campo no cumple el esquema (ej. prioridad 0, coordenadas fuera de rango, menos de 12 meses en `calendario`), FastAPI responde **422 con su formato propio** (`{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`), no con `{mensaje}`. Eso es un error del front: validar antes de mandar.

### 4.2 Errores

| Código | Cuerpo | Cuándo | Qué mostrar |
|---|---|---|---|
| `422` | `{"mensaje"}` | El polígono no es válido, no es un lote agrícola (ESA WorldCover) o está en el hemisferio norte (latitud del centro > 0: los calendarios son del hemisferio sur) | El `mensaje` tal cual, y dejar al usuario redibujar |
| `422` | `{"detail": [...]}` | La entrada no cumple el esquema | Bug del front: revisar el pedido |
| `503` | `{"mensaje"}` | NASA POWER no respondió (lote dibujado) | El `mensaje` + botón "Probar de nuevo" |
| `500` | `{"mensaje"}` | Error inesperado del back | El `mensaje` (texto fijo) |

**Respaldo de la demo:** si NASA POWER cae y `lote.tipo` es `"ejemplo"`, la API **no** da 503: devuelve `200` con la respuesta precalculada de Río Cuarto, `es_mock: true` y el aviso como primer ítem de `informacion_falta`. Si `es_mock` es `true`, el front debería mostrarlo (ej. una franja "Datos precalculados").

### 4.3 Salida: campos de primer nivel

| Campo | Tipo | Qué es | Dónde va |
|---|---|---|---|
| `lote` | `LoteSalida` | Área, localidad, pendiente y % de cultivo | Encabezado del lote |
| `visto_por_satelite` | `VistoPorSatelite` | NDVI del lote mes a mes en la última campaña | Línea de tiempo / bloque "visto por satélite" |
| `indicadores` | `dict[str, Indicador]` | Indicadores del lote y del clima | Tabla, fila de contexto |
| `contraste_mediciones` | lista de `ContrasteMedicion` | El productor al lado de NASA | Bloque "Tus mediciones" |
| `clima_celda` | `ClimaCelda` | Recuadro de la celda de NASA POWER | Mapa (dibujar a escala real, ~50 km) |
| `clima_mensual` | `ClimaMensual` | Climatología de 30 campañas, 12 meses | Línea de tiempo de 12 meses |
| `tipos_de_anio` | `TiposDeAnio` | Qué campañas son secas, normales y húmedas | Selector de tipo de año |
| `serie_anual` | `SerieAnual` \| `null` | Lluvia y balance por campaña | Gráfico de 30 campañas |
| `capas` | `Capas` | Capas del mapa ya calculadas | Mapa |
| `estrategias` | 4 × `Estrategia` | Siempre `actual`, `A`, `B`, `C` en ese orden | **Tabla de comparación** |
| `choque` | `Choque` | Si las prioridades chocan entre sí | Aviso arriba de la tabla |
| `periodo_clima` | texto | Ej. `"1996/97 a 2025/26"` | Pie de la tabla |
| `informacion_falta` | lista de textos | Faltantes generales | Bloque "Información que falta" |
| `aviso` | texto | "Herramienta de apoyo: no reemplaza…" | **Siempre visible** |
| `es_mock` | bool | `true` si es la respuesta precalculada/mock | Franja de aviso |

**Convenciones que valen para toda la salida:**

- **Todo array de 12 meses tiene índice 0 = enero.** La campaña julio–junio solo ordena la serie anual y los terciles.
- Los meses sueltos (`mes`, `meses_*`) también son índices 0–11, salvo donde dice `"AAAA-MM"`.
- Los textos (`resumen`, `por_que`, `texto`, `motivo`…) ya vienen redactados en español: **se muestran tal cual**, no se rearman en el front.
- `null` significa "no hay dato": mostrar "sin dato", nunca 0.

### 4.4 `Indicador` (cada valor numérico de NASA)

```json
{
  "valor": 819,
  "unidad": "mm/campaña",
  "fuente": "NASA POWER mensual (comunidad AG)",
  "anios": "1996/97 a 2025/26",
  "resolucion": "~50 km (0,5° × 0,625°)",
  "confianza": "media",
  "motivo": null,
  "nota": "Media de 30 campañas julio–junio; celda de ~50 km: contexto regional"
}
```

- `confianza`: `alta` \| `media` \| `baja` \| `sin_dato`. Con `sin_dato`, `valor` es `null` y `motivo` dice por qué.
- Claves actuales de `indicadores`: `lluvia_anual`, `meses_helada_frecuente`, `et0_anual`, `balance_anual`, `et_real_anual`, `meses_cobertura_baja`, `riesgo_erosion`. Puede faltar alguna (ej. `riesgo_erosion` si no hubo pendiente): iterar sobre las que vengan.
- `riesgo_erosion` trae además `pendiente_pct`, `meses_cobertura_baja` y `meses_bajos` (extras de Back 2).

`lote` usa el mismo `Indicador` en `pendiente_pct`, `pendiente_maxima_pct` (puede ser `null`) y `cobertura_agricola_pct`.

### 4.5 `estrategias` (las 4 columnas)

Siempre 4, en orden `actual`, `A`, `B`, `C`. Campos:

| Campo | Notas |
|---|---|
| `id`, `nombre`, `especies` | Ej. `"A"`, `"Cobertura de invierno"`, `"Soja + vicia"` |
| `disponible` | `false` → **columna en gris** con `motivo_descarte`; los campos numéricos vienen `null` |
| `calendario` | 12 × `CultivoMes`, índice 0 = enero |
| `resumen` | Una línea descriptiva |
| `valores` | `agua_mm` (balance en año normal), `meses_cobertura_baja`, `aporte_n`, `rastrojo`, `erosion`, `ingreso`, `conflictos_helada_calor` (`meses_helada_frecuente`, `meses_conflicto_helada`, `meses_calor`, todos índices de mes) |
| `puntos` | 0–100 por objetivo: `agua` por tipo de año (`{seco, normal, humedo}`), `suelo`, `erosion`, `ingreso`. Es lo que usa el recálculo de cercanía |
| `valores_por_tipo_anio` | `{seco, normal, humedo}` → `{agua_mm, lluvia_mm, uso_mm, cercania}` |
| `diferencia_vs_actual` | `{agua, suelo, erosion, ingreso}` en puntos (en `actual` es todo 0) |
| `cercania` | Cercanía en año normal con las prioridades que se mandaron |
| `cercania_objetivos` | Cercanía por objetivo |
| `sensible_clima` | `true` → marcar "sensible al clima" |
| `probabilidades` | Lista de `Probabilidad`: `{evento: "helada"\|"siembra_seca"\|"calor", mes, cultivo, anios, de, pct, texto, fuente, contraste}`. **Mostrar siempre el conteo** (`texto` ya lo trae: "14 de 30 años (47 %)") y, si hay, `contraste` debajo |
| `por_que`, `evidencia`, `beneficios`, `vacios`, `riesgos` | **Los 5 puntos de cada columna**: por qué, evidencia, beneficios, información que falta y a revisar con el agrónomo |
| `que_le_falta`, `reglas_aplicadas` | Trazabilidad (`reglas_aplicadas`: `{regla, efecto, dato}`) |

### 4.6 Recalcular la cercanía sin llamar a la API

Cuando el usuario mueve las barritas, el front recalcula con `puntos` (misma fórmula que el motor, prioridades al cuadrado):

```ts
const OBJ = ["agua", "suelo", "erosion", "ingreso"] as const;
function cercania(p: Puntos, prio: Prioridades, tipo: "seco" | "normal" | "humedo") {
  const valor = { agua: p.agua[tipo], suelo: p.suelo, erosion: p.erosion, ingreso: p.ingreso };
  let num = 0, den = 0;
  for (const o of OBJ) { const w = prio[o] ** 2; num += w * valor[o]; den += w; }
  return Math.round(num / den);
}
```

Las columnas con `disponible: false` no tienen `puntos` y no se recalculan. Lo que **sí** cambia al mover barritas en el back (especies elegidas para A, B y C) solo se actualiza volviendo a llamar a `/analizar`.

### 4.7 Clima y tipos de año

- `clima_mensual` (12 meses, 0 = enero): `lluvia_mm`, `minima_media_c`, `maxima_media_c`, `t_media_c?`, `amplitud_diaria_c?`, `et0_mm`, `balance_mm`, `anios_con_helada`, `anios_con_35c`, `helada_frecuente` + `n_anios`, `periodo`, `fuente`, `resolucion`.
- `tipos_de_anio`: `metodo` (`terciles_balance` o `terciles_lluvia`), listas de campañas `seco`/`normal`/`humedo` (ej. `"2008/09"`), `umbral_seco_mm`, `umbral_humedo_mm`.
- `serie_anual` (puede ser `null`): `campanas` = `[{campana, lluvia_mm, balance_mm, tipo, mensual}]`, más `ultimas_10_mm`, `previas_20_mm`, `secos_en_ultimas_10`.
  - `mensual` (4.5, para elegir una campaña en Clima histórico): `{lluvia_mm[12], t_min_c[12], t_max_c[12], et0_mm[12] | null, balance_mm[12] | null}`, redondeados a 0,1. **Índice 0 = enero**, como el resto del contrato: en la campaña `2024/25`, el índice 0 es enero de 2025 y el 6 es julio de 2024; para dibujarla de julio a junio, rotar con `[6..11, 0..5]`. `et0_mm` y `balance_mm` van `null` si falta la ET0. Se compara contra `clima_mensual` (media de las 30 campañas, misma celda y período): `t_min_c` y `t_max_c` son la mínima más baja y la máxima más alta del mes (extremos de POWER), así que van contra `minima_media_c` y `maxima_media_c`, no contra `t_media_c`. Puede venir `null`: en ese caso, deshabilitar la selección.
- `clima_celda.bbox` = `[oeste, sur, este, norte]` (**ojo: orden distinto a `bounds` de las capas**).

### 4.8 `visto_por_satelite`

- `meses`: 12 × (`MesSatelite` \| `null`), índice 0 = enero. `MesSatelite` = `{mes, fecha, ndvi_medio, nubes_escena, coleccion, item, pixeles, fuente}`.
- `campana`, `fuente`, `meses_ndvi_bajo`, `meses_con_dato`, `umbral` (0,3), `confianza`, `motivo`.
- `faltantes`: `[{mes: "AAAA-MM", motivo}]` → a "Información que falta".

### 4.9 `capas` (mapa)

El back calcula, el front solo dibuja (`docs/plan-armonizacion-capas.md`).

| Campo | Qué es |
|---|---|
| `grilla` | `{bounds, ancho, alto, paso}` común a todas las capas raster, o `null` |
| `pendiente_mapa`, `cultivo_mapa`, `erosion_mapa` | `CapaRaster` o `null` |
| `ndvi_mensual` | 12 × (`{coleccion, item, fecha, mapa: CapaRaster \| null}` \| `null`), 0 = enero |
| `erosion` | Mismo objeto que `indicadores.riesgo_erosion`, o `null` |
| `agua_regional_mensual`, `heladas_regional_mensual` | 12 valores regionales, o `null` |
| `no_disponibles` | Nombres de capas que no se pudieron calcular (mostrarlas deshabilitadas) |

**`CapaRaster`:**

- `bounds` = `[[sur, oeste], [norte, este]]` (listo para `L.latLngBounds` / `ImageOverlay`).
- `png`: imagen en base64, ya pintada y transparente fuera del lote → `<ImageOverlay url={"data:image/png;base64," + png} bounds={bounds} />`.
- `escala` = `{cortes, colores, etiquetas}` (una entrada por clase): **la leyenda sale de acá**, no se repite en el front.
- `resumen` = `{media, min, max, pixeles, valor_lote}`. La leyenda muestra `valor_lote` como "el valor del lote".
- `id`, `titulo`, `unidad`, `fuente`, `fecha`, `campana`, `resolucion_nativa`, `resolucion_grilla`, `confianza`, `nota`.
- `valores` (opcional): para "tocar un píxel". Base64 de `ancho × alto` enteros int16 little-endian, por filas, **fila 0 = norte, columna 0 = oeste**. Valor real = entero × `factor`; `nodata` (−32768) = sin valor.

```ts
function valorEn(capa: CapaRaster, lat: number, lon: number): number | null {
  if (!capa.valores) return null;
  const [[sur, oeste], [norte, este]] = capa.bounds;
  const col = Math.floor(((lon - oeste) / (este - oeste)) * capa.ancho);
  const fila = Math.floor(((norte - lat) / (norte - sur)) * capa.alto);
  if (col < 0 || fila < 0 || col >= capa.ancho || fila >= capa.alto) return null;
  const bytes = Uint8Array.from(atob(capa.valores), (c) => c.charCodeAt(0));
  const v = new DataView(bytes.buffer).getInt16((fila * capa.ancho + col) * 2, true);
  return v === capa.nodata ? null : v * capa.factor;
}
```

(Decodificar `valores` una sola vez por capa y cachear el `DataView`.)

### 4.10 `contraste_mediciones`

Vacío si no se mandaron mediciones. Cada ítem:

- `indicador`, `valor_productor`, `valor_nasa` (`null` = "dato del productor", ej. materia orgánica), `unidad`, `diferencia_pct`, `confianza_resultante` (`alta` \| `baja` \| `null`), `texto` (la línea para mostrar).
- Con planilla: `campanas_comparadas` y `detalle_campanas` = `[{campana, productor, nasa, diferencia}]` para la mini tabla.
- En filas de helada y calor, `mes` (0 = enero).

El contraste **no cambia puntajes**; la mezcla del productor ya viene aplicada en `estrategias`.

### 4.11 `choque`

`{hay, objetivos, texto}`. `hay` es `true` cuando los 2 objetivos con más prioridad (el segundo en 4 o más) quedan más altos en columnas distintas; `objetivos` dice cuáles. Si `hay`, mostrar `texto` arriba de la tabla.

---

## 5. `POST /mediciones/planilla`

Lee la planilla CSV del productor y devuelve la serie mensual para mandar después en `/analizar`. **No guarda el archivo ni llama a NASA** (responde rápido).

**Pedido:** `multipart/form-data` con un único campo **`archivo`**. Máximo **1 MB**. No poner el header `Content-Type` a mano (lo arma el navegador con el `boundary`).

```ts
const form = new FormData();
form.append("archivo", file); // File del <input type="file" accept=".csv">
const r = await fetch(`${API_URL}/mediciones/planilla`, { method: "POST", body: form });
const datos = await r.json(); // ResultadoPlanilla (200/422) o {mensaje} (413)
```

**Formato del CSV** (detalle en [plan-planilla-lluvia.md](plan-planilla-lluvia.md)): encabezado `fecha;lluvia_mm;t_min_c;t_max_c` (columnas de medición opcionales, al menos una), separador `;` `,` o tabulación, decimal con coma o punto, fechas diarias `dd/mm/aaaa` o mensuales. Columnas extra se ignoran con aviso.

**Respuestas:**

| Código | Cuerpo | Qué hacer |
|---|---|---|
| `200` | `ResultadoPlanilla` con `ok: true` | Mostrar la vista previa y guardar `serie.meses` |
| `422` | `ResultadoPlanilla` con `ok: false` | Mostrar `errores` (`{fila, motivo}`; `fila: null` = error del archivo entero) |
| `413` | `{"mensaje": "La planilla supera 1 MB"}` | Mostrar el mensaje |

**`ResultadoPlanilla`:**

```json
{
  "ok": true,
  "serie": {
    "meses": [{"mes": "2022-07", "lluvia_mm": 4.0, "t_min_c": -4.1, "t_max_c": 24.0}, "…"],
    "variables": ["lluvia_mm", "t_min_c", "t_max_c"],
    "granularidad": "diaria",
    "periodo": {"desde": "2022-07", "hasta": "2023-06"},
    "campanas_completas": {"lluvia_mm": ["2022/23"], "t_min_c": ["2022/23"], "t_max_c": ["2022/23"]},
    "lluvia_media_campana_mm": 702.5,
    "filas_leidas": 365,
    "filas_usadas": 363,
    "avisos": [{"fila": 12, "motivo": "…"}],
    "formato": {"codificacion": "utf-8", "separador": ";", "decimal": ","}
  },
  "errores": []
}
```

- `avisos` no impiden usar la planilla (mostrarlos como advertencias); `errores` sí.
- Para la vista previa: `periodo`, `campanas_completas`, `lluvia_media_campana_mm`, `filas_usadas` de `filas_leidas`.
- Después, en `/analizar`: `mediciones_propias.serie_mensual = serie.meses`. Se puede sumar `materia_organica_pct` a mano; `anios_registro` no hace falta con planilla.

---

## 6. Ejemplos con curl

```bash
curl -s http://localhost:8000/salud
```

```bash
curl -s -X POST http://localhost:8000/analizar -H "Content-Type: application/json" -d @entrada.json
```

```bash
curl -s -X POST http://localhost:8000/mediciones/planilla -F "archivo=@planilla.csv"
```

## 7. Mocks para trabajar sin back

- `backend/app/api/mock_rio_cuarto.json`: una `Salida` completa (indicadores ilustrativos, `es_mock: true`).
- `backend/app/demo/rio_cuarto.json`: la respuesta real precalculada del lote de ejemplo.
- `backend/app/api/mock_planilla.json`: un `ResultadoPlanilla` de ejemplo.

## 8. Si cambia el contrato

Lo cambia Back 1 en `contrato.py` y en los mocks en el mismo commit, avisa a los dos front y a Back 2, y actualiza este documento. El front actualiza `src/lib/contrato.ts` y `src/mocks/analizar.ts`.
