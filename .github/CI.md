# CI de AgroPixel

GitHub Actions corre en cada PR a `dev` y `main` y en cada push a `dev`. Nada usa secretos del repo y la CI nunca modifica código. Aparte, **`deploy.yml` deploya en GCP cada push a `main`** (abajo).

| Workflow | Cuándo corre | Qué revisa |
|---|---|---|
| `backend.yml` | siempre se dispara; el job pesado corre si cambia `backend/**` | Python 3.12 · `ruff check` · `ruff format --check` (informativo, todavía no bloquea) · `pytest --disable-socket` (tests sin red) · que `app` y todos sus módulos importen, `app.main` incluido. Cloud Run usa 3.13 (`backend/.python-version`) |
| `frontend.yml` | siempre se dispara; el job pesado corre si cambia `frontend/**` | Node 22 · `npm ci` · `npm run lint` · `typecheck` · `npm test` (vitest) · `npm run build` |
| `secretos.yml` | siempre | gitleaks sobre el diff del PR y sobre todo el historial (config en `.gitleaks.toml`) |
| `checks-proyecto.yml` | siempre | las reglas propias de abajo (`.github/scripts/`) |
| `deploy.yml` | push a `main` (o a mano: Run workflow) | no revisa: deploya en Cloud Run `field-shift-api` si cambió `backend/` y `agropixel-web` si cambió `frontend/`, y prueba que respondan. Sin claves: Workload Identity Federation (`backend/DEPLOY.md` → Deploy automático) |

Cada workflow cancela la corrida anterior del mismo PR cuando llega un push nuevo.

## Checks del proyecto
Scripts de Python sin dependencias; se corren **desde la raíz del repo** (`py` en Windows, `python3` en Linux/Mac).

| Script | Regla | Falla si… |
|---|---|---|
| `lenguaje_prohibido.py` | "Compara, no recomienda" | `frontend/src/**` o `backend/app/**` (sin tests ni docs) contienen "recomendamos", "deberías" o "la mejor" (sin distinguir mayúsculas ni tildes). Excepción puntual: `lenguaje-ok` en la línea |
| `fronteras_dominios.py` | Un dominio no importa a otro | un archivo de un dominio del back (los de `DOMINIOS` en el script: `clima`, `satelite`, `motor` y, con el parser de la planilla, `mediciones`) importa algo de `app.*` que no sea su dominio ni `app.api.contrato`. Solo `servicio.py` y `api/` conectan dominios |
| `archivos_pesados.py` | Nada pesado en el repo | un archivo agregado/modificado pasa de 1 MB, es un dato crudo (`.nc`, `.hdf`, `.h5`, `.tif`, `.tiff`, `.zarr`) fuera de `backend/tests/**/fixtures/`, o una fixture pasa de 200 KB |
| `sin_env.py` | Sin secretos en el repo | hay un `.env` o `.env.*` versionado (solo se permite `.env.example`) |
| `nombre_branch.py` | `<nombre>/<tipo>/<area>-<descripcion>` | **nunca falla**: solo avisa. `<tipo>`: feat, fix, docs, chore, data, refactor, test |

## Correr todo en local
```bash
# Back (desde backend/)
cd backend
py -m pip install -r requirements-dev.txt
py -m ruff check .
py -m ruff format --check .      # informativo
py -m pytest --disable-socket
py -c "import app"

# Front (desde frontend/)
cd frontend
npm ci && npm run lint && npm run typecheck && npm test && npm run build

# Checks del proyecto (desde la raíz)
py .github/scripts/lenguaje_prohibido.py
py .github/scripts/fronteras_dominios.py
py .github/scripts/archivos_pesados.py --base origin/dev
py .github/scripts/sin_env.py
py .github/scripts/nombre_branch.py luca/feat/satelite-ndvi-mensual

# ¿Correría el job del back / del front para este cambio?
BASE_SHA=origin/dev py .github/scripts/cambios.py '^backend/'
BASE_SHA=origin/dev py .github/scripts/cambios.py '^frontend/'
```

## Notas
- Si un test del back necesita red, no uses internet en el test: monkeypatchea el cliente con `httpx.MockTransport` y fixtures chicas (como en `backend/tests/satelite/`).
- **Back y front no usan `paths:`**: el workflow se dispara siempre y un primer job (`¿Cambió el back?` / `¿Cambió el front?`, `.github/scripts/cambios.py`, ~5 s) compara con la base del PR. Si el cambio no toca su lado, el job pesado queda *skipped*, que cuenta como aprobado en las reglas de branch. Así se pueden exigir los 4 checks sin que un PR quede esperando, y no se gastan minutos en `pip install` / `npm ci`. Ante la duda (sin base, historial incompleto) corre.
- Para actualizar gitleaks: cambiar `GITLEAKS_VERSION` y `GITLEAKS_SHA256` en `secretos.yml` (el sha256 sale de la página del release).
