import type { Config } from "tailwindcss";

// Los colores son las variables CSS del prototipo (src/app/globals.css),
// así el modo oscuro cambia solo con prefers-color-scheme.
const v = (n: string) => `var(--${n})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Sin el reset de Tailwind: el prototipo trae el suyo y se tiene que ver igual.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: Object.fromEntries(
        ["ink", "muted", "line", "panel", "soft", "accent", "accent-ink", "accent-soft", "bg",
         "good", "bad", "warn", "s-actual", "s-a", "s-b", "s-c",
         "verano", "invierno", "cobertura", "barbecho", "seco", "normal", "humedo"].map((n) => [n, v(n)]),
      ),
      fontFamily: { sans: ["var(--f)"] },
    },
  },
  plugins: [],
};

export default config;
