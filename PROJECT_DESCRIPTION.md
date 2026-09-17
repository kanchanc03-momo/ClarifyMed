# ClarifyMed — Complete Project Description

## 1. Project overview

ClarifyMed is a multimodal deep-learning and NLP system that helps patients understand medical reports and X-ray images. A user uploads either a text-based medical report (PDF or scanned image) or a supported X-ray image. The system returns a plain-language explanation, a visual representation of the reported location, and a follow-up indicator while maintaining strict medical-safety boundaries: it does not diagnose and always recommends consultation with a qualified clinician.

The target implementation combines separate NLP and computer-vision pipelines. This makes it a genuine multimodal system rather than a single hosted-model tool.

## 2. Chosen model architecture

Current implementation update (15 September 2026): the installed follow-up model is the CPU TF-IDF/logistic-regression classifier. DistilBERT is optional research. The selected X-ray training dataset is FracAtlas, with a dedicated fracture-classification runtime adapter; its Colab training is still blocked by a user-reported error. MURA is an alternative supported checkpoint format. The table below records the original target architecture.

| Component | Purpose | Model approach | Intended runtime |
|---|---|---|---|
| TrOCR or EasyOCR | Extract text from scanned or photographed reports | Pretrained, initially used as-is and evaluated on the target documents | CPU |
| `d4data/biomedical-ner-all` | Extract biomedical entities from report text | Pretrained Apache-2.0 model, initially used as-is | CPU |
| CHV dictionary mapping | Convert mapped medical terminology to consumer language | Curated rule-based vocabulary | CPU |
| DistilBERT | Classify source-supported follow-up wording | Fine-tuned on a governed, clinician-reviewed labeled dataset | CPU inference; Colab/Kaggle GPU training |
| MobileNetV2 | Classify supported musculoskeletal X-rays as normal/abnormal | Transfer learning on MURA | CPU inference where latency permits; Colab/Kaggle GPU training |
| Grad-CAM | Show model-sensitive image regions | Explainability technique applied to the trained CNN | CPU or GPU |

### Important scope constraints

- This table describes the **target offline architecture**. The current web prototype still uses Groq and requires an API key until the local pipelines are integrated and validated.
- MURA contains **musculoskeletal/bone X-rays**, not general chest or whole-body X-rays. A MobileNetV2 trained on MURA must reject unsupported modalities and must not be presented as a general X-ray model.
- A Grad-CAM heatmap shows regions influencing a model prediction; it does not prove lesion localization or clinical correctness.
- A 200–300-example severity dataset can support a student prototype experiment, but it is not enough by itself to establish product-level clinical safety. Labels, splits, class balance, inter-rater agreement, calibration, and external evaluation must be documented.
- Follow-up labels should be tied to explicit report wording and clinician-reviewed policy. The UI must not imply emergency triage or diagnostic certainty.
- UMLS/CHV and MURA access, redistribution, and deployment terms must be reviewed before including data or derived artifacts in a public repository or commercial product.

## 3. Training and deployment

### Development and training

- OCR, biomedical NER, vocabulary mapping, and optimized inference are intended to run on CPU.
- DistilBERT and MobileNetV2 training will use an approved Colab, Kaggle, or other CUDA GPU environment.
- Training notebooks are temporary compute environments. Trained weights, metrics, model cards, and reproducibility metadata are exported after training.
- Credentialed or restricted medical datasets must remain private and must not be committed to Git.

### Runtime

Once exported, approved weights are loaded by a persistent inference service. Colab or Kaggle does not need to remain active. CPU deployment is acceptable only after measured latency, memory, concurrency, and model-quality requirements pass.

Hugging Face Spaces or Streamlit Community Cloud may be used for a non-clinical portfolio/demo deployment. A healthcare production deployment additionally requires persistent infrastructure, authentication, protected storage, monitoring, privacy/security review, and appropriate regulatory and clinical approval. Free Hugging Face Spaces may sleep when inactive and use ephemeral local disk.

## 4. Proposed four-week prototype plan

### Week 1 — Text-pipeline foundation

- Set up the environment and ML folder structure.
- Build PDF text extraction and scanned-document OCR.
- Integrate and evaluate the pretrained biomedical NER model on approved or synthetic samples.
- Begin MURA and UMLS/CHV access and license review.

### Week 2 — Core intelligence

- Build the CHV-based terminology simplification mapping.
- Create and clinician-review a labeled follow-up dataset.
- Fine-tune and evaluate DistilBERT.
- Train the MobileNetV2 MURA baseline in an approved GPU environment.

### Week 3 — Visual layer

- Build the body/organ SVG diagram library.
- Add conservative, validated location-term-to-diagram mapping.
- Implement Grad-CAM for the trained X-ray classifier.
- Build the follow-up gauge visualization.

### Week 4 — Integration and demo deployment

- Implement safety and hedged-language rules.
- Integrate the offline ML services with the existing ClarifyMed React/Node application. Streamlit may be used for an isolated ML demo, but does not replace the existing product frontend by default.
- Test varied report formats, OCR failures, unsupported X-rays, and ambiguous inputs.
- Deploy a clearly labeled non-clinical demo.
- Complete the README, architecture diagram, model cards, evaluation report, and demonstration video.

The four-week schedule is a prototype target, not a clinical-production schedule.

## 5. Intended user output

After choosing **Text Report** or **X-ray Image**, the user sees:

- a short plain-language summary;
- a validated body/organ diagram location for supported report terms, or the original supported X-ray with a clearly labeled Grad-CAM overlay;
- a routine → monitor → prompt-review follow-up gauge based on source-supported wording;
- extracted finding, location, and measurement details;
- responsibly hedged general context;
- suggested questions for a clinician;
- an always-visible non-diagnostic disclaimer.

## 6. NLP and deep-learning roles

- **NLP** is the task family used to process and simplify report text: OCR handoff, entity extraction, vocabulary mapping, assertion handling, relation extraction, and follow-up classification.
- **Deep learning** supplies transformer models for text and CNNs for images.
- **Multimodal** means ClarifyMed processes text documents and supported medical images through separate pipelines exposed through one application and one evidence contract.

## 7. Release boundary

The architecture above is appropriate for a student/research prototype and portfolio demonstration. It becomes a healthcare product only after governed-data development, independent clinical validation, privacy/security engineering, operational readiness, and jurisdiction-specific regulatory review.
