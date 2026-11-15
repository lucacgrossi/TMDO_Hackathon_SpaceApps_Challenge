"""Parser de la planilla CSV del productor: los 16 casos de `docs/plan-planilla-lluvia.md` (sección 6). Sin red."""

from datetime import date, timedelta
from pathlib import Path

import pytest

from app.api.contrato import ResultadoPlanilla
from app.mediciones.planilla import leer_planilla, main

FIXTURES = Path(__file__).parent / "fixtures"
HOY = date(2026, 11, 14)


def leer(nombre: str):
    return leer_planilla((FIXTURES / nombre).read_bytes(), nombre, hoy=HOY)


def leer_bytes(contenido: bytes):
    return leer_planilla(contenido, "planilla.csv", hoy=HOY)


def motivos(avisos) -> str:
    return "\n".join(f"{a.fila}: {a.motivo}" for a in avisos)


def por_mes(r) -> dict:
    return {m.mes: m for m in r.serie.meses}


def diario_completo(desde: date, hasta: date, fila) -> bytes:
    """CSV diario armado en el test (los que necesitan muchas filas no van como fixture)."""
    filas, d = ["fecha;lluvia_mm;t_min_c;t_max_c"], desde
    while d <= hasta:
        filas.append(fila(d))
        d += timedelta(days=1)
    return ("\n".join(filas) + "\n").encode()


def test_fixtures_chicas():
    for f in FIXTURES.glob("*.csv"):
        assert f.stat().st_size < 5_000, f.name


# 1 · Excel en español: `;`, coma decimal, dd/mm/aaaa, UTF-8 con BOM, solo lluvia
def test_1_excel_espanol():
    r = leer("excel_es.csv")
    assert r.ok, motivos(r.errores)
    s = r.serie
    assert s.granularidad == "diaria"
    assert s.variables == ["lluvia_mm"]
    assert s.formato.codificacion == "utf-8 con BOM" and s.formato.separador == ";" and s.formato.decimal == ","
    assert s.periodo.desde == "2021-07" and s.periodo.hasta == "2023-06"
    assert s.campanas_completas == {"lluvia_mm": ["2021/22", "2022/23"]}
    assert s.lluvia_media_campana_mm == pytest.approx((711.5 + 681.5) / 2)
    # Tres lluvias el 09/12/2021 y otra el 08 y el 22: se suman.
    assert por_mes(r)["2021-12"].lluvia_mm == pytest.approx(70.5 + 12 + 7.5 + 45)
    assert len(s.meses) == 24
    assert s.filas_leidas == 33 and s.filas_usadas == 33  # sin el encabezado (H-023)


# 2 · Google Sheets en inglés: `,`, punto decimal, aaaa-mm-dd
def test_2_google_sheets():
    r = leer("sheets_en.csv")
    assert r.ok, motivos(r.errores)
    s = r.serie
    assert s.formato.separador == "," and s.formato.decimal == "." and s.formato.codificacion == "utf-8"
    assert s.granularidad == "diaria"
    assert s.campanas_completas == {"lluvia_mm": ["2022/23"]}
    assert s.lluvia_media_campana_mm == pytest.approx(820)
    assert por_mes(r)["2022-08"].lluvia_mm == pytest.approx(9.5)


# 3 · Latin-1 con encabezados `Precipitación;Mínima;Máxima`
def test_3_latin1_con_tildes():
    r = leer("latin1_mensual.csv")
    assert r.ok, motivos(r.errores)
    s = r.serie
    assert s.formato.codificacion in ("windows-1252", "latin-1")
    assert s.variables == ["lluvia_mm", "t_min_c", "t_max_c"]
    assert "Precipitación" in motivos(s.avisos)  # el encabezado se informa como vino
    julio = por_mes(r)["2022-07"]
    assert julio.lluvia_mm == pytest.approx(4) and julio.t_min_c == pytest.approx(-4.1)
    assert julio.t_max_c == pytest.approx(24)


# 4 · Mensual aaaa-mm con lluvia y temperaturas
def test_4_mensual():
    r = leer("mensual.csv")
    assert r.ok, motivos(r.errores)
    s = r.serie
    assert s.granularidad == "mensual"
    assert len(s.meses) == 12 and [m.mes for m in s.meses] == sorted(m.mes for m in s.meses)
    assert s.campanas_completas == {"lluvia_mm": ["2022/23"], "t_min_c": ["2022/23"], "t_max_c": ["2022/23"]}
    assert s.lluvia_media_campana_mm == pytest.approx(820)
    assert por_mes(r)["2023-01"].t_max_c == pytest.approx(38)
    assert s.filas_leidas == 12 and s.filas_usadas == 12  # sin el encabezado (H-023)


# 5 · Sin encabezado
def test_5_sin_encabezado():
    r = leer("sin_encabezado.csv")
    assert r.ok, motivos(r.errores)
    assert r.serie.variables == ["lluvia_mm"]
    assert r.serie.campanas_completas == {"lluvia_mm": ["2022/23"]}
    assert "Sin encabezado" in motivos(r.serie.avisos)


# 6 · Días sin lluvia en invierno → meses en 0 mm con aviso
def test_6_invierno_sin_filas_es_cero():
    r = leer("excel_es.csv")
    meses = por_mes(r)
    for mes in ("2021-08", "2022-06", "2022-07", "2022-08"):
        assert meses[mes].lluvia_mm == 0
    assert "4 meses sin registros de lluvia" in motivos(r.serie.avisos)


def test_6_mas_de_seis_meses_en_cero_avisa_hueco():
    filas = ["fecha;lluvia_mm", "10/07/2021;20"] + [f"10/{m:02d}/2022;30" for m in range(2, 13)]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert r.ok, motivos(r.errores)
    assert "6 meses sin registros" in motivos(r.serie.avisos)  # ago-2021 a ene-2022
    assert "hueco" not in motivos(r.serie.avisos)  # 6 seguidos no alcanza: tienen que ser más de 6
    filas = ["fecha;lluvia_mm", "10/06/2021;20"] + [f"10/{m:02d}/2022;30" for m in range(2, 13)]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert "7 meses seguidos (2021-07 a 2022-01): puede ser un hueco del registro" in motivos(r.serie.avisos)


# 7 · Mes con 12 días de temperatura → ese mes sin dato, con aviso; la lluvia sigue
def test_7_mes_de_temperatura_incompleto():
    def fila(d: date) -> str:
        if d.year == 2023 and d.month == 3 and d.day > 12:
            return f"{d:%d/%m/%Y};1,5;;"  # en marzo de 2023 la estación anotó 12 días
        return f"{d:%d/%m/%Y};1,5;{5 + d.day % 7};{25 + d.day % 9}"

    r = leer_bytes(diario_completo(date(2022, 7, 1), date(2023, 6, 30), fila))
    assert r.ok, motivos(r.errores)
    s = r.serie
    marzo = por_mes(r)["2023-03"]
    assert marzo.t_min_c is None and marzo.t_max_c is None
    assert marzo.lluvia_mm == pytest.approx(1.5 * 31)
    assert "temperatura mínima de 2023-03: 12 días con registro (hacen falta 20)" in motivos(s.avisos)
    assert s.campanas_completas["lluvia_mm"] == ["2022/23"]
    assert s.campanas_completas["t_min_c"] == []  # le falta marzo
    assert por_mes(r)["2023-01"].t_min_c == 5 and por_mes(r)["2023-01"].t_max_c == 33  # mínimo y máximo del mes


# 8 · Valores fuera de rango, t_min > t_max, 60 °C, fecha futura → descartados con aviso; el resto ok
def test_8_descartes():
    r = leer("descartes.csv")
    assert r.ok, motivos(r.errores)
    texto = motivos(r.serie.avisos)
    assert "14: lluvia -5 mm fuera de rango" in texto
    assert "15: lluvia 350 mm fuera de rango" in texto
    assert "16: temperatura mínima (20 °C) mayor que la máxima (10 °C)" in texto
    assert "17: temperatura máxima 60 °C fuera de rango" in texto
    assert '18: fecha futura "07/01/2030"' in texto
    assert por_mes(r)["2023-01"].lluvia_mm == pytest.approx(135.5 + 12)  # la lluvia de la fila 16 sigue
    assert r.serie.campanas_completas == {"lluvia_mm": ["2022/23"]}


# 9 · Mes repetido en formato mensual → error con número de fila
def test_9_mes_repetido():
    r = leer("mes_repetido.csv")
    assert not r.ok and r.serie is None
    assert r.errores[0].fila == 9
    assert "2023-01 está repetido (filas 8 y 9)" in r.errores[0].motivo


# 10 · Diario y mensual mezclados → error
def test_10_mezclado():
    r = leer("mezclado.csv")
    assert not r.ok
    assert r.errores[0].fila == 5 and "mezcla fechas diarias y mensuales" in r.errores[0].motivo


# 11 · Archivo vacío, solo encabezado, o menos de 12 meses → error claro
@pytest.mark.parametrize(
    "contenido, esperado",
    [
        (b"", "vacío"),
        (b"\xef\xbb\xbf\r\n \r\n", "vacío"),
        (b"fecha;lluvia_mm\r\n", "solo tiene el encabezado"),
        (
            b"mes;lluvia_mm\n2023-01;10\n2023-02;20\n2023-03;30\n2023-04;40\n2023-05;50\n",
            "Tu planilla tiene lluvia en 5 meses: hacen falta al menos 12 meses",
        ),
        (b"fecha;viento\n01/01/2023;3\n", "No se reconoció ninguna columna de medición"),
    ],
)
def test_11_errores_claros(contenido, esperado):
    r = leer_bytes(contenido)
    assert not r.ok and r.serie is None
    assert esperado in motivos(r.errores)


# 12 · Más de 1 MB o 20.000 filas → error de tamaño
def test_12_mas_de_1_mb():
    contenido = b"fecha;lluvia_mm\n" + b"01/01/2023;0\n" * 80_000
    assert len(contenido) > 1_000_000
    r = leer_bytes(contenido)
    assert not r.ok and "el máximo es 1 MB" in r.errores[0].motivo


def test_12_mas_de_20000_filas():
    contenido = b"mes;lluvia_mm\n" + b"2023-01;0\n" * 20_001
    assert len(contenido) < 1_000_000
    r = leer_bytes(contenido)
    assert not r.ok and "20.001 filas de datos: el máximo es 20.000" in r.errores[0].motivo


def test_12_mas_de_40_anios():
    filas = ["mes;lluvia_mm"] + [f"{a}-{m:02d};50" for a in range(1980, 2026) for m in range(1, 13)]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert not r.ok and "el máximo es 40" in r.errores[0].motivo


# 13 · Campaña parcial (enero–junio) → se informa, no entra en `campanas_completas`
def test_13_campana_parcial():
    r = leer("parcial.csv")
    assert r.ok, motivos(r.errores)
    assert r.serie.campanas_completas == {"lluvia_mm": ["2022/23"]}
    assert "campaña 2021/22: lluvia con 6 de 12 meses: se informa, pero no se compara" in motivos(r.serie.avisos)
    assert r.serie.periodo.desde == "2022-01"


# 14 · Fechas d/m/aa → años 2000
def test_14_fechas_cortas():
    r = leer("fechas_cortas.csv")
    assert r.ok, motivos(r.errores)
    assert r.serie.periodo.desde == "2022-07" and r.serie.periodo.hasta == "2023-06"
    assert r.serie.campanas_completas == {"lluvia_mm": ["2022/23"]}
    # 70–99 → 1900
    filas = ["fecha;lluvia_mm"] + [f"5/{m}/99;10" for m in range(1, 13)]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert r.serie.periodo.desde == "1999-01"


# 15 · Columna extra `humedad_suelo` → ignorada con aviso
def test_15_columna_extra():
    r = leer("humedad.csv")
    assert r.ok, motivos(r.errores)
    assert r.serie.variables == ["lluvia_mm"]
    assert 'columna "humedad_suelo" ignorada: no se usa en esta versión' in motivos(r.serie.avisos)


# 16 · Solo temperaturas, sin lluvia
def test_16_solo_temperaturas():
    r = leer("solo_temperaturas.csv")
    assert r.ok, motivos(r.errores)
    s = r.serie
    assert s.variables == ["t_min_c", "t_max_c"]
    assert s.lluvia_media_campana_mm is None
    assert s.campanas_completas == {"t_min_c": ["2022/23"], "t_max_c": ["2022/23"]}
    assert all(m.lluvia_mm is None for m in s.meses)


# --- más allá de la tabla ----------------------------------------------------


def test_errores_se_recortan_a_20():
    filas = ["mes;lluvia_mm"] + [f"2022-{m:02d};{m * 10}" for m in range(1, 13)] + ["xx;1"] * 30
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert r.ok
    descartes = [a for a in r.serie.avisos if "no reconocida" in a.motivo]
    assert len(descartes) == 20
    assert r.serie.avisos[-1].motivo == "y 10 problemas más (se informan los primeros 20)"


def test_celda_vacia_o_guion_es_sin_registro():
    filas = ["mes;lluvia_mm;t_min_c"] + [f"2022-{m:02d};{m * 10};{'-' if m == 5 else ''}" for m in range(1, 13)]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert r.ok and r.serie.variables == ["lluvia_mm"]
    assert not any("no es un número" in a.motivo for a in r.serie.avisos)


@pytest.mark.parametrize(
    "contenido, nombre",
    [
        (b"\x00\xff\xfe\x00garbage\x00;;;\n\x00", "x.csv"),
        (b"PK\x03\x04\x14\x00\x00\x00", "planilla.xlsx"),
        (b"fecha;lluvia_mm\n31/02/2023;10\n", None),
        (b'"fecha;"lluvia\n"sin cerrar', None),
    ],
)
def test_nunca_lanza(contenido, nombre):
    r = leer_planilla(contenido, nombre, hoy=HOY)
    assert isinstance(r, ResultadoPlanilla) and not r.ok and r.errores


def test_xlsx_pide_csv():
    r = leer_planilla(b"PK\x03\x04resto", "planilla.xlsx", hoy=HOY)
    assert "tiene que ser CSV" in r.errores[0].motivo


def test_resultado_respeta_el_contrato():
    r = leer("mensual.csv")
    assert ResultadoPlanilla.model_validate(r.model_dump()) == r


def test_cli(capsys):
    assert main([str(FIXTURES / "mensual.csv")]) == 0
    assert "Campañas completas de lluvia_mm: 2022/23" in capsys.readouterr().out
    assert main([str(FIXTURES / "mezclado.csv")]) == 1


# --- hallazgos del test E2E del 15/11 (docs/qa/reporte-test-e2e-2026-11-15.md) ---------------------------


def test_h016_fechas_mes_dia_se_rechazan():
    # 01/01 a 12/01 se leen como día/mes; 01/13/2023 delata el orden de Estados Unidos.
    filas = ["fecha;lluvia_mm"] + [f"01/{d:02d}/2023;{d}" for d in range(1, 20)]
    r = leer_bytes(("
".join(filas) + "
").encode())
    assert not r.ok and r.serie is None
    assert r.errores[0].fila == 14
    assert r.errores[0].motivo.startswith("Las fechas parecen estar en formato mes/día; usá día/mes")
    assert '"01/13/2023"' in r.errores[0].motivo


def test_h016_mas_del_20_por_ciento_de_fechas_inexistentes_se_rechaza():
    # 12 meses válidos y 4 fechas que no existen (31/02, 30/02...): 4 de 16 = 25 %.
    filas = ["fecha;lluvia_mm"] + [f"15/{m:02d}/2022;{m * 10}" for m in range(1, 13)]
    filas += ["31/02/2022;5", "30/02/2022;5", "31/04/2022;5", "31/06/2022;5"]
    r = leer_bytes(("
".join(filas) + "
").encode())
    assert not r.ok
    assert "Las fechas parecen estar en formato mes/día; usá día/mes: 4 de 16 filas" in motivos(r.errores)


def test_h016_pocas_fechas_inexistentes_se_descartan_y_sigue():
    filas = ["fecha;lluvia_mm"] + [f"15/{m:02d}/2022;{m * 10}" for m in range(1, 13)] + ["31/02/2022;5"]
    r = leer_bytes(("
".join(filas) + "
").encode())
    assert r.ok, motivos(r.errores)
    assert 'la fecha "31/02/2022" no existe: fila descartada' in motivos(r.serie.avisos)


def test_h022_mensaje_de_pocos_meses_en_singular_y_con_varias_variables():
    r = leer_bytes(b"fecha;lluvia_mm
15/01/2023;32,5
")
    assert motivos(r.errores) == "None: Tu planilla tiene lluvia en 1 mes: hacen falta al menos 12 meses"
    r = leer_bytes(b"mes;lluvia_mm;t_min_c
2023-01;10;
2023-02;20;15
2023-03;30;14
")
    assert (
        "Tu planilla tiene lluvia en 3 meses y temperatura mínima en 2 meses: hacen falta al menos 12 meses "
        "de alguna de ellas"
    ) in motivos(r.errores)


def test_h022_la_plantilla_descargable_se_acepta_tal_cual():
    plantilla = Path(__file__).parents[3] / "frontend" / "public" / "plantillas" / "mediciones.csv"
    r = leer_planilla(plantilla.read_bytes(), plantilla.name, hoy=HOY)
    assert r.ok, motivos(r.errores)
    assert r.serie.campanas_completas.get("lluvia_mm")


def test_h023_filas_leidas_no_cuenta_el_encabezado():
    r = leer("mensual.csv")
    assert r.serie.filas_leidas - r.serie.filas_usadas == 0  # nada descartado → la vista previa no dice "1 fila"


def test_mensajes_sin_comillas_invertidas():
    filas = ["fecha;lluvia_mm;napa"] + [f"15/{m:02d}/2022;{m * 10};1" for m in range(1, 13)]
    filas += ["15/01/2022;mucho;1", "xx;3;1", "15/01/2030;1;1"]
    r = leer_bytes(("
".join(filas) + "
").encode())
    assert r.ok, motivos(r.errores)
    assert "`" not in motivos(r.serie.avisos)


def test_h023_filas_sin_medicion_se_avisan_para_que_cierren_las_descartadas():
    filas = ["mes;lluvia_mm;t_min_c"] + [f"2022-{m:02d};{m * 10};" for m in range(1, 13)] + ["2023-01;;", "2023-02;-;"]
    r = leer_bytes(("\n".join(filas) + "\n").encode())
    assert r.ok, motivos(r.errores)
    assert r.serie.filas_leidas == 14 and r.serie.filas_usadas == 12
    assert "2 filas tienen fecha pero ninguna medición: no se usan" in motivos(r.serie.avisos)
