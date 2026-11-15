import type { Metadata } from "next";
import { IBM_Plex_Sans, Pixelify_Sans } from "next/font/google";
import "leaflet/dist/leaflet.css"; // antes que globals.css, así los estilos de la app lo pisan
import "./globals.css";

/** Títulos (DESIGN.md, "Tipografía"): nunca en números, párrafos ni tablas. */
const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-pixelify",
  display: "swap",
});

/** Todo lo demás. Los números comparables llevan `tabular-nums`. */
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
