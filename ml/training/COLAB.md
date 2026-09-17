# Google Colab training run

Use a private Colab notebook and private Google Drive directory. Do not share or commit credentialed RadGraph data.

1. Upload or clone the ClarifyMed repository into `/content/ClarifyMed`.
2. Select **Runtime → Change runtime type → GPU**.
3. Mount Drive and place authorized RadGraph files at `/content/drive/MyDrive/ClarifyMed-private/radgraph/`.
4. Run:

```python
%cd /content/ClarifyMed
!pip install -r ml/training/requirements.txt
!python ml/training/train_radgraph_ner.py \
  --data-dir /content/drive/MyDrive/ClarifyMed-private/radgraph \
  --output-dir /content/drive/MyDrive/ClarifyMed-private/models/radgraph-ner-v1
```

The script refuses to run without CUDA and refuses to proceed unless the official `train.json`, `dev.json`, and `test.json` files exist. It trains against train, selects against dev, evaluates once against test, and writes weights plus `training-metadata.json` to private Drive.

Do not report the resulting model as clinically validated. The held-out RadGraph score measures a narrow chest-radiology extraction task and does not establish safety on other report types, institutions, populations, OCR output, or downstream patient explanations.
