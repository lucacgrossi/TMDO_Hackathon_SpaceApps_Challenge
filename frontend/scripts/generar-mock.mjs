/**
 * Regenera `src/mocks/rio-cuarto.ts` desde la demo precalculada del back
 * (`backend/app/demo/rio_cuarto.json`), para que el mock del front siga el
 * contrato vigente (H-019). Desde `frontend/`:
 *
 *   node scripts/generar-mock.mjs
 *
 * Copia el JSON tal cual: solo pone `es_mock` en true y suma al principio de
 * "Información que falta" de dónde salen los datos (como hace el back cuando
 * sirve la respuesta precalculada; ver `AVISO_PRECALCULADO`). Lo que depende de las
 * entradas (área y centro del lote dibujado, No sembrar, mediciones) lo ajusta
 * `src/mocks/analizar.ts` en cada pedido. Sin dependencias: Node 20.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = resolve(aqui, "../../backend/app/demo/rio_cuarto.json");
const destino = resolve(aqui, "../src/mocks/rio-cuarto.ts");

const demo = JSON.parse(readFileSync(origen, "utf-8"));
for (const clave of ["lote", "estrategias", "capas", "clima_mensual", "periodo_clima"]) {
  if (!(clave in demo)) throw new Error(`La demo no trae "${clave}": ¿cambió el contrato?`);
}
demo.es_mock = true;
const AVISO_MOCK =
  "Mock del front: se muestra la respuesta precalculada del lote de la demo (Río Cuarto); solo la superficie y la ubicación siguen al lote dibujado";
demo.informacion_falta = [AVISO_MOCK, ...(demo.informacion_falta ?? []).filter((v) => v !== AVISO_MOCK)];

const cabecera = `/**
 * Salida de /analizar para el lote de la demo (Río Cuarto): copia de
 * \`backend/app/demo/rio_cuarto.json\` (la demo precalculada del back, con datos
 * reales de NASA de ese lote), con \`es_mock\` en true y el aviso del mock al
 * principio de "Información que falta". TypeScript la valida contra
 * \`contrato.ts\` al compilar.
 *
 * NO EDITAR A MANO: se genera con \`node scripts/generar-mock.mjs\` (desde
 * \`frontend/\`). Si el back regenera la demo, se vuelve a correr.
 * Lo que depende de las entradas (área y centro del lote dibujado, No sembrar,
 * mediciones) se arma en \`analizar.ts\`.
 */
import type { Salida } from "@/lib/contrato";

export const RIO_CUARTO: Salida = `;

writeFileSync(destino, `${cabecera}${JSON.stringify(demo, null, 2)};\n`, "utf-8");
console.log(`Mock regenerado desde ${origen} (período ${demo.periodo_clima}).`);
