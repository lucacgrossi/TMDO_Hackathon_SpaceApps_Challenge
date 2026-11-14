"""
Textos fijos de cada columna: resumen y los 5 puntos (por qué aparece,
evidencia, beneficios, información que falta y revisar con el agrónomo). Salen solo de lo que calcularon las reglas.

Lenguaje (principio 8): nunca "recomendamos", "deberías" ni "la mejor".
Se usa "esta alternativa…", "los datos muestran…". Lo controla un test.
"""

from app.motor.cultivos import C, MESES, nombre
from app.motor.reglas import OBJ

ETIQUETA = {"agua": "agua", "suelo": "suelo", "erosion": "erosión", "ingreso": "ingreso"}
UMBRAL_CAMBIO = 10       # puntos de diferencia para decir "gana" o "pierde"
PALABRAS_PROHIBIDAS = ("recomend", "deberías", "deberia", "la mejor", "te conviene")


def _lista(items):
    items = [ETIQUETA[i] for i in items]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]


def resumen(s, actual):
    """Una línea arriba de cada columna (principio 4)."""
    if s["id"] == "actual":
        return f"Línea de base: {s['meses_pelados']} meses con el lote pelado."
    dif = {o: (s["agua_por_tipo"]["normal"] if o == "agua" else s[o])
              - (actual["agua_por_tipo"]["normal"] if o == "agua" else actual[o]) for o in OBJ}
    gana = [o for o in OBJ if dif[o] >= UMBRAL_CAMBIO]
    pierde = [o for o in OBJ if dif[o] <= -UMBRAL_CAMBIO]
    partes = []
    if gana:
        partes.append("Gana en " + _lista(gana))
    if pierde:
        partes.append("pierde en " + _lista(pierde))
    mm = s["agua_mm"]["seco"]["balance"] - actual["agua_mm"]["seco"]["balance"]
    if mm <= -5:
        partes.append(f"cuesta ~{-mm} mm en años secos")
    if not partes:
        return "Los datos muestran diferencias chicas frente a lo que se hace hoy."
    texto = "; ".join(partes)
    return texto[0].upper() + texto[1:] + "."


def por_que(s):
    """Prototipo: `why` en `render()`. Mismas frases."""
    r = []
    if s["id"] == "actual":
        r.append(f"{s['meses_pelados']} meses con el lote pelado")
    if s.get("cobertura"):
        r.append(f"Cubre el suelo {12 - s['meses_pelados']} meses")
        if s["cobertura"] == "vicia":
            r.append("La vicia fija nitrógeno")
    if s.get("invierno"):
        r.append("Suma un cultivo que se vende en invierno")
    if s.get("nuevo_verano"):
        extra = " y tolera la sequía" if s["nuevo_verano"] == "sorgo" else ""
        r.append(f"{nombre(s['nuevo_verano'])} corta el ciclo de plagas{extra}")
    return r


def beneficios(s, lista):
    """
    Lo que la columna mejora, en números y frente a la otra referencia:
    una alternativa se compara con la actual; la actual, con todas las
    alternativas activas (solo cuenta lo que ninguna supera).
    """
    actual = lista[0]
    otras = [x for x in lista[1:] if x["on"]]
    b = []

    def dim(x, o):
        return x["agua_por_tipo"]["normal"] if o == "agua" else x[o]

    if s["id"] == "actual":
        for o in OBJ:
            if otras and all(dim(s, o) >= dim(x, o) for x in otras):
                b.append(f"{ETIQUETA[o].capitalize()}: {dim(s, o)}/100, igual o más que todas las alternativas")
        return b
    cub = actual["meses_pelados"] - s["meses_pelados"]
    if cub > 0:
        b.append(f"{cub} meses más de cobertura que hoy")
    mm = s["agua_mm"]["seco"]["balance"] - actual["agua_mm"]["seco"]["balance"]
    if mm >= 5:
        b.append(f"+{mm} mm de balance de agua en años secos")
    for o in OBJ:
        d = dim(s, o) - dim(actual, o)
        if d >= UMBRAL_CAMBIO:
            b.append(f"{ETIQUETA[o].capitalize()}: +{d} puntos frente a hoy")
    return b


def evidencia(s, n=4):
    """Los datos de las reglas que más movieron el puntaje, con su fuente."""
    aportes = [a for a in s["aportes"] if not a["regla"].endswith("_base")]
    aportes.sort(key=lambda a: -abs(sum(a["efecto"].values())))
    return [a["dato"] for a in aportes[:n]]


def revisar(s, entradas, ind):
    """
    Lo que tiene que mirar el agrónomo (reglas negativas).
    Prototipo: `rev` en `render()`. Se agregan, con datos, las heladas y el
    calor por mes y "sensible al clima", que el prototipo solo marcaba con color.
    """
    r = []
    if s["agua_por_tipo"]["seco"] < 40:
        r.append("Poca reserva de agua en años secos")
    if s["repite"]:
        r.append("Repite el cultivo de la campaña pasada")
    if s.get("cobertura") == "vicia" and entradas.get("anegable") in ("si", "a_veces"):
        r.append("Lote que se encharca: riesgo de mala implantación de la vicia")
    if s.get("cobertura"):
        r.append("Secado ~30 días antes de la siembra")
    if entradas.get("maquinaria_limitada") and s["id"] in ("B", "C"):
        r.append("Requiere maquinaria para un cultivo nuevo")
    if s["helada_conflicto"]:
        meses = ", ".join(MESES[m] for m in s["helada_conflicto"])
        r.append(f"Cultivo sensible a helada en meses con helada frecuente ({meses})")
    if s["calor"]:
        meses = ", ".join(MESES[m] for m in s["calor"])
        r.append(f"Cultivo de verano en meses con calor ≥ 35 °C en la mitad de los años ({meses})")
    if s.get("sensible_clima"):
        r.append("El resultado cambia mucho entre años secos y húmedos: sensible al clima")
    vs = ind.get("visto_satelite")
    if s["id"] == "actual" and vs and vs.get("meses_con_dato", 0) >= 8 \
            and abs(vs["meses_pelados"] - s["meses_pelados"]) >= 2:
        r.append(f"Lo que vio el satélite no coincide con la rotación cargada: "
                 f"{vs['meses_pelados']} meses con el lote pelado en {vs.get('campania', 'la última campaña')}, "
                 f"contra {s['meses_pelados']} según el calendario")
    return r


def falta(entradas, resultado):
    """
    Prototipo: `falta` en `render()`. Se suma la pendiente cuando no llegó el
    dato real (principio "nada inventado"). Los faltantes de NASA (fuente
    caída) los agrega Back 1 en servicio.py, que es quien sabe qué falló.
    """
    f = ["Precios"]
    if entradas.get("materia_organica_pct") is None:
        f.append("Materia orgánica")
    if entradas.get("textura") in (None, "no_se"):
        f.append("Textura")
    if not resultado["pendiente_real"]:
        f.append(f"Pendiente (se usó {resultado['pendiente_pct']} %, la del lote demo)")
    return f


def texto_choque(ch):
    if not ch["hay"]:
        return ""
    a, b = ch["objetivos"]
    return (f"{ETIQUETA[a].capitalize()} y {ETIQUETA[b]} chocan en este lote. "
            f"En {ETIQUETA[a]} queda más cerca {ch['mejor'][a]}; en {ETIQUETA[b]}, "
            f"{ch['mejor'][b]}. Ninguna cumple las dos.")


def armar(resultado, entradas, ind):
    """Agrega los textos a cada columna. Devuelve el mismo resultado."""
    lista = resultado["estrategias"]
    actual = lista[0]
    faltan = falta(entradas, resultado)
    for s in lista:
        if not s["on"]:
            s["resumen"] = f"Descartada: {s['motivo']}."
            continue
        s["resumen"] = resumen(s, actual)
        s["por_que"] = por_que(s)
        s["evidencia"] = evidencia(s)
        s["beneficios"] = beneficios(s, lista)
        s["revisar"] = revisar(s, entradas, ind)
        s["falta"] = faltan
    resultado["choque"]["texto"] = texto_choque(resultado["choque"])
    resultado["aviso"] = "Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo."
    return resultado
