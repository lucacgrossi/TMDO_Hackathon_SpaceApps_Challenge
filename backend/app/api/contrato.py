"""
Contrato de POST /analizar (dueño: Back 1).

Es la única pieza que comparten el back y el front: si cambia, se cambia acá
y en `app/api/mock.py` en el mismo commit, y se avisa a los dos front y a Back 2.

Decisiones (14/11, MVP 4.2):
- Todo array de 12 meses va con índice 0 = enero (igual que el motor y el
  calendario del front). La campaña julio–junio solo ordena la serie anual
  y los terciles.
- La entrada sigue `docs/mvp-alcance.md`: polígono GeoJSON en [lon, lat] y
  nombres en snake_case. El front convierte desde su store.
- Los nombres de la salida siguen el MVP; `servicio.py` traduce la salida del
  motor de reglas a estos nombres.
- Cada valor numérico de NASA viaja como `Indicador`, con unidad, fuente,
  años, resolución y confianza (principio "técnico por defecto").
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

# --- Tipos básicos -----------------------------------------------------------

Confianza = Literal["alta", "media", "baja", "sin_dato"]
TipoAnio = Literal["seco", "normal", "humedo"]
Objetivo = Literal["agua", "suelo", "erosion", "ingreso"]

# Claves de `app/motor/cultivos.py` (persona 3). Si el motor suma un cultivo,
# se suma acá y en el front.
CultivoVerano = Literal["soja", "maiz", "girasol", "sorgo", "mani"]
CultivoInvierno = Literal["barbecho", "trigo", "cebada", "vicia", "centeno"]
CultivoNoSembrar = Literal["vicia", "centeno", "trigo", "cebada", "sorgo", "girasol"]
# Lo que puede ocupar un mes del calendario (incluye soja de 2ª).
CultivoMes = Literal[
    "soja", "soja2", "maiz", "girasol", "sorgo", "mani",
    "trigo", "cebada", "vicia", "centeno", "barbecho",
]
Restriccion = Literal["sin_riego", "sin_hacienda", "maquinaria_limitada"]

def _doce():
    """Campo obligatorio de 12 meses (índice 0 = enero)."""
    return Field(min_length=12, max_length=12, description="12 meses, índice 0 = enero")


class Indicador(BaseModel):
    """Un valor con todo lo que hace falta para rastrearlo hasta el dato."""

    valor: float | int | str | None
    unidad: str
    fuente: str
    anios: str | None = Field(None, description='Período del dato, ej. "1995/96–2024/25"')
    resolucion: str
    confianza: Confianza
    motivo: str | None = Field(None, description="Por qué falta o por qué la confianza es baja")
    nota: str | None = Field(None, description="Cómo se calculó (ej. píxeles usados), para trazabilidad")


# --- Entrada -----------------------------------------------------------------

class PoligonoGeoJSON(BaseModel):
    """GeoJSON Polygon. Coordenadas en [lon, lat], primer anillo = borde del lote."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(min_length=1)

    @model_validator(mode="after")
    def _anillo_valido(self):
        anillo = self.coordinates[0]
        if len(anillo) < 4:
            raise ValueError("El polígono necesita al menos 3 puntos y cerrar en el primero")
        for lon, lat in anillo:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Coordenadas fuera de rango: van en [lon, lat]")
        return self


class Lote(BaseModel):
    tipo: Literal["ejemplo", "dibujado"]
    poligono: PoligonoGeoJSON
    centro: tuple[float, float] = Field(description="Centroide en [lat, lon]")
    area_ha: float = Field(ge=1, le=20000)


class Prioridades(BaseModel):
    """Barritas de 1 (poco) a 5 (mucho). Por defecto 3 (RF4).

    Eligen las especies de A, B y C y pesan al cuadrado en la cercanía (una 5 pesa 25 veces una 1).
    Decisión 14/11 aprobada por la persona 3: ya no hay 0 (antes dejaba afuera el objetivo).
    """

    agua: int = Field(3, ge=1, le=5)
    suelo: int = Field(3, ge=1, le=5)
    ingreso: int = Field(3, ge=1, le=5)
    erosion: int = Field(3, ge=1, le=5)


class MedicionMes(BaseModel):
    """Un mes de la planilla del productor (`docs/plan-planilla-lluvia.md`).

    En temperaturas, `t_min_c` es la mínima MÁS BAJA del mes y `t_max_c` la máxima MÁS ALTA:
    lo mismo que T2M_MIN / T2M_MAX de NASA POWER mensual (extremos del mes).
    """

    mes: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="AAAA-MM")
    lluvia_mm: float | None = Field(None, ge=0, le=1000)
    t_min_c: float | None = Field(None, ge=-20, le=40)
    t_max_c: float | None = Field(None, ge=-10, le=50)

    @model_validator(mode="after")
    def _al_menos_una_variable(self):
        if self.lluvia_mm is None and self.t_min_c is None and self.t_max_c is None:
            raise ValueError(f"El mes {self.mes} no trae lluvia ni temperaturas")
        return self


class MedicionesPropias(BaseModel):
    """Mediciones del productor (RF15). Se muestran al lado de NASA; no cambian puntajes."""

    lluvia_anual_mm: float | None = Field(None, gt=0)
    anios_registro: int | None = Field(None, ge=1)
    materia_organica_pct: float | None = Field(None, ge=0, le=100)
    serie_mensual: list[MedicionMes] | None = Field(
        None, max_length=480,
        description="Meses de la planilla (`SeriePlanilla.meses`), hasta 40 años. Si trae lluvia, manda sobre "
                    "`lluvia_anual_mm`")


class Entrada(BaseModel):
    lote: Lote
    lat: float = Field(ge=-90, le=90, description="= lote.centro[0], por compatibilidad")
    lon: float = Field(ge=-180, le=180, description="= lote.centro[1], por compatibilidad")
    cultivo_verano: CultivoVerano
    invierno: CultivoInvierno
    campana_pasada: CultivoVerano
    calendario: list[CultivoMes] | None = Field(
        None, min_length=12, max_length=12,
        description="Opcional (RF3): pisa al calendario automático. Índice 0 = enero",
    )
    prioridades: Prioridades = Prioridades()
    restricciones: list[Restriccion] = ["sin_riego"]
    no_sembrar: list[CultivoNoSembrar] = []
    anegable: Literal["si", "a_veces", "no", "no_se"] = "no_se"
    textura_suelo: Literal["arenoso", "franco", "arcilloso", "no_se"] = "no_se"
    mediciones_propias: MedicionesPropias = MedicionesPropias()


# --- Salida: lote, satélite y clima -----------------------------------------

class LoteSalida(BaseModel):
    localidad_aprox: str | None
    area_ha: float
    pendiente_pct: Indicador = Field(description="Pendiente general: plano ajustado (satelite/elevacion.py)")
    pendiente_maxima_pct: Indicador | None = Field(None, description="Percentil 95 por píxel; ruidoso")
    cobertura_agricola_pct: Indicador = Field(description="% del lote que es cultivo (satelite/cobertura.py)")


class MesSatelite(BaseModel):
    """Un mes de `satelite/ndvi.py`, tal cual lo devuelve Back 2."""

    mes: str | None = Field(None, description="AAAA-MM")
    fecha: str = Field(description="Fecha de la escena, AAAA-MM-DD")
    ndvi_medio: float
    nubes_escena: float | None = Field(
        None, description="% de nubes de la escena HLS; None en MODIS (compuesto de 16 días)")
    coleccion: str | None = Field(None, description='"hls2-s30", "hls2-l30" o "modis-13Q1-061"')
    item: str | None = Field(None, description="Id del item STAC, para armar las teselas")
    pixeles: int | None = Field(None, description="Píxeles del lote que entraron en la media")
    fuente: str = Field(description="Texto completo de la fuente; dice si cayó a MODIS de respaldo")


class Faltante(BaseModel):
    mes: str = Field(description="AAAA-MM")
    motivo: str


class VistoPorSatelite(BaseModel):
    """RF14: NDVI medio del lote en cada mes de la última campaña (`satelite/ndvi.py`)."""

    campana: str | None
    fuente: str = Field(description='"NASA HLS 30 m" o "NASA HLS 30 m + MODIS 250 m (respaldo en N de 12 meses)"')
    meses: list[MesSatelite | None] = _doce()
    meses_ndvi_bajo: int | None
    meses_con_dato: int = Field(description="Lo cuenta servicio.py a partir de `meses`")
    umbral: float = 0.3
    confianza: Confianza = Field(description="La del indicador meses_cobertura_baja")
    motivo: str | None = Field(None, description="Motivo o nota del indicador meses_cobertura_baja")
    faltantes: list[Faltante] = Field([], description='Meses sin dato, para "Información que falta"')
    orden_meses: str | None = None


class CorregidoAlLado(BaseModel):
    umbral_seco_mm: float | None
    nota: str


class DetalleCampana(BaseModel):
    """Una campaña en común entre la planilla del productor y NASA POWER."""

    campana: str
    productor: float
    nasa: float
    diferencia: int | None = Field(None, description="% en lluvia; en helada y calor, productor − NASA (0 o 1)")


class ContrasteMedicion(BaseModel):
    """RF15: medición del productor al lado de NASA. No cambia ningún puntaje.

    Sin valor de NASA (`valor_nasa` None) la fila es "dato del productor": la materia
    orgánica (no hay fuente NASA) o la lluvia cuando NASA POWER no respondió.
    """

    indicador: str
    valor_productor: float
    valor_nasa: float | None = Field(None, description="None: dato del productor, sin valor de NASA para comparar")
    unidad: str
    diferencia_pct: int | None = Field(None, description="(productor − NASA) / NASA · 100; None si no hay NASA")
    confianza_resultante: Literal["alta", "baja"] | None = Field(
        None, description="Diferencia > 15 % o pocos años de registro → baja; None si no hay comparación")
    corregido_al_lado: CorregidoAlLado | None = None
    texto: str
    campanas_comparadas: list[str] | None = Field(
        None, description='Campañas en común con NASA (planilla), ej. ["2018/19", "2019/20"]')
    detalle_campanas: list[DetalleCampana] | None = Field(
        None, description="Productor y NASA por campaña, para la mini tabla del front (planilla)")
    mes: int | None = Field(None, ge=0, le=11, description='Mes (0 = enero) en las filas "helada" y "calor"')


# --- Planilla de mediciones (POST /mediciones/planilla) ---------------------

class AvisoFila(BaseModel):
    fila: int | None = Field(None, description="Número de fila del archivo; None si es del archivo entero")
    motivo: str


class PeriodoPlanilla(BaseModel):
    desde: str = Field(description="AAAA-MM")
    hasta: str = Field(description="AAAA-MM")


class FormatoPlanilla(BaseModel):
    codificacion: str
    separador: str
    decimal: str


class SeriePlanilla(BaseModel):
    """Lo que el parser (`app/mediciones/planilla.py`, Back 2) leyó de la planilla."""

    meses: list[MedicionMes] = Field(description="Cronológico. Es lo que el front manda en `serie_mensual`")
    variables: list[Literal["lluvia_mm", "t_min_c", "t_max_c"]]
    granularidad: Literal["diaria", "mensual"]
    periodo: PeriodoPlanilla
    campanas_completas: dict[Literal["lluvia_mm", "t_min_c", "t_max_c"], list[str]] = Field(
        description="Campañas julio–junio con los 12 meses, por variable")
    lluvia_media_campana_mm: float | None = None
    filas_leidas: int
    filas_usadas: int
    avisos: list[AvisoFila] = []
    formato: FormatoPlanilla


class ResultadoPlanilla(BaseModel):
    """Respuesta de POST /mediciones/planilla: 200 si `ok`, 422 si no."""

    ok: bool
    serie: SeriePlanilla | None = None
    errores: list[AvisoFila] = []


class ClimaCelda(BaseModel):
    """Celda de NASA POWER (0,5° × 0,625°), para dibujarla a la escala real del dato."""

    bbox: tuple[float, float, float, float] = Field(description="[oeste, sur, este, norte]")
    posicion_lote: str
    resolucion: str = "~50 km (0,5° × 0,625°)"


class ClimaMensual(BaseModel):
    """Climatología de las 30 campañas. Índice 0 = enero."""

    lluvia_mm: list[float] = _doce()
    minima_media_c: list[float] = Field(
        min_length=12, max_length=12,
        description="Promedio de 30 años de la mínima MÁS BAJA de cada mes (T2M_MIN es extremo del mes)")
    maxima_media_c: list[float] = Field(
        min_length=12, max_length=12,
        description="Promedio de 30 años de la máxima MÁS ALTA de cada mes (T2M_MAX es extremo del mes)")
    t_media_c: list[float] | None = Field(
        None, min_length=12, max_length=12, description="Temperatura media del mes (T2M), promedio de 30 años")
    amplitud_diaria_c: list[float] | None = Field(
        None, min_length=12, max_length=12,
        description="Amplitud térmica diaria media (T2M_RANGE), promedio de 30 años; la usa Hargreaves")
    et0_mm: list[float | None] = _doce()
    balance_mm: list[float | None] = _doce()
    anios_con_helada: list[int] = _doce()
    anios_con_35c: list[int] = _doce()
    helada_frecuente: list[bool] = _doce()
    n_anios: int
    periodo: str
    fuente: str
    resolucion: str


class TiposDeAnio(BaseModel):
    metodo: Literal["terciles_balance", "terciles_lluvia"]
    seco: list[str] = Field(description='Campañas, ej. "2008/09"')
    normal: list[str]
    humedo: list[str]
    umbral_seco_mm: float = Field(description="Valor máximo del tercio seco (de balance o de lluvia, según el método)")
    umbral_humedo_mm: float = Field(description="Valor mínimo del tercio húmedo")


class CampanaSerie(BaseModel):
    campana: str
    lluvia_mm: float
    balance_mm: float | None
    tipo: TipoAnio


class SerieAnual(BaseModel):
    """RF24 (Could): describe, no proyecta."""

    fuente: str
    resolucion: str
    periodo: str
    campanas: list[CampanaSerie]
    ultimas_10_mm: float
    previas_20_mm: float
    secos_en_ultimas_10: int


# --- Capas del mapa sobre la grilla común del lote (docs/plan-armonizacion-capas.md, 5) ---

Bounds = list[list[float]]  # [[sur, oeste], [norte, este]], como `L.latLngBounds` de Leaflet


def _validar_bounds(bounds: Bounds) -> Bounds:
    if len(bounds) != 2 or any(len(p) != 2 for p in bounds):
        raise ValueError("bounds va como [[sur, oeste], [norte, este]]")
    (sur, oeste), (norte, este) = bounds
    if not (sur < norte and oeste < este):
        raise ValueError("bounds: sur < norte y oeste < este")
    return bounds


class EscalaCapa(BaseModel):
    """Escala de clases de la capa: la usa la leyenda del front (no la repite)."""

    cortes: list[float] = Field(min_length=1, description="Límite inferior de cada clase")
    colores: list[str] = Field(min_length=1, description="Hex, uno por clase")
    etiquetas: list[str] = Field(min_length=1, description="Una por clase")

    @model_validator(mode="after")
    def _una_por_clase(self):
        if not len(self.cortes) == len(self.colores) == len(self.etiquetas):
            raise ValueError("cortes, colores y etiquetas tienen que tener el mismo largo (una entrada por clase)")
        return self


class ResumenCapa(BaseModel):
    """Resumen del raster dentro de la máscara del lote: el número del lote sale de acá."""

    media: float | None
    min: float | None
    max: float | None
    pixeles: int = Field(ge=0, description="Píxeles dentro del lote con dato")
    valor_lote: float | None = Field(
        None, description="El número de la tabla para esta capa (NDVI medio del mes, pendiente general del plano, "
                          "% de cultivo). Puede no ser la media por píxel: la pendiente del plano (0,6 %) no es la "
                          "media de las pendientes por píxel (1,3 %). La leyenda muestra este valor como el del lote")


class CapaRaster(BaseModel):
    """Una capa del mapa ya calculada por el back sobre la grilla del lote. El front solo la dibuja.

    `png` (base64) se superpone con `bounds` (transparente fuera del lote). `valores` (base64) son
    `ancho × alto` enteros int16 little-endian (`<i2`) por filas, **fila 0 = norte** y **columna 0 =
    oeste**; valor real = entero × `factor`, y `nodata` no tiene valor (RF18: tocar un píxel).
    """

    id: str = Field(description='"pendiente" | "cultivo" | "ndvi" | "erosion"')
    titulo: str
    unidad: str
    fuente: str
    fecha: str | None = Field(None, description='Fecha de la escena (NDVI) o "estática"')
    campana: str | None = None
    resolucion_nativa: str = Field(description='"30 m", "250 m (MODIS, respaldo)", …')
    resolucion_grilla: str = Field(description='"1″ (~30 m)" o "2″ (~60 m)" en lotes grandes')
    bounds: Bounds = Field(description="[[sur, oeste], [norte, este]]; iguales para todas las capas del lote")
    ancho: int = Field(ge=1)
    alto: int = Field(ge=1)
    png: str = Field(description="PNG en base64, pintado con `escala`; transparente fuera del lote")
    valores: str | None = Field(None, description="Base64 de int16 little-endian por filas (fila 0 = norte)")
    factor: float = Field(1.0, gt=0, description="Valor real = entero × factor")
    nodata: int = -32768
    escala: EscalaCapa
    resumen: ResumenCapa
    confianza: Confianza
    nota: str | None = None

    @model_validator(mode="after")
    def _forma(self):
        _validar_bounds(self.bounds)
        return self


class GrillaLote(BaseModel):
    """Grilla común del lote (EPSG:4326, paso de 1″ o 2″): todas las capas la comparten."""

    bounds: Bounds
    ancho: int = Field(ge=1)
    alto: int = Field(ge=1)
    paso: float = Field(gt=0, description="Grados: 1/3600 (1″, ~30 m) o 2/3600 (2″, ~60 m)")

    @model_validator(mode="after")
    def _forma(self):
        _validar_bounds(self.bounds)
        return self


class CapaNdviMes(BaseModel):
    """Escena HLS del mes, para que el front arme las teselas sin repetir la búsqueda."""

    coleccion: str
    item: str
    fecha: str
    mapa: CapaRaster | None = Field(None, description="Raster del mes sobre la grilla del lote (paso 4)")


class Capas(BaseModel):
    erosion: dict | None = Field(None, description="Índice de erosión del lote (satelite/capas.py)")
    ndvi_mensual: list[CapaNdviMes | None] = _doce()
    agua_regional_mensual: list[float] | None = None
    heladas_regional_mensual: list[int] | None = None
    no_disponibles: list[str] = []
    # Capas armonizadas (todas opcionales: sin ellas el front sigue con lo de hoy).
    grilla: GrillaLote | None = None
    pendiente_mapa: CapaRaster | None = None
    cultivo_mapa: CapaRaster | None = None
    erosion_mapa: CapaRaster | None = None

    def capas_raster(self) -> list[CapaRaster]:
        """Todas las `CapaRaster` presentes (para chequear que coinciden con `grilla`)."""
        return [c for c in (self.pendiente_mapa, self.cultivo_mapa, self.erosion_mapa,
                            *(m.mapa for m in self.ndvi_mensual if m is not None)) if c is not None]


# --- Salida: las 4 estrategias ----------------------------------------------

class PorTipo(BaseModel):
    seco: int
    normal: int
    humedo: int


class Puntos(BaseModel):
    """
    Puntos de 0 a 100 por dimensión (RF13). Con esto el front recalcula la
    cercanía al mover las barritas, sin volver a llamar a la API:
        cercania(tipo) = round(Σ prioridad[o]² · valor[o] / Σ prioridad[o]²)
    con prioridades de 1 a 5, donde valor["agua"] = agua[tipo] y el resto no cambia con el
    tipo de año. Es la fórmula de `app/motor/reglas.py` (EXPONENTE_PRIORIDAD = 2).
    """

    agua: PorTipo
    suelo: int
    erosion: int
    ingreso: int


class ConflictosHeladaCalor(BaseModel):
    meses_helada_frecuente: list[int] = Field(description="Índices de mes (0 = enero)")
    meses_conflicto_helada: list[int] = Field(description="Helada frecuente con cultivo sensible")
    meses_calor: list[int] = Field(description="Cultivo de verano con ≥ 35 °C en la mitad de los años")


class Valores(BaseModel):
    agua_mm: int = Field(description="Balance de agua de la campaña en años normales (mm)")
    meses_cobertura_baja: int
    aporte_n: int
    rastrojo: int
    erosion: int
    ingreso: int
    conflictos_helada_calor: ConflictosHeladaCalor


class ValoresTipoAnio(BaseModel):
    agua_mm: int = Field(description="Balance de agua en ese tipo de año (mm)")
    lluvia_mm: int
    uso_mm: int
    cercania: int | None


class Diferencia(BaseModel):
    agua: int
    suelo: int
    erosion: int
    ingreso: int


class ReglaAplicada(BaseModel):
    regla: str
    efecto: dict[str, float]
    dato: str


class Probabilidad(BaseModel):
    """RF25: frecuencia observada en las 30 campañas. Siempre con el conteo de años."""

    evento: Literal["helada", "siembra_seca", "calor"]
    mes: int = Field(ge=0, le=11)
    cultivo: str
    anios: int
    de: int
    pct: int
    texto: str
    fuente: str
    contraste: str | None = Field(
        None, description='Línea del productor para el mismo mes y evento, ej. "Tu estación: helada en mayo en '
                          '4 de 6 campañas". No cambia la probabilidad (sale de NASA)')


class Estrategia(BaseModel):
    id: Literal["actual", "A", "B", "C"]
    nombre: str
    especies: str
    disponible: bool
    motivo_descarte: str | None
    calendario: list[CultivoMes] | None = Field(None, description="12 meses, índice 0 = enero")
    resumen: str
    # Lo siguiente es None cuando la estrategia está descartada (columna en gris).
    valores: Valores | None = None
    puntos: Puntos | None = None
    valores_por_tipo_anio: dict[TipoAnio, ValoresTipoAnio] | None = None
    diferencia_vs_actual: Diferencia | None = None
    cercania: int | None = Field(None, description="Cercanía en años normales con las prioridades enviadas")
    cercania_objetivos: dict[Objetivo, int] | None = None
    que_le_falta: list[str] = []
    sensible_clima: bool = False
    reglas_aplicadas: list[ReglaAplicada] = []
    probabilidades: list[Probabilidad] = []
    # Los 5 puntos de cada columna.
    por_que: list[str] = []
    evidencia: list[str] = []
    beneficios: list[str] = []
    vacios: list[str] = Field([], description="Información que falta")
    riesgos: list[str] = Field([], description="A revisar con el agrónomo")


class Choque(BaseModel):
    hay: bool
    objetivos: list[Objetivo] = []
    texto: str = ""


class Salida(BaseModel):
    lote: LoteSalida
    visto_por_satelite: VistoPorSatelite
    indicadores: dict[str, Indicador]
    contraste_mediciones: list[ContrasteMedicion]
    clima_celda: ClimaCelda
    clima_mensual: ClimaMensual
    tipos_de_anio: TiposDeAnio
    serie_anual: SerieAnual | None
    capas: Capas
    estrategias: list[Estrategia] = Field(min_length=4, max_length=4)
    choque: Choque
    periodo_clima: str
    informacion_falta: list[str]
    aviso: str = "Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo."
    es_mock: bool = Field(False, description="True si la respuesta es el mock fijo")


class Error(BaseModel):
    """Respuesta de error con texto para mostrar (422 lote no agrícola, 503 POWER caído)."""

    mensaje: str
