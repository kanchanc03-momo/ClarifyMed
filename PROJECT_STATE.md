# ClarifyMed Project State

Last updated: 16 September 2026

## Completion pass (16 September)

- Corrected the Debian container launcher to use `python3` via `start:container`, preserving `start:offline` for Windows/local Python installations.
- Container health now checks both Node and the private ML service, rejects an unconfigured report provider, and reports model artifact flags without treating absent weights as installed. Added regression coverage for failed ML HTTP responses, unhealthy payloads, missing provider configuration, and an unreachable ML service.
- Created writable model/OCR cache directories owned by the container user, moved the default model cache outside the read-only artifact mount, and enabled Compose init handling.
- Excluded temporary files, PDFs, ZIPs, and SQLite files from Docker build context in addition to the existing dataset/artifact/secret exclusions.
- Verification: all 52 tests pass (25 Node, nine Python service, 18 Python training/ML); frontend production build passes.
- Rechecked browser automation: no browser surfaces connected. Browser interaction checks remain unperformed.
- Rechecked Docker: no executable on PATH or at the standard Docker Desktop location. Container build/runtime and cloud deployment remain unverified.
- No trained X-ray checkpoint is present in the project artifacts. Requested the failed Colab traceback or completed run location, plus the intended cloud destination. Do not substitute synthetic weights for a trained model.

## Completion pass (15 September)

- Added FracAtlas inference support with strict dataset, class order, image-size, normalization, and threshold checks. The default checkpoint is now `ml/artifacts/fracatlas-mobilenetv2/model.pt`; an explicit `XRAY_MODEL_PATH` still supports matching MURA artifacts. FracAtlas returns `fractureScore` and fracture-specific limitations, never a general abnormality probability.
- Fixed X-ray routing: X-rays always go to the private ML service, including when report explanations use Groq. PDF X-rays and invalid input modes are rejected. Missing service errors now explain how to start/configure the service; upstream response reading is covered by the timeout.
- Verified actual MobileNetV2 Grad-CAM execution and hook cleanup with synthetic random weights. This is an execution test, not validation of trained X-ray performance. No trained X-ray checkpoint exists yet.
- Added account/history HTTP coverage for registration, secure cookies, login, logout/session invalidation, per-user isolation, duplicate saves, reopening, and deletion, using an isolated temporary database. Production static HTML serving also passes.
- Final verification: all 51 automated tests pass (24 Node, nine Python service, 18 Python ML/training). Frontend production build passes.
- Installed the missing pretrained biomedical NER cache and exercised real OCR/NER/text-classifier inference on synthetic PDF and scanned PNG inputs. A cached run with `HF_HUB_OFFLINE=1` passed both cases: 17.240 seconds for PDF and 18.812 seconds for PNG, with four extracted entities each. Evidence: `tmp/offline-smoke.json`; reproducible runner: `python -m ml_service.smoke --output tmp/offline-smoke.json`. OCR uses its local downloaded cache; network access was not globally disabled. Representative clinical-quality evaluation remains open.
- Added `compose.yaml` with persistent history/model-cache volumes and read-only artifact mounting. Updated deployment/model handoff documentation. Docker is unavailable on this workstation, so the container build and cloud deployment are not verified. No hosting destination has been configured.
- Confirmed installed PyTorch 2.14.0 is CPU-only. No browser surfaces are connected, so Colab/browser UI checks cannot be driven in this session.
- User reports Colab errors and has not yet provided the actual traceback or notebook link. Training remains blocked pending that error detail. Do not relax the dataset-integrity gate or claim training completed.

### Remaining next steps

1. Obtain the failed Colab cell's error/traceback, fix the observed failure, and complete the training run. Review the exported evaluation, provenance, and model card before installing weights.
2. Validate the installed trained checkpoint through upload, results, saved history, and Grad-CAM; complete browser interaction checks when a browser is connected.
3. Build/smoke-test Docker on a Docker-enabled host and configure an agreed demo hosting destination with HTTPS and persistent storage.
4. Complete representative OCR/NER/model evaluation and remaining product release gates. Email verification/password recovery and clinical release controls are still pending.

Earlier sections below are historical snapshots; this section takes precedence where they differ.

## Current completion pass (10 September)

- Live report text extraction is now a separate product flow: upload a report and click **Extract text** to see the source transcription before requesting an explanation. The preview stays in browser state and is not saved to history.
- Added `/api/extract`: direct PDF text extraction without an AI request, hosted vision transcription for scanned PDF/JPG/PNG, and a private Python `/extract` route for local OCR without loading NLP classifiers. Incomplete/unreadable transcriptions fail with actionable errors. Mixed PDFs no longer lose scanned pages in the Python text-extraction branch.
- Verified fresh live HTTP requests for synthetic PDF and PNG reports: both returned 200 and preserved `Hemoglobin: 13.5 g/dL`. Direct method is `pdf_text`; image method is `vision_ocr`. Node's 21 tests and the frontend build pass. Browser UI automation was unavailable, so visual interaction has not been verified.
- Current development session: frontend `http://127.0.0.1:5173`, fresh API on port 8788. The prior API on 8787 failed a live extraction request, while a fresh process succeeded; its exact failure cause remains unconfirmed. Vite supports `CLARIFYMED_API_TARGET` to select the fresh API without changing the default 8787 configuration.

- Retrained the CPU TF-IDF/logistic-regression follow-up classifier into `ml/artifacts/severity-candidate-20260910/`, preserving the installed model. Training uses only the 150 training rows; development has 45 rows and test has 30 rows.
- Development and test accuracy/macro F1 are 1.0 on the existing small dataset. Test expected calibration error is 0.3043. These are prototype results, not independent clinical validation; the CSV's `approved` flags do not establish who reviewed the data.
- Training now rejects invalid/unreviewed/duplicate data through the shared validator, refuses to overwrite artifacts, and exports dataset/model SHA-256 hashes, package versions, seed, split counts, development metrics, and calibration error.
- Fixed missing runtime dependencies for scikit-learn/joblib classifier loading and torchvision X-ray inference.
- Verified all 36 tests (20 Node, 11 ML, five offline service) and the frontend production build.
- Confirmed this interpreter has CPU-only PyTorch and no available CUDA device. Local FracAtlas metadata lists 4,083 images: 719 fractured and 3,364 non-fractured. Image integrity and patient-level split isolation have not yet been verified.
- Local X-ray data is **FracAtlas**. A separate FracAtlas trainer is now available; runtime inference still expects **MURA**. Do not rename FracAtlas or its future checkpoint to MURA: fracture labels and general abnormality labels are different tasks. No X-ray weights were trained in this pass.
- User selected report explanations plus X-ray analysis, Google Colab training, and the locally downloaded FracAtlas dataset from the Nature article. User reports that the ZIP is now uploaded to Drive.
- Added `ml/training/ClarifyMed_FracAtlas_Training.ipynb`, a standalone Colab notebook embedding `train_fracatlas.py`. It mounts Drive, locates the uploaded ZIP, extracts locally, checks images/labels, trains MobileNetV2 on GPU, and exports checkpoint/evaluation/provenance to a fresh Drive run folder. Notebook code cells are syntax-checked by its builder; targeted tests cover split isolation, duplicate copies/conflicts, missing files, unreadable-file auditing, and metrics.
- Local validation found two byte-identical duplicate filenames in both class folders (`IMG0003375.jpg`, `IMG0003376.jpg`); the loader counts each once using CSV labels. Validation also found truncated JPEGs; scanning the remaining records identified 59 unreadable images. The uploaded original ZIP has not been checked and may differ. The notebook logs unreadable exclusions to `data_validation.json` and refuses training if over 1% of images are unreadable. This local copy does not meet that gate; obtain a clean ZIP if Colab reproduces the failures. No GPU run has occurred.
- FracAtlas training uses custom 70/15/15 classification splits grouped by identical decoded-image hashes, with class stratification. Patient isolation and near-duplicate isolation are not established. Best checkpoint uses development loss; the final test set is evaluated after training. No FracAtlas weights have yet been trained; the web inference adapter remains to be implemented after the training handoff.

## Concrete remaining completion sequence

1. Run the prepared FracAtlas Colab notebook using the uploaded ZIP, then review its evaluation and implement matching fracture-classification inference metadata/output.
2. Run the selected image-model training on available approved compute; export weights, split provenance, evaluation, and a model card. Validate Grad-CAM and image upload end to end with those actual weights.
3. Exercise the complete offline report pipeline with cached OCR/NER models and representative approved inputs; record failures and latency.
4. Run account/history/upload/result end-to-end checks and complete demo deployment, including persistent history storage and environment configuration. Docker build verification is still outstanding.
5. Finalize the demo README, architecture, model evaluation report, and reproducible start instructions. A real patient product requires the additional release gates already documented in README.md.

Use this file to resume work in a new chat or after context is lost. Update it after every meaningful implementation, training, evaluation, or deployment change.

## Objective

Build a deployable, non-diagnostic multimodal medical-report explanation prototype with separate offline text and musculoskeletal X-ray pipelines.

## Chosen architecture

- React/Vite product frontend.
- Node/Express application API and demo SQLite history.
- Private Python/FastAPI offline ML service.
- PyMuPDF plus EasyOCR for PDFs and scanned reports.
- `d4data/biomedical-ner-all` for pretrained biomedical entity extraction.
- Curated terminology mapping, with CHV/UMLS integration subject to approved access and terms.
- Scikit-Learn TF-IDF + Logistic Regression classifier for fast, CPU-trainable offline follow-up classification with feature-attribution explainability.
- Fine-tuned DistilBERT optional research track for deep-learning follow-up classification.
- MURA-trained MobileNetV2 for normal/abnormal musculoskeletal X-ray classification.
- Grad-CAM for a clearly labeled model-influence overlay.
- Docker deployment combining React, Node, and Python services.

## Completed

- Fixed live Groq report analysis: PDF text extraction precedes image fallback; Groq Chat Completions uses a complete JSON contract and 900-token output limit with Qwen reasoning disabled. The user-provided three-page PDF was successfully analyzed through the real API (HTTP 200). Earlier Responses API attempts failed JSON validation and exceeded the account's output-token limit.

- Groq PDF uploads: Node renders all PDF pages to JPEGs in memory using PDF.js and sends them together for one explanation. Default maximum 5 pages (3 for Qwen 3.8); worker timeout, encoded-size limit, and actionable invalid/protected PDF errors. No separate Python service is needed for this conversion.
- Current PDF/Groq validation: all 20 Node tests pass, including text extraction, multi-page/scanned rendering, and HTTP upload contract checks. Live analysis of the supplied three-page PDF returns HTTP 200. The production Vite build passed with the PDF dependencies; subsequent changes affect only the backend.

- Existing React upload, results, and saved-report history interface.
- Groq prototype path remains available during offline-model development.
- Offline Python ML service and Node forwarding path.
- PDF text extraction and multi-page OCR fallback.
- Pretrained NER loading and curated terminology mapping.
- **Trained basic ML Follow-up Classifier**: Scikit-Learn TF-IDF + Logistic Regression trained on 225 de-identified clinical examples (`ml/artifacts/severity-classifier/model.joblib`), evaluating at 100% precision/recall on held-out test splits with n-gram feature attribution.
- Integrated basic ML severity classification into `ml_service/severity.py` and updated `/health` readiness reporting.
- Explicit-wording safety fallback preserved when all trained severity weights are absent.
- DistilBERT training/evaluation program.
- MURA MobileNetV2 training/evaluation program.
- Artifact-gated X-ray inference and Grad-CAM implementation.
- Explicit report versus musculoskeletal-X-ray UI selection.
- Conservative anatomy reference mapping.
- **Report Deletion in UI**: Added delete buttons with confirmation modals in both "My reports" list and result view.
- **Print / Doctor Visit Export**: Added clean print stylesheet and "Print for doctor" one-pager export.
- **"How It Works" Modal**: Added accessible educational modal explaining upload privacy, NLP extraction, severity guidance, and clinician questions.
- **Account Sign Out**: Added sign-out action and user session avatar indicator in navigation shell.
- Docker and Hugging Face Docker Space configuration.
- Hosted and local analysis responses are validated before they reach the UI; invalid local-service payloads fail closed.
- Fixed the local Node-to-FastAPI success path by importing its response validator and added an HTTP integration test covering upload forwarding and structured-response delivery.
- 25 tests pass: 12 Node tests and 13 Python tests verified with Python 3.14.6. The production frontend Vite build passes with zero errors.
- Hardened MURA training for realistic evaluation: patient-level train/development isolation, official validation preservation, deterministic CUDA settings, strict dataset validation, study-level aggregation, per-body-part metrics, and calibration-error reporting.

## Required artifacts not yet produced

- `ml/artifacts/severity-distilbert/`: optional deep-learning research track requiring GPU training run.
- `ml/artifacts/mura-mobilenetv2/model.pt`: requires approved MURA access/terms and a GPU training run.

The application must not claim these deep models are trained until the artifacts and evaluation reports exist.

## Immediate next actions

1. Add the installed Python 3.14 interpreter to the development shell PATH, or continue invoking it by its absolute path.
2. Review and approve the official MURA terms, then privately download MURA outside the Git repository if pursuing custom CNN training.
3. Run MURA training on an approved Kaggle, Colab, or other CUDA environment using `ml/training/OFFLINE_TRAINING_RUNBOOK.md`.
4. Review held-out metrics, calibration, per-body-part results, and failure cases before promoting weights.
5. Place only approved artifacts in the structure documented by `ml/artifacts/README.md`, then exercise X-ray inference and Grad-CAM end to end.
6. Build and smoke-test the Docker image in an environment with Docker installed.
7. Complete remaining account lifecycle features (verified email, password reset) before any multi-user cloud deployment.

## Important boundaries

- MURA supports musculoskeletal X-rays, not general X-rays.
- Grad-CAM is not confirmed lesion localization.
- A 200â€“300-example severity dataset supports a prototype experiment, not clinical validation.
- Training datasets, patient data, credentials, and restricted artifacts must not be committed to Git.
- Hugging Face Spaces is a demo target; real healthcare deployment requires substantially stronger privacy, security, clinical, operational, and regulatory controls.

## Resume prompt

In a new chat, say:

> Open `PROJECT_STATE.md`, `PROJECT_DESCRIPTION.md`, and `README.md` in my ClarifyMed folder. Continue from the immediate next actions, preserve the documented safety boundaries, implement changes directly in the repository, run relevant tests, and update `PROJECT_STATE.md` before finishing.



## Local Docker preparation (16 September)

- User selected local Docker preparation/verification before any cloud deployment.
- Host checks: Windows 11 Pro build 26200, 64-bit, approximately 16 GB RAM, hypervisor present, approximately 359 GiB disk free.
- WSL is absent. Built-in WSL installation commands returned without installing. Microsoft.WSL 2.7.13 via winget failed with 0x80073d28 (administrator privileges required). The subsequent Windows elevation request was canceled; no successful WSL installation occurred.
- Docker Desktop remains unavailable. Container build and runtime checks are still blocked on installation; no cloud deployment was attempted.
- Added deploy/verify-local.ps1 to validate Compose quietly, build/start the container, check both services, and run isolated account/history and Python ML-service tests. PowerShell syntax was checked, but Docker execution has not occurred.
- Next: complete WSL/Docker Desktop installation with administrator access, handle any requested reboot and Docker terms in the installer, start Docker Desktop, then run ./deploy/verify-local.ps1 from a fresh PowerShell window.
