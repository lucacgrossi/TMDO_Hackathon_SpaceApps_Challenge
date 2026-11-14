import ssl

import certifi

from app.satelite import pc, red, terrario


def _cas(ctx: ssl.SSLContext) -> int:
    return ctx.cert_store_stats()["x509_ca"]


def test_contexto_verifica_y_suma_certifi():
    ctx = red.contexto_ssl()
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname

    solo_certifi = ssl.create_default_context(cafile=certifi.where())
    # Tiene al menos todas las raíces de certifi; las del sistema se suman encima.
    assert _cas(ctx) >= _cas(solo_certifi) > 0


def test_clientes_de_satelite_salen_de_red():
    for modulo in (pc, terrario):
        assert modulo._cliente.headers["User-Agent"] == red.USER_AGENT
        assert modulo._cliente.timeout.connect == modulo.TIMEOUT
