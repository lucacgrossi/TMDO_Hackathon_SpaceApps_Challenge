// Constantes del mapa (reglas de zoom: frontend/CLAUDE.md).

/** Lote de la demo, Río Cuarto (sur de Córdoba). [lat, lon] */
export const LOTE_DEMO: [number, number] = [-33.2477, -64.2325];

export const ZOOM_INICIAL = 14;
export const ZOOM_MIN = 5;
export const ZOOM_MAX = 18;

/** Esri tiene imagen hasta 17 en todas las zonas; más arriba se agrandan esas teselas. */
export const ESRI = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  atribucion:
    "Imagen &copy; Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de GIS",
  maxNativeZoom: 17,
};
