import type { Config } from "tailwindcss";

// Los colores son los tokens de DESIGN.md (variables CSS en src/app/globals.css).
// Un solo tema, claro. Los nombres del prototipo (ink, accent, bg…) siguen
// hasta que ninguna pantalla los use: en globals.css apuntan a los tokens nuevos.
const v = (n: string) => `var(--${n})`;

const TOKENS = [
  "rastrojo", "papel", "soft", "line", "noche", "muted",
  "hoja", "hoja-brillo", "hoja-suave", "suelo", "suelo-suave", "cielo", "cielo-brillo", "cielo-suave",
  "good", "bad", "warn", "s-actual", "s-a", "s-b", "s-c",
  "verano", "invierno", "cobertura", "barbecho", "seco", "normal", "humedo",
];
const DEL_PROTOTIPO = ["ink", "panel", "accent", "accent-ink", "accent-soft", "bg"];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Sin el reset de Tailwind: el CSS del prototipo trae el suyo mientras se migra.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: Object.fromEntries([...TOKENS, ...DEL_PROTOTIPO].map((n) => [n, v(n)])),
      fontFamily: { sans: ["var(--f)"], titulo: ["var(--f-titulo)"] },
      borderRadius: { dato: v("radio-dato"), panel: v("radio-panel") },
      boxShadow: { pixel: v("sombra-pixel") },
    },
  },
  plugins: [],
};

export default config;
