"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/entradas";
import { centro } from "@/lib/geo";

/**
 * Zona del lote para el título del panel: "Lote cerca de Alpa Corral, Córdoba".
 *
 * Por qué: el prototipo decía "Lote a N km de Río Cuarto", que solo sirve para
 * el lote de ejemplo. El equipo decidió que el título diga la zona real donde
 * está el lote, en cualquier parte del mundo.
 *
 * Cómo: se busca la dirección del centro del lote en el geocodificador inverso
 * de Esri (el mismo servicio que usa el buscador de lugares, sin clave).
 * Mientras responde, o si no hay internet, el título dice solo "Lote marcado"
 * y el subtítulo sigue mostrando las coordenadas, que nunca faltan.
 */

const GEO = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

/** Lo que nos interesa de la respuesta de Esri (`address`). */
export interface DireccionEsri {
  City?: string;
  Subregion?: string;
  Region?: string;
  CntryName?: string;
}

/**
 * Arma el título a partir de la dirección. Usa lo más cercano que haya:
 * localidad → departamento → provincia, y suma la provincia (o el país, si
 * no hay provincia) para ubicarlo. Fuera de Argentina suma también el país.
 * Devuelve null si Esri no dio nada útil (por ejemplo, en el mar).
 */
export function tituloZona(d: DireccionEsri | null | undefined): string | null {
  if (!d) return null;
  const limpio = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  const lugar = limpio(d.City) ?? limpio(d.Subregion);
  const region = limpio(d.Region);
  const pais = limpio(d.CntryName);
  const enArgentina = !pais || pais === "Argentina";
  const extra = [region, enArgentina ? undefined : pais].filter(Boolean).join(", ");
  if (lugar) return `Lote cerca de ${lugar}${extra && extra !== lugar ? `, ${extra}` : ""}`;
  if (region) return `Lote en ${extra}`;
  if (pais) return `Lote en ${pais}`;
  return null;
}

/** Guarda lo ya buscado (por centro redondeado a ~100 m) para no repetir pedidos al mover el lote. */
const cache = new Map<string, string | null>();
const clave = ([lat, lng]: LatLng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

/** Pide la dirección del punto. Lanza si falla la red o Esri responde con error. */
export async function buscarZona([lat, lng]: LatLng, signal?: AbortSignal): Promise<string | null> {
  const url = `${GEO}/reverseGeocode?f=json&langCode=es&location=${lng},${lat}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Esri respondió ${r.status}`);
  const j = (await r.json()) as { address?: DireccionEsri; error?: unknown };
  // Esri responde 200 con { error } cuando no hay dirección cerca: eso no es una falla de red
  return j.error ? null : tituloZona(j.address);
}

/**
 * Hook: título de la zona para el polígono actual. Espera 400 ms a que el lote
 * deje de moverse antes de preguntar, y descarta respuestas viejas.
 */
export function useZona(poligono: LatLng[]): string | null {
  const c = centro(poligono);
  const k = clave(c);
  const [zona, setZona] = useState<string | null>(cache.get(k) ?? null);

  useEffect(() => {
    if (cache.has(k)) return setZona(cache.get(k) ?? null);
    setZona(null); // mientras busca, no queda el nombre del lugar anterior
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      buscarZona(c, ctrl.signal)
        .then((z) => {
          cache.set(k, z);
          setZona(z);
        })
        .catch(() => {
          /* sin red o cancelado: queda "Lote marcado" y las coordenadas */
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // c cambia de referencia en cada render; la clave k ya representa el centro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  return zona;
}
