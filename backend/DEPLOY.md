# Deploy del backend en Cloud Run

Dueño: Back 2. Servicio `field-shift-api`, región `southamerica-east1` (São Paulo). Cloud Run construye el contenedor con buildpacks a partir de estos archivos de `backend/`:

| Archivo | Para qué |
|---|---|
| `requirements.txt` | Dependencias (incluye `fastapi` y `uvicorn`) |
| `Procfile` | `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT` (Cloud Run pone `PORT=8080`) |
| `.python-version` | `3.12`, la misma versión que la CI |
| `.gcloudignore` | Deja afuera tests, cachés, `.venv`, scripts, datos pesados y `.env`. **Sí** sube `app/demo/` y `app/api/mock_rio_cuarto.json` |

Todos los comandos van en Git Bash, **desde `backend/`**. Se deploya desde `main` después de probar en `dev`; desde otra branch, solo una prueba sin tráfico (paso 4).

```bash
SERVICIO=field-shift-api
REGION=southamerica-east1
```

## 1. Configuración inicial (una vez por compu)
Instalar el [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) y después:
```bash
gcloud auth login
gcloud projects list                          # copiar el ID del proyecto de la hackathon
gcloud config set project <ID_DEL_PROYECTO>
gcloud config set run/region southamerica-east1
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```
El proyecto tiene que tener la facturación con los créditos de la hackathon: sin facturación, el build falla.

## 2. Antes de deployar
```bash
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --port 8080        # en otra terminal, los curl de abajo contra localhost:8080
git grep -n -i -E "api[_-]?key|secret|token"  # no tiene que aparecer ninguna clave
```
- `/analizar` del lote demo responde en menos de 30 s.
- La URL del front está en `CORS_ORIGINS` (paso 3).

## 3. Deploy
```bash
gcloud run deploy $SERVICIO \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 60 \
  --set-env-vars "^@^CORS_ORIGINS=https://<dominio-front>,http://localhost:3000"
```
- `--allow-unauthenticated`: la API es pública (la app no tiene login).
- `^@^` cambia el separador de `--set-env-vars` a `@`, porque `CORS_ORIGINS` lleva comas (la lee `app/main.py`, separada por comas).
- Al final imprime la URL del servicio: pasársela al front para su variable de entorno.
- Para cambiar solo los orígenes, sin build nuevo: `gcloud run services update $SERVICIO --region $REGION --update-env-vars "^@^CORS_ORIGINS=…"`.

## 4. Prueba desde una branch (sin tocar el tráfico)
```bash
gcloud run deploy $SERVICIO --source . --region $REGION --allow-unauthenticated \
  --memory 1Gi --timeout 60 --no-traffic --tag prueba \
  --set-env-vars "^@^CORS_ORIGINS=http://localhost:3000"
```
La revisión queda en `https://prueba---<servicio>-<hash>.<region>.run.app` y la URL principal no cambia. `--no-traffic` no se puede usar si el servicio todavía no existe: el primer deploy va sin `--no-traffic` ni `--tag` (toma el 100 %, porque no hay otra revisión). Para sacar la etiqueta: `gcloud run services update-traffic $SERVICIO --region $REGION --remove-tags prueba`.

## 5. Prueba después de cada deploy
```bash
URL=$(gcloud run services describe $SERVICIO --region $REGION --format 'value(status.url)')
# Para la revisión de prueba: URL=<la URL con prueba--- que imprimió el deploy>
curl -s -w "\n%{http_code}\n" "$URL/salud"                      # {"estado":"ok"} y 200
time curl -s -X POST "$URL/analizar" -H "Content-Type: application/json" \
  -d @tests/ejemplos/entrada_demo.json | head -c 600             # 4 estrategias, < 30 s
curl -s -o /dev/null -w "docs: %{http_code}\n" "$URL/docs"       # 200
```
Probarlo también desde el celular. Si falla: `gcloud run services logs read $SERVICIO --region $REGION --limit 50`.

## 6. Día de la demo
```bash
gcloud run services update $SERVICIO --region $REGION --min-instances=1   # sin arranque en frío
```
Antes de presentar, pedir `/analizar` una vez para calentar. Después de la demo, volver a `--min-instances=0` para no gastar créditos.

## 7. Volver atrás
```bash
gcloud run revisions list --service $SERVICIO --region $REGION
gcloud run services update-traffic $SERVICIO --region $REGION --to-revisions <REVISION_ANTERIOR>=100
```
No hace build: pasa el tráfico a una revisión que ya andaba. Se corrige en `dev`, se deploya de nuevo desde `main` y se vuelve con `--to-latest`.

## Reglas
- Secretos solo como variables de entorno de Cloud Run, nunca en el repo.
- Avisar al equipo cada vez que cambia la URL o hay un deploy nuevo.
