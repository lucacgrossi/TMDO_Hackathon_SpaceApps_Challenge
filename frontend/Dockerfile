# --- build ---
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Las NEXT_PUBLIC_* se graban en el JS al compilar. Las variables de proceso
# pisan cualquier .env*, así que no dependen de archivos locales.
ENV NEXT_PUBLIC_USAR_MOCK=false \
    NEXT_PUBLIC_API_URL=https://field-shift-api-757348191517.southamerica-east1.run.app \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime ---
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./
EXPOSE 8080
# Cloud Run pasa el puerto en $PORT (8080 por defecto).
CMD ["sh", "-c", "node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-8080}"]
