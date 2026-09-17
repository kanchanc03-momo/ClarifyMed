# ClarifyMed

ClarifyMed turns an uploaded medical report into a calm, structured plain-language explanation. It is an explanation aid, not a diagnostic service or substitute for a clinician.

The complete chosen model stack, four-week prototype plan, runtime approach, and intended user output are maintained in [PROJECT_DESCRIPTION.md](PROJECT_DESCRIPTION.md).

The latest implementation status, blockers, next actions, and new-chat resume prompt are maintained in [PROJECT_STATE.md](PROJECT_STATE.md).

## Authoritative product vision

ClarifyMed is an AI-powered healthcare platform that transforms text-based lab reports, scanned medical documents, and X-ray images into calm, visual, medically responsible explanations that non-medical users can understand. It addresses the gap between receiving a jargon-heavy report and discussing it with a clinician, without encouraging panic or presenting AI output as a diagnosis.

The intended final system is a multimodal deep-learning platform with distinct components:

- **NLP pipeline:** Extracts clinical entities, findings, anatomical locations, measurements, severity language, and follow-up wording from text reports.
- **Document pipeline:** Performs OCR and layout-aware extraction for scanned or photographed reports.
- **Computer-vision pipeline:** Detects supported abnormality patterns in X-rays using a separately trained and clinically evaluated vision model.
- **Explainability pipeline:** Produces Grad-CAM heatmaps for supported X-ray models and maps findings to an anatomical diagram only when localization is validated.
- **Explanation layer:** Converts extracted evidence into careful plain language while preserving uncertainty and source-report meaning.

### Target product features

- Upload text PDFs, scanned or photographed reports, and supported X-ray images.
- Identify the reported finding, anatomical location, measurements, and source-stated severity or urgency.
- Explain clinical terminology in simple, calm language.
- Display a validated body or organ location and a routine-to-urgent follow-up gauge.
- Highlight supported X-ray regions of concern with a Grad-CAM heatmap.
- Avoid definitive diagnoses and direct users to qualified clinicians for interpretation and next steps.
- Save and reopen report explanations in a user dashboard and support longitudinal tracking.

> **Safety requirement:** Heatmaps, anatomical highlights, severity labels, and abnormality predictions must not be presented as clinically reliable until the relevant models have been trained on appropriate data, evaluated for the intended use, and independently validated.

## Product and deployment status

ClarifyMed is currently a functional prototype, not a production-ready healthcare product. Deployment readiness is a core project requirement. A feature is not considered complete merely because it works in a local demo; it also needs appropriate testing, security, privacy, reliability, accessibility, monitoring, and clinical-safety evidence.

### Implemented in the current prototype

- Responsive React/Vite upload, result, and report-history screens.
- Client and server validation for one PDF, JPG, or PNG upload up to 20 MB.
- In-memory upload processing; original files are not deliberately saved.
- Node/Express API with health, analyze, save, list, open, and delete endpoints.
- Groq integration for PDF/JPG/PNG reports using `qwen/qwen3.6-27b`. Readable PDFs use extracted text; scanned or mixed PDFs use page images, analyzed together (up to 5 pages; 3 for `qwen/qwen3.8-27b`).
- Optional OpenAI integration, including direct PDF input.
- Structured explanation fields: summary, context, finding, location, measurement, follow-up guidance, questions, and limitations.
- SQLite persistence for explanations explicitly saved by the user.
- Safety-oriented prompts and prominent non-diagnosis disclaimers.
- Production frontend build and basic API/database smoke checks.
- NLP Stage 1 evidence contract and deterministic extraction baseline for sections, findings, anatomy, measurements, assertions, follow-up signals, source spans, and confidence metadata.
- Versioned synthetic NLP fixtures, unit tests, and baseline precision/recall/F1 evaluation harness under `ml/`.
- Offline Python ML service with PDF text extraction, multi-page OCR fallback, pretrained biomedical NER loading, curated terminology simplification, source-wording follow-up fallback, and artifact-readiness health checks.
- DistilBERT follow-up-classifier training program with duplicate/split checks, held-out per-class evaluation, confusion matrix, and calibration error reporting.
- MobileNetV2 MURA training program with study-level development splitting, official held-out validation evaluation, scoped checkpoint metadata, and abnormal/normal metrics.
- Artifact-gated musculoskeletal X-ray inference and Grad-CAM overlay generation; the path refuses to run without a valid trained checkpoint.
- Explicit report-versus-musculoskeletal-X-ray selection in the React UI, conservative anatomy reference mapping, and labeled Grad-CAM display.
- Node-to-private-FastAPI offline inference integration and a combined Docker deployment for the React, Node, and Python services.
- Automated checks across authentication/history isolation, dataset validation, model training, offline service, X-ray routing/Grad-CAM, PDF uploads, server validation, and anatomy mapping. See PROJECT_STATE.md for the latest recorded counts.
- Fail-closed validation for structured responses from both hosted providers and the private local ML service.
- User-visible saved-report navigation errors and privacy copy aligned with the in-memory upload-retention boundary.

### Offline model release gates still open

- The DistilBERT artifact does not exist until the governed follow-up dataset is labeled/reviewed and the GPU training script is run.
- The MobileNetV2 artifact does not exist until MURA access/terms are approved and the GPU training script is run.
- OCR, NER, severity, X-ray, anatomy mapping, and Grad-CAM have not yet been evaluated on a sufficiently representative approved test corpus.
- Docker configuration is present but cannot be built in the current environment because Docker is not installed.
- The current local `.env` can continue using Groq; offline deployment requires `ANALYSIS_PROVIDER=local` and the Python dependencies/artifacts described in `deploy/README.md`.

### Required before product deployment

- Implement the intended separate NLP, OCR/document, X-ray CV, localization, and Grad-CAM pipelines.
- Assemble governed datasets; define labels and intended use; train, calibrate, and independently validate every predictive model across relevant populations, devices, and failure modes.
- Add reliable PDF extraction, multi-page scanned-document handling, OCR quality checks, and unsupported/unreadable-document rejection.
- Extend the existing fail-closed server validation with safe retry behavior, provenance and confidence policy, and prompt-injection defenses.
- Replace inferred urgency with a clinically reviewed policy tied to explicit source wording; test emergency and ambiguous-report behavior.
- Add authentication, authorization, secure sessions, account recovery, per-user data isolation, and a complete report deletion/retention workflow.
- Encrypt sensitive data at rest and in transit; move from local SQLite to an appropriate managed production database and protected object storage if source-file retention is ever introduced.
- Perform a privacy impact assessment, threat model, vendor/data-processing review, secrets management, audit logging, and jurisdiction-specific legal/regulatory review.
- Extend the existing IP rate limits, file-signature checks, and request timeouts with malware validation, concurrency controls, quotas, and cost protection.
- Add unit, integration, end-to-end, accessibility, security, load, model-quality, and clinical-safety tests with CI quality gates.
- Add production routing/static hosting, environment separation, migrations, backups, restore testing, monitoring, tracing, alerting, incident response, and rollback procedures.
- Complete accessibility and responsive-browser testing; implement currently incomplete navigation/help, history error handling, and user-facing data controls.
- Define clinical governance, human escalation, post-deployment monitoring, model/version documentation, change control, and a clear supported-use boundary.

### Release gates

1. **Prototype:** Demonstrates the user experience and hosted-model integration. This is the current stage.
2. **Engineering beta:** Authenticated, isolated, observable, fully tested, and deployable in a non-clinical test environment using synthetic or approved data.
3. **Clinical validation build:** Frozen model and product versions evaluated under an approved protocol; no unsupported visual claims.
4. **Production release:** Security, privacy, regulatory, operational, and clinical-safety gates are formally approved for the intended jurisdictions and use case.

## Project decision log

Keep this section updated when product scope, architecture, providers, models, storage, or safety boundaries change.

- **Initial product:** A React web app that explains uploaded medical reports in plain language and provides useful questions for a clinician.
- **Architecture:** React/Vite frontend, Node/Express API, hosted AI inference, and local SQLite storage for saved explanations.
- **Current prototype AI approach:** Reports can use a hosted provider or the local OCR/NER/TF-IDF classifier pipeline. The basic text classifier is trained. X-rays always use the dedicated local service and require an evaluated checkpoint.
- **Target AI approach:** Separate NLP, document OCR, X-ray computer-vision, localization, and explainability components, each evaluated independently.
- **Offline architecture decision (August 2026):** The chosen prototype stack uses TrOCR/EasyOCR, `d4data/biomedical-ner-all`, CHV mapping, a fine-tuned DistilBERT follow-up classifier, a MURA-trained MobileNetV2 musculoskeletal X-ray classifier, and Grad-CAM. Details and scope constraints are in `PROJECT_DESCRIPTION.md`.
- **RadGraph work status:** The earlier RadGraph training scaffold remains an optional research track; it is not the primary four-week prototype path unless the team later chooses it and obtains credentialed access.
- **Current hosted provider:** Groq with `qwen/qwen3.6-27b` for PDF, JPG and PNG reports. The Node backend extracts PDF text where possible and falls back to page images; no Python service or OpenAI key is needed for this route. Groq uses Chat Completions with an explicit output schema in the prompt, JSON mode, disabled Qwen reasoning, and a 900-token output cap. The backend can alternatively use OpenAI, including direct PDF input.
- **Privacy boundary:** Uploads are held in memory for the request and are not saved. Only explanations explicitly saved by the user are written to SQLite.
- **Clinical boundary:** ClarifyMed explains source-report terminology. It does not diagnose, prescribe, or replace professional medical advice.

## Run locally

### Extract report text

Choose **Medical report**, upload a PDF/JPG/PNG, then click **Extract text**. The source text appears in a selectable preview; **Explain my report** remains available separately. The preview is not saved to history. Readable PDFs are extracted directly without a provider call. Scanned PDFs and images use the configured Groq/OpenAI vision model, or EasyOCR via the private local service. Review OCR numbers, units, and table rows against the original. PDFs retain the existing 5-page limit (3 for Qwen 3.8).

If using a different local API port, start Vite with `CLARIFYMED_API_TARGET` set to the API URL. The default remains `http://localhost:8787`.

1. Copy `.env.example` to `.env` and add a server-side `GROQ_API_KEY` or `OPENAI_API_KEY`.
2. Run `npm run dev` (the server loads `.env` automatically).
3. Open the Vite URL shown in the terminal.

The web app runs through Vite and proxies `/api` to the Node API on port 8787. Node.js 24 or newer is required for its built-in SQLite and `.env` support. Uploaded files are validated, held in memory for the request, and are not saved. Groq accepts PDFs up to 5 pages with the default model, plus JPG and PNG report images. PDF.js renders PDF pages in an isolated worker with a 30-second timeout; encoded page images are limited to 3.5 MB in total. Password-protected, damaged, over-limit and oversized PDFs produce actionable errors; pages are never silently dropped. Install dependencies with `npm install` and restart the API after updating. The API requests `store: false` when generating an explanation.

## Database

Saved explanations are stored in a local SQLite database at `data/clarifymed.db` by default. Set `DATA_DIR` to use another directory. The database directory is ignored by Git. The API supports saving, listing, and reopening analyzed reports; uploaded source files are never written to the database.

## Current product boundary

- Real PDF/image analysis and strict structured output are connected.
- The result is explicitly presented as an explanation, not a diagnosis.
- A report location is displayed as text; anatomical highlighting is deliberately disabled for live results until a validated localization model is integrated.
- Accounts, password hashing, sessions, per-user saved reports, and deletion are implemented. Email verification and password recovery remain pending. X-ray inference/Grad-CAM code is implemented, but trained X-ray weights remain pending. Database encryption, clinical evaluation, audit logging, malware scanning, and production deployment controls remain open. Basic IP rate limiting is implemented.

Do not deploy this prototype for clinical use without privacy/security review, clinical validation, jurisdiction-specific regulatory review, monitoring, and a defined escalation process.
