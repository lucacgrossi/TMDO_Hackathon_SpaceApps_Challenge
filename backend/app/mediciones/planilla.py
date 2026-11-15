"""Planilla CSV del productor → serie mensual (`docs/plan-planilla-lluvia.md`, secciones 2 y 3).

`leer_planilla(contenido, nombre)` recibe los bytes del archivo y devuelve un `ResultadoPlanilla` del contrato.
Nunca lanza: los problemas van a `errores` (archivo rechazado) o a `serie.avisos` (se descartó algo y el resto
sigue). Sin red ni disco: los bytes (y la fecha de hoy, para descartar fechas futuras) determinan el resultado.

Las mediciones del productor se muestran al lado de NASA y no cambian ningún puntaje.

Uso suelto, desde backend/:  py -m app.mediciones.planilla <archivo.csv>
"""

from __future__ import annotations

import codecs
import csv
import io
import math
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.api.contrato import (
    AvisoFila,
    FormatoPlanilla,
    MedicionMes,
    PeriodoPlanilla,
    ResultadoPlanilla,
    SeriePlanilla,
)

MAX_BYTES = 1024 * 1024  # 1 MB; el mismo tope que usa la ruta (`api/rutas.py` lo importa de acá)
MAX_FILAS = 20_000  # filas de datos, sin el encabezado
MAX_MESES = 480  # 40 años
MIN_MESES = 12  # alguna variable tiene que llegar a 12 meses con dato
MAX_PROBLEMAS = 20  # problemas de fila que se informan
MESES_CERO_HUECO = 6  # más meses seguidos con 0 mm → posible hueco del registro
SEPARADORES = (";", "\t", ",")  # en este orden: con empate gana `;`
NOMBRE_SEPARADOR = {";": ";", "\t": "tab", ",": ","}
LINEAS_MUESTRA = 10
MAX_FECHAS_INEXISTENTES = 0.2  # más del 20 % de las filas con fechas que no existen → orden mes/día
FECHAS_MES_DIA = "Las fechas parecen estar en formato mes/día; usá día/mes"


@dataclass(frozen=True)
class Variable:
    """Una fila de la tabla de variables. Sumar una variable nueva es sumar una entrada a `VARIABLES`."""

    nombre: str  # para los textos
    unidad: str
    alias: tuple[str, ...]  # nombres de columna reconocidos, ya normalizados
    rango_diario: tuple[float, float]
    rango_mensual: tuple[float, float]
    agregacion: str  # cómo pasa de diario a mensual (y cómo se juntan dos filas del mismo día): suma | min | max
    cero_si_falta: bool = False  # en diaria, un mes sin filas dentro del período cuenta como 0
    dias_minimos: int | None = None  # en diaria, días con registro para que el mes valga


VARIABLES: dict[str, Variable] = {
    "lluvia_mm": Variable(
        "lluvia", "mm", ("lluvia_mm", "lluvia", "mm", "precipitacion", "precipitacion_mm", "pp", "pp_mm"),
        (0, 300), (0, 1000), "suma", cero_si_falta=True),
    "t_min_c": Variable(
        "temperatura mínima", "°C", ("t_min_c", "t_min", "tmin", "minima", "temp_min", "temperatura_minima"),
        (-20, 40), (-20, 40), "min", dias_minimos=20),
    "t_max_c": Variable(
        "temperatura máxima", "°C", ("t_max_c", "t_max", "tmax", "maxima", "temp_max", "temperatura_maxima"),
        (-10, 50), (-10, 50), "max", dias_minimos=20),
}  # fmt: skip
ALIAS_FECHA = ("fecha", "dia", "mes", "periodo")

# Fechas: siempre día/mes (nunca el orden de Estados Unidos).
_HORA = re.compile(r"[ T]\d{1,2}:\d{2}(:\d{2})?$")
_DIA_DMA = re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})$")
_DIA_AMD = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
_MES_AM = re.compile(r"^(\d{4})[-/](\d{1,2})$")
_MES_MA = re.compile(r"^(\d{1,2})[/\-](\d{4})$")
_SUFIJO_UNIDAD = re.compile(r"_(mm|c|oc|grados)$")

Mes = tuple[int, int]  # (año, mes)


class _Rechazo(Exception):
    """Error de archivo: corta la lectura y se informa en `errores`."""

    def __init__(self, motivo: str | list[AvisoFila], fila: int | None = None):
        super().__init__(motivo)
        self.errores = motivo if isinstance(motivo, list) else [AvisoFila(fila=fila, motivo=motivo)]


# --- utilidades -------------------------------------------------------------


def _normalizar(texto: str) -> str:
    """`Precipitación (mm)` → `precipitacion_mm`: minúsculas, sin tildes, lo demás a `_`."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", sin_tildes.lower()).strip("_")


def _variable_de(columna: str) -> str | None:
    n = _normalizar(columna)
    for clave, var in VARIABLES.items():
        if n in var.alias or _SUFIJO_UNIDAD.sub("", n) in var.alias:
            return clave
    return None


def _fmt(valor: float) -> str:
    return f"{valor:g}".replace(".", ",")


def _etiqueta_mes(m: Mes) -> str:
    return f"{m[0]:04d}-{m[1]:02d}"


def _siguiente(m: Mes) -> Mes:
    return (m[0] + 1, 1) if m[1] == 12 else (m[0], m[1] + 1)


def _meses_entre(desde: Mes, hasta: Mes) -> list[Mes]:
    salida, m = [], desde
    while m <= hasta:
        salida.append(m)
        m = _siguiente(m)
    return salida


def _campana(m: Mes) -> int:
    """Año de inicio de la campaña julio–junio del mes."""
    return m[0] if m[1] >= 7 else m[0] - 1


def _etiqueta_campana(anio: int) -> str:
    return f"{anio}/{str(anio + 1)[2:]}"  # igual que clima/power.py: "2021/22"


def _decodificar(contenido: bytes) -> tuple[str, str]:
    try:
        texto = contenido.decode("utf-8-sig")
        return texto, "utf-8 con BOM" if contenido.startswith(codecs.BOM_UTF8) else "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        return contenido.decode("cp1252"), "windows-1252"
    except UnicodeDecodeError:
        return contenido.decode("latin-1"), "latin-1"


def _separador(texto: str) -> str:
    """Primer separador con la misma cantidad de campos (> 1) en las primeras líneas; si ninguno, el que aparezca."""
    muestra = [linea for linea in texto.splitlines() if linea.strip()][:LINEAS_MUESTRA]
    for sep in SEPARADORES:
        cuentas = [len(next(csv.reader([linea], delimiter=sep))) for linea in muestra]
        if cuentas and cuentas[0] > 1 and len(set(cuentas)) == 1:
            return sep
    for sep in SEPARADORES:
        if any(sep in linea for linea in muestra):
            return sep
    return ";"


def _numero(celda: str, separador: str) -> tuple[float | None, bool]:
    """(valor, usó coma decimal). Vacío o `-` → (None, False): sin registro. Lanza ValueError si no es número."""
    t = celda.strip().replace(" ", "")
    if t in ("", "-"):
        return None, False
    coma = separador != "," and "," in t
    if coma:
        t = t.replace(",", ".")
    valor = float(t)
    if not math.isfinite(valor):
        raise ValueError(t)
    return valor, coma


def _fecha(celda: str) -> tuple[str, date] | None:
    """("diaria", fecha) o ("mensual", primer día del mes). None si no tiene forma de fecha.

    Lanza ValueError si tiene forma de fecha pero no existe (31/02/2023).
    """
    t = _HORA.sub("", celda.strip())
    if m := _DIA_DMA.match(t):
        d, mes, a = int(m[1]), int(m[2]), m[3]
        anio = int(a) if len(a) == 4 else (2000 + int(a) if int(a) <= 69 else 1900 + int(a))
        return "diaria", date(anio, mes, d)
    if m := _DIA_AMD.match(t):
        return "diaria", date(int(m[1]), int(m[2]), int(m[3]))
    if m := _MES_AM.match(t):
        return "mensual", date(int(m[1]), int(m[2]), 1)
    if m := _MES_MA.match(t):
        return "mensual", date(int(m[2]), int(m[1]), 1)
    return None


def _parece_mes_dia(celda: str) -> bool:
    """`07/13/2023`: el segundo número no puede ser un mes y el primero sí → orden de Estados Unidos."""
    m = _DIA_DMA.match(_HORA.sub("", celda.strip()))
    return bool(m) and int(m[1]) <= 12 < int(m[2])


def _es_fecha(celda: str) -> bool:
    try:
        return _fecha(celda) is not None
    except ValueError:
        return True  # tiene forma de fecha: es una fila de datos, no un encabezado


def _recortar(problemas: list[AvisoFila]) -> list[AvisoFila]:
    if len(problemas) <= MAX_PROBLEMAS:
        return problemas
    resto = len(problemas) - MAX_PROBLEMAS
    return [
        *problemas[:MAX_PROBLEMAS],
        AvisoFila(fila=None, motivo=f"y {resto} problemas más (se informan los primeros {MAX_PROBLEMAS})"),
    ]


# --- lectura ----------------------------------------------------------------


class _Lector:
    def __init__(self, hoy: date):
        self.hoy = hoy
        self.avisos: list[AvisoFila] = []
        self.problemas: list[AvisoFila] = []  # filas o valores descartados

    def aviso(self, motivo: str, fila: int | None = None) -> None:
        self.avisos.append(AvisoFila(fila=fila, motivo=motivo))

    def problema(self, motivo: str, fila: int | None) -> None:
        self.problemas.append(AvisoFila(fila=fila, motivo=motivo))

    # Columnas ----------------------------------------------------------------
    def columnas(self, primera: tuple[int, list[str]]) -> tuple[int, dict[str, int], bool]:
        """(índice de la fecha, {variable: índice}, la primera fila es encabezado)."""
        num, celdas = primera
        if celdas and _es_fecha(celdas[0]):
            if len(celdas) < 2:
                raise _Rechazo("Sin encabezado hace falta al menos una columna de fecha y una de lluvia", num)
            self.aviso("Sin encabezado: se leyó la columna 1 como fecha y la 2 como lluvia (mm)")
            if len(celdas) > 2:
                self.aviso("Sin encabezado: las columnas 3 en adelante se ignoran (sin nombre no se sabe qué miden)")
            return 0, {"lluvia_mm": 1}, False

        col_fecha: int | None = None
        cols: dict[str, int] = {}
        for i, nombre in enumerate(celdas):
            n = _normalizar(nombre)
            if not n:
                continue
            var = _variable_de(nombre)
            if n in ALIAS_FECHA and col_fecha is None:
                col_fecha = i
            elif var and var not in cols:
                cols[var] = i
            elif var:
                self.aviso(f'columna "{nombre.strip()}" ignorada: repite {VARIABLES[var].nombre}', num)
            else:
                self.aviso(f'columna "{nombre.strip()}" ignorada: no se usa en esta versión', num)
        if col_fecha is None:
            raise _Rechazo(f"No se encontró la columna de fecha (nombres reconocidos: {', '.join(ALIAS_FECHA)})", num)
        if not cols:
            nombres = "; ".join(f"{v.nombre}: {', '.join(v.alias)}" for v in VARIABLES.values())
            raise _Rechazo(f"No se reconoció ninguna columna de medición (nombres reconocidos: {nombres})", num)
        reconocidas = [celdas[col_fecha].strip(), *[celdas[i].strip() for i in cols.values()]]
        self.aviso(f"Encabezado reconocido: {', '.join(reconocidas)}", num)
        return col_fecha, cols, True

    # Filas -------------------------------------------------------------------
    def valores(
        self, num: int, celdas: list[str], cols: dict[str, int], separador: str, granularidad: str
    ) -> tuple[dict[str, float], bool]:
        valores: dict[str, float] = {}
        uso_coma = False
        for clave, idx in cols.items():
            var = VARIABLES[clave]
            celda = celdas[idx] if idx < len(celdas) else ""
            try:
                v, coma = _numero(celda, separador)
            except ValueError:
                self.problema(f'{var.nombre} "{celda.strip()}" no es un número: se descartó', num)
                continue
            if v is None:
                continue
            lo, hi = var.rango_diario if granularidad == "diaria" else var.rango_mensual
            if not lo <= v <= hi:
                por = "por día" if granularidad == "diaria" else "por mes"
                self.problema(
                    f"{var.nombre} {_fmt(v)} {var.unidad} fuera de rango "
                    f"({_fmt(lo)} a {_fmt(hi)} {var.unidad} {por}): se descartó",
                    num,
                )
                continue
            valores[clave] = v
            uso_coma |= coma
        if "t_min_c" in valores and "t_max_c" in valores and valores["t_min_c"] > valores["t_max_c"]:
            self.problema(
                f"temperatura mínima ({_fmt(valores['t_min_c'])} °C) mayor que la máxima "
                f"({_fmt(valores['t_max_c'])} °C): se descartaron las dos",
                num,
            )
            del valores["t_min_c"], valores["t_max_c"]
        return valores, uso_coma

    def leer(self, contenido: bytes, nombre: str | None) -> ResultadoPlanilla:
        if not contenido.strip():
            raise _Rechazo("El archivo está vacío")
        if len(contenido) > MAX_BYTES:
            # Sin redondear el peso: con 1,02 MB decía "pesa 1,0 MB: el máximo es 1 MB".
            raise _Rechazo("La planilla supera 1 MB, el máximo: guardá menos años o solo las columnas que se usan")
        if contenido.startswith(b"PK\x03\x04") or (nombre or "").lower().endswith((".xlsx", ".xls", ".ods")):
            raise _Rechazo("La planilla tiene que ser CSV: en Excel o Google Sheets, guardarla como CSV")

        texto, codificacion = _decodificar(contenido)
        separador = _separador(texto)
        lector = csv.reader(io.StringIO(texto, newline=""), delimiter=separador)
        filas: list[tuple[int, list[str]]] = []
        for celdas in lector:
            if any(c.strip() for c in celdas):
                filas.append((lector.line_num, celdas))
        if not filas:
            raise _Rechazo("El archivo está vacío")

        col_fecha, cols, con_encabezado = self.columnas(filas[0])
        datos = filas[1:] if con_encabezado else filas
        if not datos:
            raise _Rechazo("La planilla solo tiene el encabezado: no hay filas con datos")
        if len(datos) > MAX_FILAS:
            raise _Rechazo(f"La planilla tiene {len(datos):,} filas de datos: el máximo es 20.000".replace(",", "."))

        granularidad: str | None = None
        diario: dict[Mes, dict[str, dict[int, float]]] = {}  # mes → variable → día → valor
        mensual: dict[Mes, dict[str, float]] = {}
        fila_mes: dict[Mes, int] = {}
        repetidos: list[AvisoFila] = []
        uso_coma = False
        filas_usadas = 0
        fechas_inexistentes = 0
        filas_sin_valor = 0

        for num, celdas in datos:
            celda_fecha = celdas[col_fecha].strip() if col_fecha < len(celdas) else ""
            try:
                leida = _fecha(celda_fecha)
            except ValueError:
                if _parece_mes_dia(celda_fecha):
                    raise _Rechazo(f'{FECHAS_MES_DIA} (por ejemplo, "{celda_fecha}")', num) from None
                self.problema(f'la fecha "{celda_fecha}" no existe: fila descartada', num)
                fechas_inexistentes += 1
                continue
            if leida is None:
                self.problema(
                    f'fecha "{celda_fecha}" no reconocida (se espera dd/mm/aaaa, aaaa-mm-dd o aaaa-mm): '
                    "fila descartada",
                    num,
                )
                continue
            tipo, dia = leida
            if granularidad is None:
                granularidad = tipo
            elif tipo != granularidad:
                raise _Rechazo(
                    f"El archivo mezcla fechas diarias y mensuales: empieza {granularidad} y esta fila "
                    f'tiene una fecha {tipo} ("{celda_fecha}"). Tiene que ser un solo formato',
                    num,
                )
            mes: Mes = (dia.year, dia.month)
            futura = dia > self.hoy if tipo == "diaria" else mes > (self.hoy.year, self.hoy.month)
            if futura:
                self.problema(f'fecha futura "{celda_fecha}": fila descartada', num)
                continue
            if tipo == "mensual":
                if mes in fila_mes:
                    repetidos.append(
                        AvisoFila(
                            fila=num,
                            motivo=(
                                f"el mes {_etiqueta_mes(mes)} está repetido (filas {fila_mes[mes]} y {num}): no se suma "
                                "porque no se sabe cuál vale"
                            ),
                        )
                    )
                    continue
                fila_mes[mes] = num

            antes = len(self.problemas)
            valores, coma = self.valores(num, celdas, cols, separador, tipo)
            if not valores:
                if len(self.problemas) == antes:
                    filas_sin_valor += 1  # sin problema propio: se avisa al final, para que cierren las cuentas
                continue
            filas_usadas += 1
            uso_coma |= coma
            if tipo == "mensual":
                mensual[mes] = valores
            else:
                por_var = diario.setdefault(mes, {})
                for clave, v in valores.items():
                    por_dia = por_var.setdefault(clave, {})
                    previo = por_dia.get(dia.day)
                    agregacion = VARIABLES[clave].agregacion
                    if previo is None:
                        por_dia[dia.day] = v
                    elif agregacion == "suma":
                        por_dia[dia.day] = previo + v  # varias lluvias el mismo día
                    elif agregacion == "min":
                        por_dia[dia.day] = min(previo, v)
                    else:
                        por_dia[dia.day] = max(previo, v)

        if fechas_inexistentes > MAX_FECHAS_INEXISTENTES * len(datos):
            raise _Rechazo(
                f"{FECHAS_MES_DIA}: {fechas_inexistentes} de {len(datos)} filas tienen una fecha que no existe"
            )
        if repetidos:
            raise _Rechazo(repetidos)
        if granularidad is None:
            raise _Rechazo("Ninguna fila tiene una fecha válida (se espera dd/mm/aaaa, aaaa-mm-dd o aaaa-mm)")

        if filas_sin_valor:
            cuantas = "1 fila tiene" if filas_sin_valor == 1 else f"{filas_sin_valor} filas tienen"
            self.aviso(f"{cuantas} fecha pero ninguna medición: no se usan")
        if granularidad == "diaria":
            meses = self.mensualizar(diario)
        else:
            meses = {m: dict(v) for m, v in mensual.items()}
        return self.armar(
            meses,
            granularidad,
            cols,
            FormatoPlanilla(
                codificacion=codificacion, separador=NOMBRE_SEPARADOR[separador], decimal="," if uso_coma else "."
            ),
            len(datos),  # sin el encabezado: la vista previa resta las usadas para contar las descartadas
            filas_usadas,
        )

    # Diario → mensual ----------------------------------------------------------
    def mensualizar(self, diario: dict[Mes, dict[str, dict[int, float]]]) -> dict[Mes, dict[str, float]]:
        meses: dict[Mes, dict[str, float]] = {}
        for mes in sorted(diario):
            for clave, por_dia in diario[mes].items():
                var = VARIABLES[clave]
                if var.dias_minimos and len(por_dia) < var.dias_minimos:
                    dias = f"{len(por_dia)} día{'s' if len(por_dia) != 1 else ''}"
                    self.aviso(
                        f"{var.nombre} de {_etiqueta_mes(mes)}: {dias} con registro (hacen "
                        f"falta {var.dias_minimos}): el mes queda sin dato"
                    )
                    continue
                vals = list(por_dia.values())
                total = sum(vals) if var.agregacion == "suma" else min(vals) if var.agregacion == "min" else max(vals)
                meses.setdefault(mes, {})[clave] = total

        # Lluvia: el productor anota solo los días que llueve → un mes sin filas dentro del período es 0 mm.
        for clave, var in VARIABLES.items():
            if not var.cero_si_falta:
                continue
            con_registro = sorted(m for m, por_var in diario.items() if clave in por_var)
            if not con_registro:
                continue
            vacios = [m for m in _meses_entre(con_registro[0], con_registro[-1]) if clave not in diario.get(m, {})]
            for m in vacios:
                meses.setdefault(m, {})[clave] = 0.0
            if vacios:
                self.aviso(
                    f"{len(vacios)} meses sin registros de {var.nombre} dentro del período: se tomaron como "
                    f"0 {var.unidad} (en invierno es normal)"
                )
        return meses

    # Serie -------------------------------------------------------------------
    def armar(
        self,
        meses: dict[Mes, dict[str, float]],
        granularidad: str,
        cols: dict[str, int],
        formato: FormatoPlanilla,
        filas_leidas: int,
        filas_usadas: int,
    ) -> ResultadoPlanilla:
        # Rango mensual (la suma diaria de lluvia puede pasarse de lo que acepta el contrato).
        for mes in sorted(meses):
            for clave in list(meses[mes]):
                var, v = VARIABLES[clave], meses[mes][clave]
                lo, hi = var.rango_mensual
                if not lo <= v <= hi:
                    self.aviso(
                        f"{var.nombre} de {_etiqueta_mes(mes)}: {_fmt(round(v, 1))} {var.unidad} fuera de "
                        f"rango ({_fmt(lo)} a {_fmt(hi)} {var.unidad} por mes): el mes queda sin dato"
                    )
                    del meses[mes][clave]
        meses = {m: v for m, v in meses.items() if v}
        if not meses:
            raise _Rechazo("Ninguna fila tiene un valor válido de lluvia ni de temperatura")

        orden = sorted(meses)
        desde, hasta = orden[0], orden[-1]
        span = len(_meses_entre(desde, hasta))
        if span > MAX_MESES:
            raise _Rechazo(
                f"La planilla abarca {span / 12:.0f} años ({_etiqueta_mes(desde)} a {_etiqueta_mes(hasta)}):"
                " el máximo es 40"
            )

        variables = [c for c in VARIABLES if any(c in v for v in meses.values())]
        cuenta = {c: sum(1 for v in meses.values() if c in v) for c in variables}
        if not any(n >= MIN_MESES for n in cuenta.values()):
            partes = [f"{VARIABLES[c].nombre} en {cuenta[c]} mes{'es' if cuenta[c] != 1 else ''}" for c in variables]
            detalle = partes[0] if len(partes) == 1 else f"{', '.join(partes[:-1])} y {partes[-1]}"
            alguna = "" if len(partes) == 1 else " de alguna de ellas"
            raise _Rechazo(f"Tu planilla tiene {detalle}: hacen falta al menos {MIN_MESES} meses{alguna}")

        # Posible hueco: más de 6 meses seguidos con 0 mm.
        for clave in variables:
            if not VARIABLES[clave].cero_si_falta:
                continue
            racha: list[Mes] = []
            for m in [*_meses_entre(desde, hasta), None]:
                if m is not None and meses.get(m, {}).get(clave) == 0:
                    racha.append(m)
                    continue
                if len(racha) > MESES_CERO_HUECO:
                    self.aviso(
                        f"{VARIABLES[clave].nombre} en 0 {VARIABLES[clave].unidad} durante {len(racha)} meses "
                        f"seguidos ({_etiqueta_mes(racha[0])} a {_etiqueta_mes(racha[-1])}): puede ser un "
                        "hueco del registro"
                    )
                racha = []

        # Campañas julio–junio completas, por variable.
        campanas: dict[str, list[str]] = {}
        for clave in variables:
            completas = []
            for anio in range(_campana(desde), _campana(hasta) + 1):
                con_dato = sum(1 for m in _meses_entre((anio, 7), (anio + 1, 6)) if clave in meses.get(m, {}))
                if con_dato == 12:
                    completas.append(_etiqueta_campana(anio))
                elif con_dato:
                    self.aviso(
                        f"campaña {_etiqueta_campana(anio)}: {VARIABLES[clave].nombre} con {con_dato} de 12 "
                        "meses: se informa, pero no se compara con NASA"
                    )
            campanas[clave] = completas

        media = None
        if campanas.get("lluvia_mm"):
            totales = [
                sum(meses[m]["lluvia_mm"] for m in _meses_entre((int(e[:4]), 7), (int(e[:4]) + 1, 6)))
                for e in campanas["lluvia_mm"]
            ]
            media = round(sum(totales) / len(totales), 1)

        serie = SeriePlanilla(
            meses=[MedicionMes(mes=_etiqueta_mes(m), **{c: round(v, 2) for c, v in meses[m].items()}) for m in orden],
            variables=variables,
            granularidad=granularidad,
            periodo=PeriodoPlanilla(desde=_etiqueta_mes(desde), hasta=_etiqueta_mes(hasta)),
            campanas_completas=campanas,
            lluvia_media_campana_mm=media,
            filas_leidas=filas_leidas,
            filas_usadas=filas_usadas,
            avisos=[*self.avisos, *_recortar(self.problemas)],
            formato=formato,
        )
        return ResultadoPlanilla(ok=True, serie=serie)


def leer_planilla(contenido: bytes, nombre: str | None = None, *, hoy: date | None = None) -> ResultadoPlanilla:
    """Lee la planilla CSV del productor. Nunca lanza: si no se puede usar, `ok=False` con los `errores`.

    `hoy` sirve para descartar fechas futuras; por defecto, la fecha del día (los tests lo fijan).
    """
    lector = _Lector(hoy or date.today())
    try:
        return lector.leer(contenido, nombre)
    except _Rechazo as e:
        return ResultadoPlanilla(ok=False, errores=_recortar([*e.errores, *lector.problemas]))
    except Exception as e:  # noqa: BLE001 - el lector nunca lanza: lo inesperado también vuelve como error
        return ResultadoPlanilla(
            ok=False,
            errores=[
                AvisoFila(
                    fila=None,
                    motivo=(
                        f"No se pudo leer la planilla ({type(e).__name__}). Tiene que ser un CSV exportado de Excel o "
                        "Google Sheets"
                    ),
                )
            ],
        )


# --- uso suelto -------------------------------------------------------------


def resumen(r: ResultadoPlanilla) -> str:
    def fila(a: AvisoFila) -> str:
        return f"  - {'fila ' + str(a.fila) + ': ' if a.fila is not None else ''}{a.motivo}"

    if not r.ok or r.serie is None:
        return "\n".join(["Planilla rechazada:", *map(fila, r.errores)])
    s = r.serie
    media = s.lluvia_media_campana_mm
    lineas = [
        f"Planilla {s.granularidad} · {s.periodo.desde} a {s.periodo.hasta} · {len(s.meses)} meses",
        f"Variables: {', '.join(s.variables)}",
        *[f"Campañas completas de {c}: {', '.join(v) if v else 'ninguna'}" for c, v in s.campanas_completas.items()],
        f"Lluvia media por campaña: {_fmt(media) + ' mm' if media is not None else 'sin campañas completas'}",
        f"Filas: {s.filas_leidas} leídas, {s.filas_usadas} usadas",
        f"Formato: {s.formato.codificacion} · separador {s.formato.separador} · decimal {s.formato.decimal}",
    ]
    if s.avisos:
        lineas += ["Avisos:", *map(fila, s.avisos)]
    return "\n".join(lineas)


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("Uso: py -m app.mediciones.planilla <archivo.csv>")
        return 2
    ruta = Path(argv[0])
    r = leer_planilla(ruta.read_bytes(), ruta.name)
    print(resumen(r))
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # tildes bien también en la consola de Windows
    sys.exit(main(sys.argv[1:]))
