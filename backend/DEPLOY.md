# Deploy del backend en Cloud Run

Dueño: Back 2. Servicio `field-shift-api`, región `southamerica-east1` (São Paulo). Cloud Run construye el contenedor con buildpacks a partir de estos archivos de `backend/`:

| Archivo | Para qué |
|---|---|
| `requirements.txt` | Dependencias (incluye `fastapi` y `uvicorn`) |
| `Procfile` | `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT` (Cloud Run pone `PORT=8080`) |
| `.python-version` | `3.13`: el builder `google-24` de Cloud Run no tiene 3.12 (va de 3.13 a 3.15). La CI sigue en 3.12 |
| `.gcloudignore` | Deja afuera tests, cachés, `.venv`, scripts, datos pesados y `.env`. **Sí** sube `app/demo/` y `app/api/mock_rio_cuarto.json` |

**Se deploya solo, desde `main`.** Cada push a `main` corre `.github/workflows/deploy.yml`: deploya `field-shift-api` si cambió `backend/` y `agropixel-web` (el front) si cambió `frontend/`, y prueba que respondan. Para forzar los dos: Actions → Deploy → Run workflow. La configuración, una sola vez, está en [Deploy automático](#deploy-automático-desde-main). Los comandos de abajo quedan para cambiar variables, instancias o permisos, o para una prueba sin tráfico desde otra branch (paso 4). Van en Git Bash, **desde `backend/`**.

```bash
SERVICIO=field-shift-api
REGION=southamerica-east1
```

## Deploy automático (desde `main`)
El workflow se autentica en GCP con **Workload Identity Federation**: GitHub le da un token al job, GCP lo cambia por la cuenta de servicio `github-deploy` y no hay claves guardadas en ningún lado. El proveedor solo acepta tokens de `lucacgrossi/TMDO_Hackathon_SpaceApps_Challenge` en `refs/heads/main`.

El deploy no cambia variables de entorno, instancias mínimas ni `--allow-unauthenticated`: Cloud Run conserva los de la revisión anterior.

**Configuración (una vez, la corre un Owner del proyecto).** La cuenta `github-deploy` ya existe (15/11). Falta el pool, el proveedor y los roles:
```bash
PROYECTO=nasa-space-app-fieldchange
NUM=757348191517
SA=github-deploy@$PROYECTO.iam.gserviceaccount.com
REPO=lucacgrossi/TMDO_Hackathon_SpaceApps_Challenge

gcloud iam workload-identity-pools create github --project=$PROYECTO --location=global \
  --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github --project=$PROYECTO --location=global \
  --workload-identity-pool=github --display-name="GitHub (main)" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"

# El repo de GitHub puede usar la cuenta de servicio
gcloud iam service-accounts add-iam-policy-binding $SA --project=$PROYECTO \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# Lo que necesita `gcloud run deploy --source`
for ROL in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  gcloud projects add-iam-policy-binding $PROYECTO --member="serviceAccount:$SA" --role=$ROL --condition=None
done
# Deploya las revisiones con la cuenta de servicio de Compute (la que usan los dos servicios)
gcloud iam service-accounts add-iam-policy-binding $NUM-compute@developer.gserviceaccount.com \
  --project=$PROYECTO --role=roles/iam.serviceAccountUser --member="serviceAccount:$SA"
```
Probar: Actions → Deploy → Run workflow sobre `main`. Los dos jobs tienen que terminar en verde. Si falla en `auth`, revisar el pool y el proveedor; si falla en `Deploy` con un error de permisos, el rol que nombra el error.

## Deploy manual (cambiar variables, instancias o permisos)
La cuenta que deploya necesita, en el proyecto `nasa-space-app-fieldchange`, los roles **Editor** y **Administrador de Cloud Run** (este último por `--allow-unauthenticated`).
```bash
git checkout main && git pull origin main
cd backend
gcloud config set project nasa-space-app-fieldchange
gcloud run deploy $SERVICIO \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 60 \
  --min-instances 1 \
  --set-env-vars "^@^CORS_ORIGINS=https://agropixel.earth,https://www.agropixel.earth,http://localhost:3000,https://agropixel-web-757348191517.southamerica-east1.run.app,https://agropixel-web-wqtvuhfh7a-rj.a.run.app"
```
- El front de producción es https://agropixel.earth, servido desde el 15/11 por Cloud Run (`agropixel-web`, detrás de un balanceador; ver `frontend/CLAUDE.md` → Deploy). Las dos URL `run.app` de `agropixel-web` también están en `CORS_ORIGINS`: son el respaldo si falla el dominio. `--set-env-vars` reemplaza todas las variables: si se cambia el dominio o se recrea `agropixel-web`, actualizarlo acá. No se usa `CORS_ORIGIN_REGEX` (se sacó el 15/11 junto con Vercel): todos los orígenes van en `CORS_ORIGINS`.
- `--min-instances 1`: sin arranque en frío durante la demo. Después, volver a 0 (paso 6).
- Probar con el paso 5. Además, para confirmar que subió la versión nueva:
  ```bash
  curl -s "$URL/openapi.json" | grep -o '"/mediciones/planilla"\|"CapaRaster"' | sort -u   # las dos tienen que aparecer
  ```
- Avisar al front la URL (es la misma de siempre si el servicio ya existía) para `NEXT_PUBLIC_API_URL`, con `NEXT_PUBLIC_USAR_MOCK=false`.

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

Cloud Build construye con la cuenta de servicio de Compute, que en los proyectos nuevos no tiene roles. Sin roles, el build falla sin logs. Hay que darle `roles/run.builder` una vez:
```bash
NUM=$(gcloud projects describe <ID_DEL_PROYECTO> --format 'value(projectNumber)')
gcloud projects add-iam-policy-binding <ID_DEL_PROYECTO> \
  --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/run.builder" --condition=None
```
En `nasa-space-app-fieldchange` ya está hecho (14/11). Servicio: https://field-shift-api-757348191517.southamerica-east1.run.app

## 2. Antes de deployar
```bash
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --port 8080        # en otra terminal, los curl de abajo contra localhost:8080
git grep -n -i -E "api[_-]?key|secret|token"  # salen nombres (p. ej. `id-token: write` del workflow), pero ningún valor de clave
```
- `/analizar` del lote demo responde en menos de 30 s.
- La URL del front está en `CORS_ORIGINS` (paso 3).

## 3. Primer deploy (solo si el servicio no existe)
`field-shift-api` ya existe: para redeployar o cambiar variables se usa [Deploy manual](#deploy-manual-cambiar-variables-instancias-o-permisos), con la lista completa de `CORS_ORIGINS`. Este comando es para crear el servicio en un proyecto nuevo:
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
  --memory 1Gi --timeout 60 --no-traffic --tag prueba
```
Sin `--set-env-vars`, la revisión de prueba conserva las variables de la anterior. **No pisar `CORS_ORIGINS` acá:** el próximo deploy automático desde `main` copia las variables de la última revisión creada (aunque no tenga tráfico), así que un `CORS_ORIGINS` recortado llegaría a producción.
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
No hace build: pasa el tráfico a una revisión que ya andaba. Se corrige en `dev`, se lleva a `main` (eso deploya solo) y se vuelve con `--to-latest`.

## Reglas
- Secretos solo como variables de entorno de Cloud Run, nunca en el repo.
- Avisar al equipo cada vez que cambia la URL o hay un deploy nuevo.
