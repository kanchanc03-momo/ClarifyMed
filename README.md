# ClarifyMed

**Multimodal AI System for Plain-Language Medical Report and Clinical Imaging Explanation**

ClarifyMed turns uploaded medical reports, pediatric wrist X-rays, and retinal fundus screening images into calm, structured, plain-language explanations. It is an explanation and communication aid designed for doctor-patient discussions, not a diagnostic service or substitute for a clinician.

The complete chosen model stack, four-week prototype plan, runtime approach, and intended user output are maintained in [PROJECT_DESCRIPTION.md](PROJECT_DESCRIPTION.md). Detailed clinical system architecture and methodology are documented in [PROJECT_REPORT.md](PROJECT_REPORT.md). The latest implementation status, blockers, and next actions are maintained in [PROJECT_STATE.md](PROJECT_STATE.md).

---

## Authoritative Product Vision

ClarifyMed is an AI-powered healthcare platform that transforms text-based lab reports, scanned medical documents, X-rays, and retinal fundus photographs into calm, visual, medically responsible explanations that non-medical users can understand. It bridges the gap between receiving a jargon-heavy report and discussing it with a physician, without encouraging panic or presenting AI output as a clinical diagnosis.

The system features multimodal, independent clinical intelligence pipelines:

- **NLP & Document Pipeline:** Extracts clinical entities, findings, anatomical landmarks, measurements, severity language, and follow-up wording from text and scanned PDFs (up to 50 pages) and report images.
- **Pediatric Wrist X-Ray Pipeline:** Detects possible fracture-like regions in supported pediatric wrist X-rays using a dedicated YOLOv8 detector trained on GRAZPEDWRI-DX.
- **Diabetic Retinopathy Screening Pipeline:** Classifies retinal fundus images across the 5-stage clinical severity scale (No DR, Mild, Moderate, Severe, Proliferative) using deep computer vision trained on APTOS 2019 / MESSIDOR-2.
- **Localization & Visualization Layer:** Highlights model-predicted regions with bounding boxes/confidence scores and visually orients the patient using a medically aligned anatomical reference body diagram (anterior view: Patient Right = Viewer Left).
- **Paired Multimodal Analysis:** Simultaneously processes a written report and clinical imaging, generating independent explanations with automated finding-discrepancy alerts.
- **Plain-Language Explanation Layer:** Translates complex clinical evidence into clear, reassuring consumer terminology with actionable questions for physician consultations.

---

## Core Capabilities

- **Medical Report Explanation:** Upload text-based or scanned PDFs, JPGs, and PNGs. Translates complex jargon into everyday metaphors, highlights reassuring findings, and provides three tailored questions for your doctor.
- **Pediatric Wrist X-Ray Detection:** Upload pediatric wrist radiographs for research/demo bounding-box localization of possible fracture-like patterns.
- **Diabetic Retinopathy Screening:** Upload retinal fundus photographs for automated severity assessment and screening guidance.
- **Paired Upload Workflow:** Ingest a written report and corresponding scan side-by-side to review findings together while keeping clinical boundaries separate.
- **Privacy-by-Design:** Uploaded files are processed strictly in memory and are never persisted to disk or cloud storage without explicit user consent.
- **User Dashboard & History:** Secure session-authenticated account system with per-user isolated SQLite persistence for saved explanations.

> **Safety Requirement:** ClarifyMed output is research and educational demonstration aid only. It does not provide definitive diagnoses and directs users to qualified healthcare professionals for clinical evaluation. "No detection" or "No DR" does not guarantee normalcy.

---

## Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Patient Web Browser                      │
│            React 18 + Vite Web Application                  │
│   • Accessible UI Modals       • SVG Reference Anatomies    │
│   • Multi-mode Ingestion Forms • Print-Optimized Stylesheet │
└──────────────────────────────┬──────────────────────────────┘
                               │ Local HTTP / Multipart
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Security & Orchestration Layer                │
│                 Node.js / Express Server                    │
│   • Magic-Byte File Validation • Session Authentication     │
│   • Rate Limiting              • SQLite History Database    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Internal IPC REST (Port 8000)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Offline Python ML Engine                    │
│   • Biomedical NER (d4data)   • DistilBERT Urgency Classif. │
│   • YOLOv8n Pediatric X-ray    • EfficientNet Retinopathy   │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, Vite, Lucide Icons, responsive CSS with print stylesheet.
- **Backend API:** Node.js (v24+), Express 5, `node:sqlite` (WAL mode), Multer, secure session cookies.
- **Hosted Report Provider:** Groq (`qwen/qwen3.8-27b`) or OpenAI (`gpt-5-mini`), with batched OCR and structured output formatting.
- **Offline ML Service:** Python 3.11+, FastAPI, Uvicorn, PyTorch, Ultralytics YOLOv8, HuggingFace Transformers.

---

## Quick Start & Local Setup

### Prerequisites
- Node.js 24+ installed
- Python 3.10+ with PyTorch (for offline ML service)
- A Groq API key or OpenAI API key (for hosted LLM explanations)

### 1. Installation
Clone the repository and install Node dependencies:
```powershell
git clone https://github.com/kanchanc03-momo/ClarifyMed.git
cd ClarifyMed
npm install
```

Install Python ML requirements:
```powershell
pip install -r ml_service/requirements.txt
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
Configure your keys in `.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b
PORT=8787
ML_SERVICE_URL=http://127.0.0.1:8000
```

### 3. Run the Services
To run the full development stack (Frontend, Backend API, and Python ML Service):
```powershell
npm run dev:offline
```

Or run individual components:
- **Frontend (Vite):** `npm run dev:web` (runs on `http://localhost:5173`)
- **Backend API:** `npm run dev:api` (runs on `http://localhost:8787`)
- **Python ML Service:** `npm run dev:ml` (runs on `http://127.0.0.1:8000`)

### 4. Running Tests
Run the automated test suites:
```powershell
# Run Node.js API and frontend tests
npm run test:node

# Run Python ML service unit tests
npm run test:python
```

---

## Sample Clinical Data
Pre-curated test fixtures for pediatric wrist X-rays and pointers for diabetic retinopathy fundus datasets are available in [`samples/README.md`](samples/README.md).

---

## License & Medical Disclaimer
This software is provided for research, educational, and prototype evaluation purposes. It is **not an FDA-approved medical device** and should never be used as a primary diagnostic tool. Always consult a licensed clinician for medical advice.
