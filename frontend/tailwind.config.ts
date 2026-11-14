import type { Config } from "tailwindcss";

// Los colores son variables CSS (src/app/globals.css), así el modo oscuro
// cambia solo con prefers-color-scheme. Valores: frontend/DESIGN.md.
const v = (n: string) => `var(--${n})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        soft: v("soft"),
        panel: v("panel"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        good: v("good"),
        bad: v("bad"),
        warn: v("warn"),
        mapa: "#0d120f",
        "s-actual": v("s-actual"),
        "s-a": v("s-a"),
        "s-b": v("s-b"),
        "s-c": v("s-c"),
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      borderRadius: { panel: "16px", tarjeta: "14px" },
      boxShadow: {
        panel: "0 10px 40px rgba(0,0,0,.35)",
        flotante: "0 6px 24px rgba(0,0,0,.3)",
      },
      transitionTimingFunction: { suave: "cubic-bezier(.22,1,.36,1)" },
    },
  },
  plugins: [],
};

export default config;
