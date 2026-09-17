# Deployment

## Container architecture

The Docker image runs two private processes:

- Node/Express on port `7860`, serving the React build, API, and SQLite demo history.
- FastAPI/uvicorn on `127.0.0.1:8000`, serving offline ML inference only to Node.

`ANALYSIS_PROVIDER=local` makes Node forward uploads to the Python service. Original uploads remain in memory and are not deliberately persisted.

## Required artifacts

- NER downloads `d4data/biomedical-ner-all` into the configured private cache on first use unless baked into an approved image.
- `ml/artifacts/severity-distilbert/model/config.json` and associated files enable the trained follow-up classifier.
- `ml/artifacts/fracatlas-mobilenetv2/model.pt` enables FracAtlas fracture classification and Grad-CAM after training and evaluation. Alternatively set `XRAY_MODEL_PATH` to an evaluated MURA checkpoint. Dataset labels are validated and are never interchanged.

The service reports artifact readiness through the private ML health endpoint. Missing trained artifacts disable their model path or use the explicitly labeled wording fallback; they must never be silently represented as trained functionality.

## Reproducible demo start

Install Node 24+ and Python with `ml_service/requirements.txt`. Run `npm ci`, then `npm run build`. Copy `.env.example` to `.env` and choose the report provider. Run `npm run dev:ml` alongside `npm run dev`. X-rays always go to the private Python service, even when reports use Groq. Missing X-ray weights produce an explicit error.

For Docker, run `docker compose up --build -d` from the project root. The included Compose file binds port 7860 to loopback, persists SQLite history and model caches in named volumes, and mounts trained artifacts read-only. The container uses secure session cookies; expose a deployed demo through an HTTPS reverse proxy. Do not delete the history volume when restarting. Back up the SQLite database with SQLite's backup API or stop the service before copying the whole data volume.

Docker configuration has not been executed on this workstation because Docker is unavailable. A hosting destination and its HTTPS/persistent-storage configuration are still needed for cloud deployment.

## Model handoff and checks

1. Complete `ml/training/ClarifyMed_FracAtlas_Training.ipynb` in Colab. A run is incomplete without `evaluation.json`.
2. Review the evaluation, `MODEL_CARD.md`, `split_manifest.json`, and `data_validation.json`; preserve the whole run folder. Check the model SHA-256 against `evaluation.json` before installation.
3. Copy the evaluated `model.pt` to `ml/artifacts/fracatlas-mobilenetv2/model.pt`, or set `XRAY_MODEL_PATH` to its absolute path. Restart the ML service.
4. Run `npm run test:node`, `npm run test:python`, and `npm run build`.
5. Run `python -m ml_service.smoke --output tmp/offline-smoke.json` for real OCR/NER checks using synthetic data. First use may download pretrained models; rerun with `HF_HUB_OFFLINE=1` once cached. Inspect the recorded failures and latency.

The Python X-ray test exercises Grad-CAM using synthetic random weights. It does not establish the quality of a trained checkpoint; that requires the completed Colab artifact and representative evaluation inputs.

## Demo versus production

The included container supports a non-clinical demo. SQLite inside an ephemeral container is not a production database. Before handling real patient data, use authenticated per-user storage, encryption, managed secrets, malware scanning, audit logs, backups, monitoring, and approved healthcare infrastructure.

## Container verification handoff

The image uses `npm run start:container` (Debian `python3`); local development keeps `npm run start:offline` (`python`). The health check requires both HTTP services and a configured report provider. Model readiness flags are separate: a healthy container does not establish trained model quality or X-ray readiness.

On a Docker-enabled host, run from the project root:

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 180
docker compose exec clarifymed node deploy/healthcheck.mjs
docker compose logs --tail 100
```

Inspect the ML readiness flags and complete an actual synthetic report upload. Once evaluated X-ray weights are installed, check an approved X-ray upload and Grad-CAM output. Through the HTTPS endpoint, verify registration, login, saving/reopening/deleting a synthetic explanation, and logout. Restart with `docker compose restart`, sign in again, and verify that a saved synthetic explanation persists. Never use `down --volumes` when preserving history.

Browser acceptance checks remain pending: report text extraction and explanation; missing-weight X-ray error and subsequently trained-model results; account/history interactions; help and delete dialogs using keyboard navigation; desktop and narrow-screen layout; and print output. API tests do not replace these browser checks.

### Windows local verification

From a fresh PowerShell window after Docker Desktop is installed and its Linux engine is running:

```powershell
cd C:\Users\HP\ClarifyMed
.\deploy\verify-local.ps1
```

The script stops on any failed command and preserves the running container and named volumes. Account/history checks use a separate temporary database. It does not complete browser acceptance checks or validate trained-model quality. The local machine currently needs WSL installation with administrator privileges before Docker verification can proceed; the last elevation request was canceled.
