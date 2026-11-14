import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests de lógica pura (sin navegador): `npm test`.
 * Por qué vitest: lo eligió el equipo para `cercania.ts` (persona 5) y así
 * hay un solo corredor de tests para todo el front.
 * El alias `@/` es el mismo de tsconfig.json.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
