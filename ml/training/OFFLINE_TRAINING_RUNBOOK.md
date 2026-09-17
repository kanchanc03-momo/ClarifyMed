# Offline model training runbook

Use a private, approved environment. The basic text classifier trains on CPU; the deep-learning scripts below require CUDA. Keep datasets and outputs in private mounted storage.

## CPU follow-up classifier

Install `scikit-learn`, `numpy`, and `joblib`, then run from the project root with a fresh output directory:

```bash
python ml/training/train_basic_severity.py --data ml/training/clinical_severity_dataset.csv --output-dir ml/artifacts/severity-candidate
```

The trainer validates review-status flags, classes, splits, and normalized duplicates before fitting. It fits only on `train`, reports development and test metrics separately, and preserves existing artifacts by refusing overwrites. `evaluation.json` includes calibration error, dataset/model hashes, package versions, and counts. Review flags in a CSV are not independent evidence of clinician review. This small dataset supports a prototype experiment only.

The 10 September candidate is in `ml/artifacts/severity-candidate-20260910/`. To explicitly test it in the Python service, set `BASIC_SEVERITY_MODEL_PATH` to its absolute `model.joblib` path and restart the service. Use the scikit-learn version recorded in its evaluation file when loading serialized weights. The installed default artifact remains unchanged.

## Local X-ray dataset mismatch

### FracAtlas Colab entry point

Upload `ClarifyMed_FracAtlas_Training.ipynb` through Colab's **File > Upload notebook**, select a GPU runtime, then run the numbered cells in order. The notebook is self-contained: it includes the FracAtlas trainer and searches `My Drive/ClarifyMed` for the uploaded ZIP. Results persist in `My Drive/ClarifyMed/models/fracatlas-<run-id>/`.

The trainer validates images and labels, groups identical decoded images before stratified splitting, uses training-only class weights, selects a checkpoint by development loss, and evaluates the test set after training. Its custom classification split includes both labels; it does not reuse fracture-only localization splits. Patient IDs are absent from the CSV, so patient-level separation cannot be guaranteed. Review all results before integration. A saved checkpoint without `evaluation.json` is an incomplete run.

Local validation without GPU:

```bash
python ml/training/train_fracatlas.py --data-root data/FracAtlas/FracAtlas --output-dir tmp/fracatlas-validation --validate-only
```

Rebuild the standalone notebook after changing the trainer with `python ml/training/build_fracatlas_notebook.py`.

`data/FracAtlas/FracAtlas/` contains FracAtlas data. The MURA command below does **not** accept it. Use the FracAtlas notebook above for the selected dataset. Runtime inference still expects MURA normal/abnormal classification; a FracAtlas adapter and fracture-specific result wording remain necessary before deployment.

## Environment

```bash
pip install -r ml/training/requirements.txt
```

## DistilBERT follow-up classifier

Prepare a clinician-reviewed CSV with `text,label,split`; labels are `routine`, `monitor`, and `prompt`. Do not use the synthetic template as training evidence.

Follow `SEVERITY_ANNOTATION_GUIDE.md`, then run the dependency-free dataset gate before uploading data to a GPU environment:

```bash
python ml/training/validate_severity_dataset.py --data /private/clarifymed/severity.csv --output /private/clarifymed/severity-validation.json
```

```bash
python ml/training/train_severity.py \
  --data /private/clarifymed/severity.csv \
  --output-dir /private/clarifymed/models/severity-distilbert
```

Review `evaluation.json`, class-specific recall, the confusion matrix, and calibration error before promotion.

## MURA MobileNetV2

After approving the MURA terms and privately downloading the official release:

```bash
python ml/training/train_mura.py \
  --mura-root /private/MURA-v1.1 \
  --output-dir /private/clarifymed/models/mura-mobilenetv2 \
  --epochs 8 \
  --batch-size 32 \
  --workers 2
```

The script creates its development split at the patient level, preserving the official MURA validation set as the held-out test set. It records deterministic-run metadata and reports image-level and study-level ROC-AUC, class-specific sensitivity/recall, confusion matrices, expected calibration error, and study-level results for every supported body part. Review all metrics and Grad-CAM failure cases before promotion. Do not select hyperparameters against the official validation results.

## Promotion

Copy only approved artifacts and evaluation reports into the private runtime artifact mount using the layout in `ml/artifacts/README.md`. The website does not require the training notebook to remain active after promotion.
