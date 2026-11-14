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
    """Barritas de 0 (nada) a 5 (mucho). Por defecto 3 (RF4)."""

    agua: int = Field(3, ge=0, le=5)
    suelo: int = Field(3, ge=0, le=5)
    ingreso: int = Field(3, ge=0, le=5)
    erosion: int = Field(3, ge=0, le=5)


class MedicionesPropias(BaseModel):
    """Mediciones del productor (RF15). Se muestran al lado de NASA; no cambian puntajes."""

    lluvia_anual_mm: float | None = Field(None, gt=0)
    anios_registro: int | None = Field(None, ge=1)
    materia_organica_pct: float | None = Field(None, ge=0, le=100)


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
    pendiente_pct: Indicador
    cobertura_agricola_pct: Indicador


class MesSatelite(BaseModel):
    fecha: str = Field(description="Fecha de la escena, AAAA-MM-DD")
    ndvi_medio: float
    nubes_escena: float = Field(description="% de nubes de la escena")
    fuente: str = Field(description='"NASA HLS 30 m" o "MODIS 250 m" si cayó al respaldo')


class VistoPorSatelite(BaseModel):
    """RF14: NDVI medio del lote en cada mes de la última campaña."""

    campana: str | None
    fuente: str
    meses: list[MesSatelite | None] = _doce()
    meses_ndvi_bajo: int | None
    meses_con_dato: int
    umbral: float = 0.3
    confianza: Confianza
    motivo: str | None = None


class CorregidoAlLado(BaseModel):
    umbral_seco_mm: float | None
    nota: str


class ContrasteMedicion(BaseModel):
    """RF15: medición del productor al lado de NASA. No cambia ningún puntaje."""

    indicador: str
    valor_productor: float
    valor_nasa: float
    unidad: str
    diferencia_pct: int
    confianza_resultante: Literal["alta", "baja"]
    corregido_al_lado: CorregidoAlLado | None
    texto: str


class ClimaCelda(BaseModel):
    """Celda de NASA POWER (0,5° × 0,625°), para dibujarla a la escala real del dato."""

    bbox: tuple[float, float, float, float] = Field(description="[oeste, sur, este, norte]")
    posicion_lote: str
    resolucion: str = "~50 km (0,5° × 0,625°)"


class ClimaMensual(BaseModel):
    """Climatología de las 30 campañas. Índice 0 = enero."""

    lluvia_mm: list[float] = _doce()
    minima_media_c: list[float] = _doce()
    maxima_media_c: list[float] = _doce()
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


class CapaNdviMes(BaseModel):
    """Escena HLS del mes, para que el front arme las teselas sin repetir la búsqueda."""

    coleccion: str
    item: str
    fecha: str


class Capas(BaseModel):
    erosion: dict | None = Field(None, description="Formato a acordar entre Back 2 y Front 1")
    ndvi_mensual: list[CapaNdviMes | None] = _doce()
    agua_regional_mensual: list[float] | None = None
    heladas_regional_mensual: list[int] | None = None
    no_disponibles: list[str] = []


# --- Salida: las 4 estrategias ----------------------------------------------

class PorTipo(BaseModel):
    seco: int
    normal: int
    humedo: int


class Puntos(BaseModel):
    """
    Puntos de 0 a 100 por dimensión (RF13). Con esto el front recalcula la
    cercanía al mover las barritas, sin volver a llamar a la API:
        cercania(tipo) = Σ prioridad[o] · valor[o] / Σ prioridad[o]
    donde valor["agua"] = agua[tipo] y el resto no cambia con el tipo de año.
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
