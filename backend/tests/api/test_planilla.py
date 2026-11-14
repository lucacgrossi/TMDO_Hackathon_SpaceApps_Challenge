"""POST /mediciones/planilla (docs/plan-planilla-lluvia.md, 5.2). Sin red: el parser se simula."""

import pytest
from fastapi.testclient import TestClient

from app.api import rutas
from app.api.contrato import AvisoFila, ResultadoPlanilla
from app.api.mock import planilla_mock
from app.main import app

# TestClient abre un socketpair local para el event loop (no sale a la red).
pytestmark = pytest.mark.enable_socket

cliente = TestClient(app)
CSV_OK = "mes;lluvia_mm\n2022-07;4\n2022-08;9,5\n".encode()


def _subir(contenido: bytes, nombre: str = "planilla.csv"):
    return cliente.post("/mediciones/planilla", files={"archivo": (nombre, contenido, "text/csv")})


@pytest.fixture
def parser(monkeypatch):
    """Parser simulado: devuelve el mock si el archivo empieza con "mes", y error si no."""
    recibido = {}

    def leer_planilla(contenido: bytes, nombre: str | None = None) -> ResultadoPlanilla:
        recibido.update(contenido=contenido, nombre=nombre)
        if contenido.startswith(b"mes"):
            return planilla_mock()
        return ResultadoPlanilla(ok=False, errores=[AvisoFila(fila=2, motivo="Fecha inválida: 32/13/2023")])

    monkeypatch.setattr(rutas, "_cargar_parser", lambda: leer_planilla)
    return recibido


def test_csv_valido_da_200_con_la_serie(parser):
    r = _subir(CSV_OK)
    assert r.status_code == 200
    cuerpo = ResultadoPlanilla.model_validate(r.json())
    assert cuerpo.ok and len(cuerpo.serie.meses) == 12
    assert parser == {"contenido": CSV_OK, "nombre": "planilla.csv"}


def test_csv_invalido_da_422_con_los_errores_por_fila(parser):
    r = _subir(b"fecha;lluvia\n32/13/2023;5\n")
    assert r.status_code == 422
    assert r.json()["errores"] == [{"fila": 2, "motivo": "Fecha inválida: 32/13/2023"}]


def test_mas_de_1_mb_da_413(parser):
    r = _subir(b"x" * (rutas.MAX_BYTES_PLANILLA + 1))
    assert r.status_code == 413
    assert r.json() == {"mensaje": "La planilla supera 1 MB"}
    assert parser == {}  # ni llega al parser


def test_justo_1_mb_no_da_413(parser):
    assert _subir(b"mes" + b"x" * (rutas.MAX_BYTES_PLANILLA - 3)).status_code == 200


@pytest.mark.parametrize("contenido", [b"", b"   \n\n"])
def test_archivo_vacio_da_422(parser, contenido):
    r = _subir(contenido)
    assert r.status_code == 422
    assert r.json()["errores"][0]["motivo"] == "El archivo está vacío"


def test_sin_parser_todavia_da_422_con_aviso(monkeypatch):
    monkeypatch.setattr(rutas, "_cargar_parser", lambda: None)
    r = _subir(CSV_OK)
    assert r.status_code == 422
    assert r.json()["errores"][0]["motivo"] == rutas.PARSER_PENDIENTE


def test_parser_que_lanza_no_rompe_la_api(monkeypatch):
    def roto(contenido, nombre=None):
        raise RuntimeError("bug")

    monkeypatch.setattr(rutas, "_cargar_parser", lambda: roto)
    r = _subir(CSV_OK)
    assert r.status_code == 422
    assert r.json()["ok"] is False


def test_parser_que_devuelve_dict_se_valida(monkeypatch):
    monkeypatch.setattr(rutas, "_cargar_parser", lambda: lambda c, n=None: planilla_mock().model_dump())
    assert _subir(CSV_OK).status_code == 200


def test_sin_archivo_da_422():
    assert cliente.post("/mediciones/planilla").status_code == 422
