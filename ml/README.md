# ClarifyMed ML

This directory contains the dedicated multimodal ML system. It is intentionally separate from the web/API application so models can be trained, versioned, evaluated, and deployed independently.

## Build order

1. NLP extraction from machine-readable report text.
2. OCR and document-layout extraction for scanned reports.
3. X-ray abnormality classification/detection.
4. Anatomical localization and Grad-CAM generation.
5. Calibration, subgroup evaluation, clinical review, and model release gates.

## NLP Stage 1

`clarifymed_nlp` defines the stable evidence contract and a deterministic baseline extractor. The baseline is not a trained clinical model and must not be used as diagnostic evidence. Its purpose is to:

- define entity, assertion, source-span, confidence, and provenance fields;
- create labeled fixtures and measurable evaluation behavior;
- provide a fallback/reference implementation for a later fine-tuned model;
- prevent the explanation layer from inventing facts that are absent from the report.

Run the current tests from the repository root:

```powershell
python -m unittest discover -s ml/tests -v
```

Evaluate the deterministic baseline on the versioned synthetic fixture:

```powershell
python ml/evaluate.py
```

Fixtures in this repository must be synthetic or formally approved and de-identified. Never commit patient reports or protected health information.

The next NLP milestone is dataset preparation and annotation. Candidate pretrained encoders and datasets must be reviewed for license, intended use, population coverage, label compatibility, and privacy before selection. Model performance will be measured per entity type, assertion class, relation type, report source, and clinically important subgroup—not by one aggregate accuracy number.

## Trained NLP model plan

The deterministic baseline is not the production model. NLP v1 will be a fine-tuned radiology information-extraction model using the RadGraph label system:

- anatomy entities;
- definitely-present observations;
- uncertain observations;
- definitely-absent observations;
- `located_at`, `modify`, and `suggestive_of` relations.

### Hard prerequisites

1. Obtain credentialed access to RadGraph through PhysioNet, complete the required CITI training, and sign its data-use agreement.
2. Do not commit RadGraph, MIMIC-CXR, patient reports, credentials, or derived restricted data to this repository.
3. Use Python 3.11 or 3.12 in an isolated training environment with a CUDA-capable GPU. The current local machine has Python 3.14 and no detected NVIDIA GPU.
4. Record the exact dataset version, license, split hashes, base-model revision, training configuration, random seeds, and generated model-card metadata.
5. Keep the official held-out test set untouched until model and threshold choices are frozen.

Training code can be prepared locally, but a genuine model artifact cannot be produced until authorized data and suitable compute are available. A toy model trained on synthetic fixtures must never be described as a trained clinical model.

The Colab entry point is `training/ClarifyMed_RadGraph_Training.ipynb`; command-line instructions are in `training/COLAB.md`.
