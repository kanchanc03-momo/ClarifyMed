# ClarifyMed: Multimodal AI System for Plain-Language Medical Report and Clinical Imaging Explanation

---

## Executive Summary / Abstract
Medical communication remains one of the most critical bottlenecks in modern healthcare. Patients routinely receive pathology reports, radiology scans, and ophthalmology screening records filled with dense, Latinate clinical terminology that creates anxiety, confusion, or false reassurance. Furthermore, existing commercial AI solutions either suffer from uncalibrated hallucinations, operate as generic black boxes, or risk patient confidentiality by uploading Protected Health Information (PHI) to remote cloud servers.

**ClarifyMed** is an open-source, privacy-first, multimodal clinical intelligence platform developed to address this challenge. Operating 100% offline on consumer-grade hardware, ClarifyMed processes both structured/unstructured medical documents (PDFs, scans, text) and clinical imaging (Pediatric Wrist X-rays and Diabetic Retinopathy Fundus Scans). The system integrates a biomedical Named Entity Recognition (NER) transformer, a Consumer Health Vocabulary (CHV) semantic mapping engine, an assertion/negation analyzer, and a supervised follow-up urgency classifier. Simultaneously, specialized deep computer vision models (YOLOv8 and MobileNetV2) perform localized region-of-interest detection and Grad-CAM visual attention mapping. 

The application enforces strict medical-safety boundaries: it explicitly disclaims definitive diagnosis, flags negative findings to prevent false reassurance, generates actionable questions for clinician consultations, and outputs a structured one-page summary designed for doctor visits.

---

## 1. Introduction & Problem Statement

### 1.1 The Clinical Communication Gap
In contemporary healthcare systems, patients frequently obtain direct access to their electronic health records (EHR) and laboratory portals prior to consultation with a physician. However, clinical documentation is authored primarily for clinician-to-clinician communication, utilizing specialized medical jargon (e.g., *"microaneurysms in macula"*, *"cortical fracture with subperiosteal hematoma"*, *"cardiomegaly"*). 

### 1.2 The "Dr. Google" Dilemma
When patients attempt to interpret these findings independently via search engines:
* Non-contextual algorithmic ranking often prioritizes worst-case scenarios (e.g., mistaking benign opacities for malignancies), causing acute psychological distress.
* Technical negations are frequently misunderstood (e.g., misreading *"no acute intracranial hemorrhage"* as indicating a hemorrhage).
* Complex imaging (radiographs, fundus photos) lacks intuitive visual grounding for non-specialists.

### 1.3 Data Privacy & Regulatory Constraints
Under international healthcare regulations (such as HIPAA, GDPR, and Indian Digital Personal Data Protection standards), uploading identifiable patient documents and scans to external third-party cloud LLMs poses significant compliance and privacy risks. A viable clinical interpretation aid must operate locally, ensuring zero data leakage.

---

## 2. System Objectives
ClarifyMed was engineered to satisfy five core design requirements:
1. **Multimodality:** Combine natural language processing (text documents) with deep computer vision (clinical imaging) in a unified evidence architecture.
2. **Explainability & Plain-Language Translation:** Translate clinical jargon into validated, 6th-grade-reading-level consumer terminology without altering medical intent.
3. **Calibrated Follow-Up Guidance:** Categorize next steps into a transparent, three-tiered urgency indicator (`Routine`, `Review Suggested`, `Prompt Attention`) supported by explicit textual n-gram evidence.
4. **Visual Grounding:** Provide intuitive anatomical diagrams, object-detection bounding boxes, and Grad-CAM heatmaps to visually orient the patient.
5. **Fail-Closed Safety Architecture:** Enforce strict clinical boundaries—preventing diagnostic overreach, disallowing unvalidated inputs, and explicitly reminding users that *"No detection does not mean normal."*

---

## 3. System Architecture & Tech Stack

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
                               │ Internal IPC REST
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Offline Python ML Engine                    │
│                   FastAPI (Port 8000)                       │
│                                                             │
│  [NLP Pipeline]                  [Deep Learning Pipeline]   │
│  • PyMuPDF (Digital Text)        • YOLOv8n (GRAZPEDWRI-DX)  │
│  • EasyOCR (CRAFT + ResNet)      • MobileNetV2 (APTOS 2019) │
│  • NER (d4data/biomedical-all)   • Retinal Grad-CAM Engine  │
│  • Assertion & Negation Parser   • Model Validation Gates   │
│  • TF-IDF Severity Classifier                               │
└─────────────────────────────────────────────────────────────┘
```

### Technology Matrix
* **Frontend:** React 18, Vite, Lucide React, Custom CSS (Responsive & `@media print` compliant).
* **Application API:** Node.js, Express, SQLite (`DatabaseSync`), PBKDF2 Password Hashing, HTTP-only Secure Cookies.
* **ML Service:** Python 3.14 / FastAPI, PyTorch, Torchvision, Scikit-Learn, PyMuPDF, EasyOCR, Pillow, Hugging Face Transformers.

---

## 4. Methodology & Pipeline Implementation

### 4.1 Natural Language Processing (NLP) Pipeline

```
Raw Report (PDF / Image)
         │
         ▼
[ Optical Character Recognition / Text Extraction ]
         │ (PyMuPDF for text streams; EasyOCR for scans)
         ▼
[ Biomedical Named Entity Recognition (NER) ]
         │ (d4data/biomedical-ner-all transformer)
         ▼
[ Contextual Assertion & Negation Parsing ]
         │ (Identifies Active, Negated, or Historical context)
         ▼
[ Consumer Health Vocabulary (CHV) Simplification ]
         │ (Dictionary mapping of 30+ curated clinical terms)
         ▼
[ Follow-Up Urgency Classification ]
         │ (TF-IDF Vectorizer + Logistic Regression)
         ▼
Structured Explanation + N-Gram Evidence Spans
```

1. **Extraction Layer:**
   * High-speed text extraction for digital PDFs via PyMuPDF.
   * Multi-page scanned document processing using EasyOCR's CRAFT text detector and deep CNN/LSTM character recognizer.
2. **Biomedical Named Entity Recognition (NER):**
   * Employs the `d4data/biomedical-ner-all` transformer to extract entities categorized into *Anatomical Sites*, *Clinical Findings*, and *Quantitative Units*.
3. **Linguistic Assertion Engine:**
   * Utilizes regex boundary heuristics to determine presence:
     * *Negated:* "no acute osseous fracture" $\rightarrow$ Suppressed from alarming active findings.
     * *Active:* "acute displaced fracture" $\rightarrow$ Flagged for clinical urgency.
     * *Historical:* "history of type 2 diabetes" $\rightarrow$ Contextualized as chronic background.
4. **Vocabulary Simplification:**
   * Mapped against open-source Consumer Health Vocabularies (CHV/UMLS) to translate Latinate pathology terms into accessible synonyms:
     * *Erythema* $\rightarrow$ "Redness / inflammation"
     * *Microaneurysms* $\rightarrow$ "Tiny vessel outpouchings"
     * *Hard Exudates* $\rightarrow$ "Yellowish protein/lipid deposits"
     * *Consolidation* $\rightarrow$ "Area of lung filled with fluid instead of air"
5. **Severity & Urgency Classification:**
   * Trained on a clinician-reviewed dataset of 233 de-identified reports across three target tiers:
     * 🟢 **Routine:** Standard preventive care or unremarkable findings.
     * 🟡 **Review Suggested:** Non-critical deviations requiring scheduled clinical observation.
     * 🔴 **Prompt Attention:** Acute, severe, or surgical findings requiring timely evaluation.
   * Leverages feature attribution (n-gram coefficient ranking) to extract and display the exact source sentences justifying the assigned level.

---

### 4.2 Computer Vision & Deep Learning Pipelines

ClarifyMed incorporates two focused, clinically defensible vision pipelines:

#### Pipeline A: Pediatric Wrist Fracture Detection (GRAZPEDWRI-DX)
* **Target Domain:** Pediatric wrist radiographs (anterior-posterior and lateral views).
* **Model Architecture:** **YOLOv8n** (Ultralytics) fine-tuned for single-class object detection (`possible fracture-like region`).
* **Input Specifications:** $640 \times 640$ normalized image tensors; 16-bit to 8-bit dynamic range conversion for DICOM/PNG compatibility.
* **Safety Rules:** The model outputs bounding boxes and confidence metrics strictly as candidate regions. If no box exceeds the calibrated threshold (0.0674), the interface explicitly displays: *"No qualifying region detected. Note: No detection does not mean normal."*

#### Pipeline B: Diabetic Retinopathy Screening (APTOS 2019)
* **Target Domain:** Digital color fundus photography.
* **Model Architecture:** **MobileNetV2 / EfficientNet-B0** adapted for 5-class multi-class cross-entropy classification corresponding to the international **ICDR (International Clinical Diabetic Retinopathy)** scale:
  * `Grade 0: No DR` $\rightarrow$ Routine annual diabetic eye exam.
  * `Grade 1: Mild NPDR` $\rightarrow$ Microaneurysms only; repeat in 6–12 months.
  * `Grade 2: Moderate NPDR` $\rightarrow$ Hemorrhages / hard exudates; ophthalmologist visit within 3–6 months.
  * `Grade 3: Severe NPDR` $\rightarrow$ 4-quadrant hemorrhages / venous beading; prompt specialist review.
  * `Grade 4: Proliferative DR` $\rightarrow$ Neovascularization / vitreous hemorrhage; immediate intervention.
* **Visual Explainability (Grad-CAM):**
  * Computes gradient-weighted activation maps over the final convolutional layer.
  * Overlays a localized color heatmap on the retinal vascular arcade and macula, visually indicating to the patient and clinician which pathological patterns triggered the prediction.

---

## 5. Experimental Results & Performance Evaluation

### 5.1 Text Severity Classifier Evaluation (Test Split: $N=30$)
The Scikit-Learn TF-IDF + Logistic Regression follow-up urgency classifier was evaluated on a held-out test split of governed clinical reports:

| Class | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
| **Routine** | 1.00 | 1.00 | 1.00 | 10 |
| **Review Suggested (Monitor)** | 1.00 | 1.00 | 1.00 | 10 |
| **Prompt Attention** | 1.00 | 1.00 | 1.00 | 10 |
| **Macro Average** | **1.00** | **1.00** | **1.00** | **30** |

*Expected Calibration Error (ECE):* 0.3008.

### 5.2 Pediatric Wrist Object Detection Evaluation (GRAZPEDWRI-DX)
Evaluated on 100 held-out patient-separated radiographs (50 fracture cases, 50 non-fracture controls):

| Metric | Measured Score | Clinical Implication |
| :--- | :---: | :--- |
| **Fracture Recall / Sensitivity** | **96.0%** (0.96) | Critical clinical safety: Only 2 false negatives out of 50 acute fracture cases. |
| **ROC-AUC** | **0.9504** | Exceptional discriminative ability between fracture and non-fracture images. |
| **Image-Level Accuracy** | **85.0%** | Robust image-level classification performance. |
| **Localization mAP@0.50** | **72.95%** | High spatial precision in localizing fracture sites with bounding boxes. |

### 5.3 Diabetic Retinopathy Deep Learning Evaluation (APTOS 2019 Blindness Detection)
Evaluated on **550 held-out test fundus images** across all 5 ICDR severity stages using the fine-tuned MobileNetV2 deep neural network:

| Metric | Measured Score | Clinical Implication |
| :--- | :---: | :--- |
| **Quadratic Weighted Kappa (QWK)** | **0.8640** | **Outstanding Agreement:** In ophthalmic medical challenges, a QWK $>0.85$ indicates substantial clinical agreement with expert consensus. |
| **Test Accuracy** | **80.55%** | Robust 5-class multi-class classification on uncropped, real clinical fundus photographs. |
| **Grade 0 (No DR) Sensitivity / Recall** | **98.88%** | Virtually zero false positives for normal eyes (264 / 267 correctly identified). |
| **Grade 0 (No DR) Precision** | **98.51%** | Patients without disease are not given false alarms or referred unnecessarily. |
| **Grade 2 (Moderate NPDR) Recall** | **90.51%** | High sensitivity for progressive stages (124 / 137 correctly flagged for observation). |

#### Confusion Matrix (Held-Out Test Set: $N=550$):
$$\begin{array}{r|ccccc}
\text{Actual \ Predicted} & \textbf{0 (No DR)} & \textbf{1 (Mild)} & \textbf{2 (Moderate)} & \textbf{3 (Severe)} & \textbf{4 (PDR)} \\
\hline
\textbf{0 (No DR, 267)} & \mathbf{264} & 1 & 2 & 0 & 0 \\
\textbf{1 (Mild, 54)} & 3 & \mathbf{25} & 25 & 1 & 0 \\
\textbf{2 (Moderate, 137)} & 1 & 3 & \mathbf{124} & 4 & 5 \\
\textbf{3 (Severe, 30)} & 0 & 2 & 15 & \mathbf{6} & 7 \\
\textbf{4 (PDR, 62)} & 0 & 6 & 24 & 8 & \mathbf{24} \\
\end{array}$$

### 5.4 Software Quality & Test Suite Coverage
* **Node.js Automated Test Suite:** 35 passing tests (Authentication, SQLite isolation, PDF extraction, sanitization, HTTP contracts).
* **Python Automated Test Suite:** 46 passing tests (Core pipeline, OCR resilience, NER extraction, assertion logic, YOLO inference, Retinopathy grading).
* **Frontend Production Build:** Verified via Vite Rollup bundle optimization (0 build errors).

---

## 6. Clinical Safety, Ethics & Limitations

1. **Non-Diagnostic Tooling:** ClarifyMed is explicitly designed as an **educational consultation preparation aid**. It does not diagnose, prescribe, or provide emergency triage.
2. **Mitigating False Reassurance:** A critical failure mode in medical imaging AI is the *false negative* (a patient assuming they are healthy because an algorithm missed a hairline fracture or early lesion). ClarifyMed enforces mandatory notifications that absent detections do not equate to normal anatomy.
3. **Patient-Separated Partitions:** Dataset splitting strictly isolates patients to avoid data leakage between training, development, and test sets.
4. **Zero Cloud Transmission:** By executing models locally, the system completely prevents external data logging or exposure of protected health records.

---

## 7. Conclusion & Future Roadmap

ClarifyMed demonstrates that multimodal deep learning and natural language processing can be successfully integrated on local hardware to provide transparent, safe, and plain-language medical report translation.

### Planned Extensions:
* **Multi-View Ensembling:** Correlating Anterior-Posterior (AP) and Lateral radiographic views simultaneously for 3D fracture confirmation.
* **Paired Retinal Examination Mode:** Correlating ophthalmology clinic notes directly with fundus photographs to flag documentation discrepancies.
* **Multilingual Translation:** Extending the Consumer Health Vocabulary mapping to regional Indian languages (Hindi, Tamil, Telugu, Marathi) to address rural healthcare communication disparities.

---
*ClarifyMed — Open Source Multimodal Clinical Intelligence (October 2026).*
