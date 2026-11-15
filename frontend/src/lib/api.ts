import type { Entrada, Salida } from "./contrato";
import type { ResultadoPlanilla } from "./planilla";

/**
 * Llamadas al backend (docs/api-frontend.md). Es el único lugar que conoce las
 * URL y los códigos de error; el resto de la app recibe datos o un mensaje.
 *
 * Mock o API real: `NEXT_PUBLIC_USAR_MOCK=false` y `NEXT_PUBLIC_API_URL` en
 * `.env.local` (ver `.env.example`). Sin URL, siempre mock.
 */

/** URL del back sin barra final. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export const USAR_MOCK = process.env.NEXT_PUBLIC_USAR_MOCK !== "false" || API_URL === "";

/** /analizar tarda hasta ~25 s (NASA POWER + Planetary Computer): el documento pide al menos 30. */
export const TIMEOUT_ANALIZAR_MS = 45_000;

/** Error con un texto en español listo para mostrar. */
export class ErrorDeApi extends Error {
  constructor(
    mensaje: string,
    /** Código HTTP, o null si no hubo respuesta (sin conexión, tiempo agotado). */
    readonly estado: number | null,
    /** true si tiene sentido "Probar de nuevo" (NASA no respondió, red, tiempo). */
    readonly reintentable: boolean,
    /** true si el back rechazó el pedido por el esquema (422 con `{detail}`): es un error de la app. */
    readonly deLaApp: boolean = false,
  ) {
    super(mensaje);
    this.name = "ErrorDeApi";
  }
}

/**
 * Texto para mostrar a partir de una respuesta de error del back:
 * - `{mensaje}`: el back ya lo redactó; se muestra tal cual (422, 503, 500, 413).
 * - `{detail: [...]}`: 422 de FastAPI porque el pedido no cumple el esquema. Es
 *   un error del front: se dice así, con el primer campo que falló.
 */
export function mensajeDeError(_estado: number, cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === "object") {
    const c = cuerpo as { mensaje?: unknown; detail?: unknown };
    if (typeof c.mensaje === "string" && c.mensaje.trim()) return c.mensaje.trim();
    if (Array.isArray(c.detail) && c.detail.length) {
      const d = c.detail[0] as { loc?: unknown[]; msg?: unknown };
      const campo = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
      const msg = typeof d.msg === "string" ? d.msg : "valor inválido";
      return `El pedido no tiene el formato que espera el servidor (error de la app, no de tus datos): ${campo ? `${campo}: ` : ""}${msg}`;
    }
  }
  // Sin el código HTTP a la vista (QA H-028): no le dice nada al productor.
  return "El servidor de AgroPixel respondió con un error inesperado.";
}

/**
 * 422 de FastAPI: el pedido no cumple el esquema (`{detail: [...]}` sin
 * `{mensaje}`). Es un error del front, no de los datos del productor.
 */
export function esErrorDeEsquema(cuerpo: unknown): boolean {
  if (!cuerpo || typeof cuerpo !== "object") return false;
  const c = cuerpo as { mensaje?: unknown; detail?: unknown };
  return !(typeof c.mensaje === "string" && c.mensaje.trim()) && Array.isArray(c.detail);
}

/** El servidor no contestó a tiempo (`TIMEOUT_ANALIZAR_MS`). */
export const MENSAJE_TIEMPO_AGOTADO = `El servidor de AgroPixel no terminó de responder en ${TIMEOUT_ANALIZAR_MS / 1000} s.`;

/**
 * Sin respuesta del servidor (fetch rechazado). El navegador sabe si está sin
 * conexión (`navigator.onLine`); si no, el que no responde es nuestro servidor
 * y no tiene sentido mandar a revisar internet.
 */
export function mensajeSinRespuesta(sinInternet: boolean): string {
  return sinInternet
    ? "El navegador está sin conexión a internet."
    : "El servidor de AgroPixel no contestó: puede estar apagado o reiniciándose. No es un problema de tu lote ni de tus entradas.";
}

/** true solo si el navegador avisa que está sin conexión. En el servidor (SSR), false. */
export function navegadorSinConexion(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** 503 = NASA POWER no respondió; 5xx y 408/429 también vale reintentar. */
export const esReintentable = (estado: number) => estado >= 500 || estado === 408 || estado === 429;

async function leerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** POST /analizar. Corta a los `TIMEOUT_ANALIZAR_MS` o cuando se aborta `signal`. */
export async function analizar(entrada: Entrada, signal?: AbortSignal): Promise<Salida> {
  const tiempo = new AbortController();
  const reloj = setTimeout(() => tiempo.abort(), TIMEOUT_ANALIZAR_MS);
  const cortar = () => tiempo.abort();
  signal?.addEventListener("abort", cortar);
  try {
    const r = await fetch(`${API_URL}/analizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entrada),
      signal: tiempo.signal,
    });
    const cuerpo = await leerJson(r);
    if (!r.ok) {
      const esquema = r.status === 422 && esErrorDeEsquema(cuerpo);
      throw new ErrorDeApi(mensajeDeError(r.status, cuerpo), r.status, esReintentable(r.status), esquema);
    }
    if (!cuerpo) throw new ErrorDeApi("El servidor respondió vacío.", r.status, true);
    return cuerpo as Salida;
  } catch (e) {
    if (e instanceof ErrorDeApi) throw e;
    // Abortado por un pedido más nuevo: no es un error para mostrar
    if (signal?.aborted) throw e;
    if (tiempo.signal.aborted) {
      throw new ErrorDeApi(MENSAJE_TIEMPO_AGOTADO, null, true);
    }
    throw new ErrorDeApi(mensajeSinRespuesta(navegadorSinConexion()), null, true);
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener("abort", cortar);
  }
}

/**
 * GET /salud sin esperar la respuesta: "despierta" Cloud Run al cargar la página,
 * porque el primer pedido después de un rato quieto tarda más.
 */
export function despertar(): void {
  if (USAR_MOCK || typeof fetch === "undefined") return;
  fetch(`${API_URL}/salud`).catch(() => {});
}

/**
 * POST /mediciones/planilla (multipart, campo `archivo`).
 * 200 y 422 devuelven `ResultadoPlanilla`; 413 y lo demás, `{mensaje}`, que se
 * pasa a un `ResultadoPlanilla` con el error para que la vista previa lo muestre igual.
 */
export async function subirPlanilla(archivo: File): Promise<ResultadoPlanilla> {
  const error = (motivo: string, sinServidor = false): ResultadoPlanilla => ({
    ok: false,
    serie: null,
    errores: [{ fila: null, motivo }],
    ...(sinServidor ? { sinServidor } : {}),
  });
  try {
    const form = new FormData();
    form.append("archivo", archivo);
    // Sin Content-Type a mano: lo arma el navegador con el boundary
    const r = await fetch(`${API_URL}/mediciones/planilla`, { method: "POST", body: form });
    const cuerpo = await leerJson(r);
    if ((r.status === 200 || r.status === 422) && cuerpo && typeof cuerpo === "object" && "ok" in cuerpo) {
      return cuerpo as ResultadoPlanilla;
    }
    // 5xx: el problema es del servidor, no del archivo (H-024).
    return error(mensajeDeError(r.status, cuerpo), r.status >= 500);
  } catch {
    return error(
      navegadorSinConexion()
        ? "El navegador está sin conexión a internet: no se pudo leer la planilla."
        : "El servidor de AgroPixel no contestó: el archivo no se revisó. Probá de nuevo en unos minutos.",
      true,
    );
  }
}
