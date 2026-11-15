import type { Metadata } from "next";
import localFont from "next/font/local";
import "leaflet/dist/leaflet.css"; // antes que globals.css, así los estilos de la app lo pisan
import "./globals.css";

/*
 * Las fuentes van en el repo (`./fuentes/`, licencia OFL) y no se bajan de
 * Google Fonts en cada build: el build de Vercel fallaba seguido al pedirlas
 * (`next/font/google`, "Cannot read properties of null"). Son las versiones
 * variables del subconjunto latino (incluye tildes y ñ), las mismas que servía
 * Google.
 */

/** Títulos (DESIGN.md, "Tipografía"): nunca en números, párrafos ni tablas. */
const pixelify = localFont({
  src: "./fuentes/PixelifySans-variable-latin.woff2",
  weight: "400 700",
  variable: "--font-pixelify",
  display: "swap",
});

/** Todo lo demás. Los números comparables llevan `tabular-nums`. */
const plex = localFont({
  src: "./fuentes/IBMPlexSans-variable-latin.woff2",
  weight: "100 700",
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgroPixel",
  description: "Datos de NASA para comparar la rotación de tu lote.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${pixelify.variable} ${plex.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
