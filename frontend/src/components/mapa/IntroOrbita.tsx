"use client";

import L from "leaflet";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";
import { useApp } from "@/lib/app";
import {
  aperturaNubes,
  COLORES_SATELITE,
  fechaNubes,
  SATELITE,
  trazosGrilla,
  urlNubes,
  ZOOM_NATIVO_NUBES,
} from "@/lib/momentos";
import { useEntradas } from "@/lib/store";
import css from "./IntroOrbita.module.css";

/** Vista desde la órbita: Sudamérica entera. */
const DESDE: [number, number] = [-28, -63];
const ZOOM_ORBITA = 3.5;
/** Llegada: la región pampeana, donde se busca y se marca el lote (la vista inicial de S1). */
const HASTA: [number, number] = [-33.5, -62.5];
const ZOOM_LLEGADA = 7;
/** El zoom mínimo normal del mapa (frontend/CLAUDE.md, "Límites de zoom"). */
const ZOOM_MINIMO = 5;

/** Duración del vuelo de la cámara, con aceleración y frenado suaves. */
const MS_VUELO = 3200;
/** Espera mínima en la órbita (que se vea Sudamérica) y máxima esperando las teselas del recorrido. */
const MS_ORBITA_MIN = 500;
// Con red lenta (la de la presentación) conviene esperar un poco más en la
// órbita, con el satélite cruzando, que despegar y bajar teselas en pleno vuelo.
const MS_ORBITA_MAX = 2500;
/** Lo que se ven las nubes quietas en la órbita antes de que la cámara baje. */
const MS_NUBES_QUIETAS = 700;

/** Velocidad del satélite: constante, igual en cualquier pantalla. */
const PX_POR_SEGUNDO = 420;
const MS_CRUCE_MIN = 2600;
const MS_CRUCE_MAX = 4600;

const trazos = trazosGrilla(SATELITE, COLORES_SATELITE);

/** Cada montaje crea su panel de nubes con otro nombre (en desarrollo, StrictMode monta dos veces). */
let montajes = 0;

/**
 * ¿Hay que volar desde la órbita? Solo al abrir S1 sin lote y sin
 * `prefers-reduced-motion`. Mapa lo usa para arrancar ya en la órbita y no
 * mostrar un cuadro de la región antes de saltar a Sudamérica.
 */
export function hayIntro(): boolean {
  if (typeof window === "undefined") return false;
  const enS1SinLote = useApp.getState().etapa === "marcar" && useEntradas.getState().poligono.length < 3;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return enS1SinLote && !reducido;
}

/** Vista con la que se crea el mapa cuando hay intro. */
export const VISTA_ORBITA = { centro: DESDE, zoom: ZOOM_ORBITA, zoomMinimo: 3 } as const;

/** Aceleración y frenado simétricos (ease-in-out senoidal): sin arranque brusco ni frenada seca. */
const suave = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * Recorrido de la cámara en el instante t (0 a 1). El zoom sube con `suave(t)`
 * y el centro se arma para que el punto de llegada se deslice en pantalla
 * hacia el medio con el mismo ritmo: así el paneo no se acelera a medida que
 * crece la escala (lo que hace un paneo lineal en grados).
 */
function recorrido(mapa: L.Map, t: number): { centro: L.LatLng; zoom: number } {
  const e = suave(t);
  const zoom = ZOOM_ORBITA + (ZOOM_LLEGADA - ZOOM_ORBITA) * e;
  const desfase0 = mapa.project(HASTA, ZOOM_ORBITA).subtract(mapa.project(DESDE, ZOOM_ORBITA));
  const centroPx = mapa.project(HASTA, zoom).subtract(desfase0.multiplyBy(1 - e));
  return { centro: mapa.unproject(centroPx, zoom), zoom };
}

/** Las capas de teselas que hay en el mapa en este momento. */
function capasDeTeselas(mapa: L.Map): L.TileLayer[] {
  const capas: L.TileLayer[] = [];
  mapa.eachLayer((c) => {
    if (c instanceof L.TileLayer) capas.push(c);
  });
  return capas;
}

/** 25 instantes del vuelo, de la órbita (0) a la llegada (1). */
const TODO_EL_VUELO = Array.from({ length: 25 }, (_, i) => i / 24);

/**
 * URLs de las teselas que el vuelo va a pedir (cada capa, en el nivel entero
 * que Leaflet usa en cada instante). Se bajan antes de despegar para que, al
 * cambiar de nivel en pleno vuelo, salgan de la caché del navegador y no
 * aparezcan de golpe ni con huecos.
 */
function teselasDelVuelo(mapa: L.Map, capas: L.TileLayer[], instantes: number[]): string[] {
  const tamano = mapa.getSize();
  const urls = new Set<string>();
  for (const t of instantes) {
    const { centro, zoom } = recorrido(mapa, t);
    for (const capa of capas) {
      const nativo = capa.options.maxNativeZoom ?? capa.options.maxZoom ?? 18;
      const nivel = Math.min(Math.round(zoom), nativo);
      const mitad = tamano.divideBy(2 * mapa.getZoomScale(zoom, nivel));
      const medio = mapa.project(centro, nivel);
      const lado = 256;
      const max = 2 ** nivel - 1;
      const x0 = Math.floor((medio.x - mitad.x) / lado);
      const x1 = Math.floor((medio.x + mitad.x) / lado);
      const y0 = Math.max(0, Math.floor((medio.y - mitad.y) / lado));
      const y1 = Math.min(max, Math.floor((medio.y + mitad.y) / lado));
      const plantilla = (capa as unknown as { _url: string })._url;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const xx = ((x % (max + 1)) + max + 1) % (max + 1);
          urls.add(L.Util.template(plantilla, { ...capa.options, s: "", r: "", x: xx, y, z: nivel }));
        }
      }
    }
  }
  return [...urls];
}

/**
 * Baja y decodifica las imágenes (quedan en caché ya decodificadas, así el
 * navegador no las decodifica en pleno vuelo); se resuelve cuando terminaron
 * todas o se cancela.
 */
function precargar(urls: string[], cancelado: () => boolean): Promise<void> {
  return new Promise((resolver) => {
    let faltan = urls.length;
    if (faltan === 0) resolver();
    const lista = () => {
      faltan--;
      if (faltan === 0 || cancelado()) resolver();
    };
    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      img.decode().then(lista, lista);
    }
  });
}

/**
 * "De la órbita al lote" (DESIGN.md, "Movimiento"): al abrir la app, el mapa
 * arranca con Sudamérica vista desde lejos, un satélite pixel (como los del
 * logo) cruza la pantalla a velocidad constante y se apaga al salir, y la
 * cámara baja hasta la región pampeana. En la órbita se ve la Tierra de ayer
 * (VIIRS NOAA-20 en color verdadero, por NASA GIBS), con sus nubes; al bajar,
 * las nubes se apartan hacia los bordes y crecen, como si la cámara las
 * atravesara, hasta desaparecer y dejar el mapa base. Pasa una vez, al entrar a S1 sin lote;
 * cualquier toque en el mapa corta el vuelo (el satélite igual termina de
 * salir). Con `prefers-reduced-motion` no pasa: el mapa arranca en la región.
 *
 * El vuelo no usa `flyTo`: Leaflet arranca a toda velocidad (solo frena al
 * final) y pide las teselas de cada nivel recién al llegar a él, y eso se veía
 * a los saltos. Acá cada cuadro mueve la cámara con `_move` (lo mismo que hace
 * `flyTo` por dentro, sin tirar las teselas como `setView`), con aceleración y
 * frenado suaves y las teselas del recorrido ya bajadas.
 *
 * Vive dentro de <MapContainer> (usa `useMap`).
 */
export default function IntroOrbita() {
  const mapa = useMap();
  const [cruce, setCruce] = useState<{ ancho: number; ms: number } | null>(null);

  useEffect(() => {
    if (!hayIntro()) return;

    const contenedor = mapa.getContainer();
    const ancho = contenedor.clientWidth;
    const ms = Math.min(MS_CRUCE_MAX, Math.max(MS_CRUCE_MIN, ((ancho + 180) / PX_POR_SEGUNDO) * 1000));
    setCruce({ ancho, ms });

    // Nubes: la imagen VIIRS de ayer en una capa de teselas propia. Su panel
    // vive en un contenedor fuera del panel del mapa, para enmascararlo y
    // escalarlo sin tocar las transformaciones de Leaflet: durante el vuelo el
    // panel del mapa no se desplaza (solo cambian centro y zoom), así que las
    // teselas quedan alineadas con el mapa base.
    const fecha = fechaNubes(new Date());
    const capaNubes = document.createElement("div");
    capaNubes.className = css.nubes;
    contenedor.appendChild(capaNubes);
    const rotulo = document.createElement("p");
    rotulo.className = css.rotuloNubes;
    rotulo.textContent = `Sudamérica el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)} · NASA VIIRS (NOAA-20)`;
    contenedor.appendChild(rotulo);
    const nombrePanel = `intro-nubes-${++montajes}`;
    mapa.createPane(nombrePanel, capaNubes);
    const nubes = L.tileLayer(urlNubes(fecha), {
      pane: nombrePanel,
      maxNativeZoom: ZOOM_NATIVO_NUBES,
      maxZoom: 19,
      keepBuffer: 4,
      attribution: `Nubes del ${fecha}: NASA GIBS · VIIRS NOAA-20`,
    }).addTo(mapa);
    // Las nubes aparecen de una vez (fundido de 0,5 s) cuando sus teselas de
    // la órbita ya bajaron, no de a pedazos.
    const mostrarNubes = () => {
      capaNubes.classList.add(css.cargadas);
      rotulo.classList.add(css.cargadas);
    };
    nubes.once("load", mostrarNubes);

    // a = 0: nubes cerradas; a = 1: se fueron. El hueco transparente crece
    // desde el centro (la máscara arranca en −22 % para que cerradas tapen todo)
    // y la capa se agranda un 30 %: las nubes se alejan hacia los bordes.
    const abrirNubes = (a: number) => {
      capaNubes.style.setProperty("--abierto", `${(-22 + a * 122).toFixed(1)}%`);
      capaNubes.style.setProperty("--escala", `${(1 + 0.3 * a).toFixed(3)}`);
      rotulo.style.setProperty("--apertura", `${a}`);
    };
    // Los nombres (capa semitransparente) salen del mapa durante el vuelo: al
    // cambiar de nivel, Leaflet deja el nivel viejo debajo del nuevo hasta que
    // termina el fundido y se veían los nombres duplicados. Sacarlos (y no solo
    // volverlos transparentes) evita además bajar y armar sus teselas en cada
    // nivel del vuelo. Vuelven al aterrizar, con las de la región ya en caché.
    const nombres = capasDeTeselas(mapa).filter((c) => c.options.className === "capa-nombres");
    const urlsNombres = teselasDelVuelo(mapa, nombres, [1]);
    nombres.forEach((capa) => mapa.removeLayer(capa));
    const mostrarNombres = () => {
      // Si el mapa ya se destruyó (Leaflet borra sus paneles), no hay dónde volver a ponerlos.
      if (!(mapa as unknown as { _mapPane?: HTMLElement })._mapPane) return;
      nombres.forEach((capa) => {
        if (!mapa.hasLayer(capa)) capa.addTo(mapa);
      });
    };

    // Cuando las nubes ya se fueron (falta el último 20 % del vuelo) se ocultan
    // y su capa deja de pedir teselas; se sacan del todo al aterrizar, con la
    // cámara quieta, para no borrar cientos de teselas en pleno movimiento.
    let nubesOcultas = false;
    const ocultarNubes = () => {
      if (nubesOcultas) return;
      nubesOcultas = true;
      capaNubes.style.visibility = "hidden";
      rotulo.style.visibility = "hidden";
      const eventos = nubes.getEvents?.();
      if (eventos) mapa.off(eventos, nubes);
    };

    let nubesFuera = false;
    const quitarNubes = (suave: boolean) => {
      if (nubesFuera) return;
      nubesFuera = true;
      const sacar = () => {
        nubes.remove();
        capaNubes.remove();
        rotulo.remove();
        delete (mapa as unknown as { _panes: Record<string, HTMLElement> })._panes[nombrePanel];
      };
      if (!suave) return sacar();
      // Si el productor corta el vuelo, las nubes se desvanecen rápido en vez de desaparecer de golpe.
      capaNubes.classList.add(css.irse);
      rotulo.classList.add(css.irse);
      window.setTimeout(sacar, 400);
    };

    // Acceso a lo interno de Leaflet 1.9 (versión fija en package.json): mover
    // la cámara un cuadro como lo hace flyTo, sin animación de zoom CSS.
    const interno = mapa as unknown as {
      _move: (c: L.LatLng, z: number, d?: object) => L.Map;
      _moveStart: (zoomChanged: boolean, noMoveStart: boolean) => L.Map;
      _moveEnd: (zoomChanged: boolean) => L.Map;
    };

    let cancelado = false;
    let volando = false;
    let cuadro = 0;
    let ultimo: L.LatLng | null = null;

    // Devuelve el zoom mínimo normal. Si el vuelo se cortó más lejos que ese
    // mínimo, subirlo de golpe haría saltar la cámara: queda en el zoom actual
    // y vuelve a 5 cuando el productor se acerca hasta ahí.
    const alcanzarMinimo = () => {
      if (mapa.getZoom() < ZOOM_MINIMO) return;
      mapa.setMinZoom(ZOOM_MINIMO);
      mapa.off("zoomend", alcanzarMinimo);
    };
    const devolverMinimo = () => {
      if (mapa.getZoom() >= ZOOM_MINIMO) return mapa.setMinZoom(ZOOM_MINIMO);
      mapa.setMinZoom(mapa.getZoom());
      mapa.on("zoomend", alcanzarMinimo);
    };

    const terminar = (devolverZoomMinimo = true) => {
      contenedor.classList.remove(css.volando);
      mostrarNombres();
      if (volando) {
        volando = false;
        interno._moveEnd(true);
      }
      if (devolverZoomMinimo) devolverMinimo();
      quitarNubes(devolverZoomMinimo);
      quitar();
    };
    // Cualquier gesto del productor corta el vuelo y le devuelve el mapa.
    const cortar = () => {
      cancelado = true;
      cancelAnimationFrame(cuadro);
      terminar();
    };
    const quitar = () => {
      contenedor.removeEventListener("pointerdown", cortar);
      contenedor.removeEventListener("wheel", cortar);
      contenedor.removeEventListener("keydown", cortar);
    };

    mapa.setMinZoom(VISTA_ORBITA.zoomMinimo);
    // Mapa ya arranca en la órbita; esto cubre el caso de que se haya montado en otra vista.
    if (mapa.getZoom() !== ZOOM_ORBITA) mapa.setView(DESDE, ZOOM_ORBITA, { animate: false });
    contenedor.addEventListener("pointerdown", cortar);
    contenedor.addEventListener("wheel", cortar, { passive: true });
    contenedor.addEventListener("keydown", cortar);

    const volar = () => {
      if (cancelado) return;
      volando = true;
      // Cada nivel de teselas pasa a ser una capa con su imagen fija mientras
      // cambia la escala (ver .volando en el CSS).
      contenedor.classList.add(css.volando);
      interno._moveStart(true, false);
      let inicio = -1;
      const paso = (ahora: number) => {
        if (cancelado) return;
        // Si otra cosa movió la cámara (el buscador, por ejemplo), se le cede.
        // Sin moveend propio: ese vuelo ajeno avisa cuando termina.
        if (ultimo && !mapa.getCenter().equals(ultimo, 1e-9)) {
          volando = false;
          return terminar();
        }
        if (inicio < 0) inicio = ahora;
        const t = Math.min(1, (ahora - inicio) / MS_VUELO);
        const { centro, zoom } = t < 1 ? recorrido(mapa, t) : { centro: L.latLng(HASTA), zoom: ZOOM_LLEGADA };
        interno._move(centro, zoom, { flyTo: true });
        ultimo = mapa.getCenter();
        const a = aperturaNubes(t);
        if (a < 1) abrirNubes(a);
        else ocultarNubes();
        if (t < 1) cuadro = requestAnimationFrame(paso);
        else terminar();
      };
      cuadro = requestAnimationFrame(paso);
    };

    // Despega cuando las teselas del recorrido están en caché (o al tope de espera).
    const t0 = performance.now();
    let despego = false;
    const despegar = () => {
      if (despego || cancelado) return;
      despego = true;
      mostrarNubes();
      volar();
    };
    const tope = window.setTimeout(despegar, MS_ORBITA_MAX);
    const urlsVuelo = teselasDelVuelo(mapa, capasDeTeselas(mapa), TODO_EL_VUELO);
    precargar([...urlsVuelo, ...urlsNombres], () => cancelado || despego).then(() => {
      // Con todo en caché, las nubes se muestran y se dejan ver quietas un momento antes de bajar.
      window.clearTimeout(tope);
      mostrarNubes();
      const espera = Math.max(MS_NUBES_QUIETAS, MS_ORBITA_MIN - (performance.now() - t0));
      window.setTimeout(despegar, espera);
    });

    return () => {
      cancelado = true;
      window.clearTimeout(tope);
      cancelAnimationFrame(cuadro);
      mapa.off("zoomend", alcanzarMinimo);
      // Sin devolver el zoom mínimo: en desarrollo (StrictMode) el efecto se
      // monta dos veces y subir el mínimo a 5 en la órbita haría un zoom de más.
      // Si el mapa se desmonta de verdad, el mínimo ya no importa.
      terminar(false);
    };
  }, [mapa]);

  if (!cruce) return null;
  return createPortal(
    <div className={css.orbita} aria-hidden="true">
      <svg
        className={css.satelite}
        style={{ "--ancho": `${cruce.ancho}px`, "--duracion": `${cruce.ms}ms` } as CSSProperties}
        viewBox="0 0 19 7"
        shapeRendering="crispEdges"
        focusable="false"
        // Se desmonta recién cuando terminó de salir de la pantalla.
        onAnimationEnd={() => setCruce(null)}
      >
        {Object.entries(trazos).map(([c, d]) => (
          <path key={c} d={d} style={{ fill: COLORES_SATELITE[c] }} />
        ))}
      </svg>
    </div>,
    mapa.getContainer(),
  );
}
