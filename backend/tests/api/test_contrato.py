"""El contrato acepta lo que devuelve `satelite/` (Back 2) tal cual. Correr desde backend/: py -m pytest tests/api"""

import pytest
from pydantic import ValidationError

from app.api.contrato import Indicador, MedicionesPropias, MesSatelite, VistoPorSatelite

# Forma de un mes de `satelite/ndvi.py` cuando cae a MODIS de respaldo (compuesto de 16 días, sin nubes de escena).
MES_MODIS = {
    "mes": "2026-03", "fecha": "2026-03-06", "ndvi_medio": 0.612, "nubes_escena": None,
    "coleccion": "modis-13Q1-061", "item": "MOD13Q1.A2026065.h12v12.061", "pixeles": 15,
    "fuente": "NASA MODIS MOD13Q1 · 250 m, compuesto de 16 días · respaldo: sin escena HLS con < 30 % de nubes",
}
MES_HLS = {
    "mes": "2025-07", "fecha": "2025-07-22", "ndvi_medio": 0.264, "nubes_escena": 3.1,
    "coleccion": "hls2-s30", "item": "HLS.S30.T20HLH.2025203T140711.v2.0", "pixeles": 1040,
    "fuente": "NASA HLS S30 (Sentinel-2) · 30 m",
}


def test_mes_modis_sin_nubes_de_escena_es_valido():
    assert MesSatelite.model_validate(MES_MODIS).nubes_escena is None


def test_visto_por_satelite_acepta_faltantes_y_meses_vacios():
    meses = [None] * 12
    meses[2], meses[6] = MES_MODIS, MES_HLS
    v = VistoPorSatelite.model_validate({
        "campana": "2025/26", "fuente": "NASA HLS 30 m + MODIS 250 m (respaldo en 1 de 12 meses)",
        "meses": meses, "meses_ndvi_bajo": 1, "meses_con_dato": 2, "umbral": 0.3, "confianza": "baja",
        "faltantes": [{"mes": "2025-08", "motivo": "agosto de 2025: sin escena"}],
    })
    assert v.meses[6].coleccion == "hls2-s30"


def test_indicador_acepta_nota_de_back_2():
    ind = Indicador.model_validate({
        "valor": 0.6, "unidad": "%", "fuente": "NASADEM · NASA, vía Planetary Computer", "anios": "2000",
        "resolucion": "30 m", "confianza": "alta", "nota": "Plano ajustado sobre 1050 píxeles del lote",
    })
    assert ind.nota.startswith("Plano")


# --- Topes de las mediciones a mano (reporte QA 15/11: 99999 mm y 150 años se aceptaban) ---------

@pytest.mark.parametrize("campos", [{"lluvia_anual_mm": 4000, "anios_registro": 100},
                                    {"lluvia_anual_mm": 650, "anios_registro": 1}])
def test_mediciones_dentro_de_los_topes(campos):
    MedicionesPropias.model_validate(campos)


@pytest.mark.parametrize("campos", [{"lluvia_anual_mm": 99999}, {"lluvia_anual_mm": 4000.1},
                                    {"anios_registro": 150}, {"anios_registro": 101}])
def test_mediciones_fuera_de_los_topes_dan_error(campos):
    with pytest.raises(ValidationError):
        MedicionesPropias.model_validate(campos)
