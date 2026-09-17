"""Build a standalone Colab notebook with the current trainer embedded."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def build():
    cells = []
    def markdown(text):
        cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': text.splitlines(keepends=True)})
    def code(text):
        cells.append({'cell_type': 'code', 'metadata': {}, 'source': text.splitlines(keepends=True), 'execution_count': None, 'outputs': []})

    markdown('''# ClarifyMed: FracAtlas X-ray training
Run each cell in order. First choose **Runtime > Change runtime type > GPU** (T4 if available).
Your FracAtlas ZIP should be in **My Drive/ClarifyMed**. This notebook includes the training program; no project upload is required.

This trains an image-level fracture research baseline, not a general abnormality or diagnostic model.
Dataset: [Abedeen et al., Scientific Data (2023)](https://www.nature.com/articles/s41597-023-02432-4),
[FracAtlas on Figshare](https://doi.org/10.6084/m9.figshare.22363012), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Patient separation cannot be verified without patient IDs. Identical decoded images are kept together; near-duplicates may remain.
Do not tune using test results. Model scores and Grad-CAM require further evaluation before deployment.
''')
    markdown('## 1. Connect Drive and check GPU\nApprove the Google Drive connection when prompted.')
    code('''from google.colab import drive
drive.mount('/content/drive')
import torch
if not torch.cuda.is_available():
    raise RuntimeError('No GPU connected. Select Runtime > Change runtime type > GPU, reconnect, then run this cell again.')
print('GPU:', torch.cuda.get_device_name(0))
''')
    markdown('## 2. Install supporting packages\nKeep Colab\'s existing matched PyTorch/torchvision installation.')
    code('''import subprocess, sys
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'scikit-learn>=1.5,<2', 'Pillow>=11,<13'], check=True)
import torchvision
print('PyTorch:', torch.__version__, 'torchvision:', torchvision.__version__)
''')
    markdown('## 3. Find and extract the ZIP\nIf multiple ZIPs are found, enter the number of the FracAtlas ZIP. If none are found, paste its full Drive path when prompted. Extraction happens on Colab storage for faster training.')
    code('''from pathlib import Path
import shutil, zipfile, tempfile, stat
drive_folder = Path('/content/drive/MyDrive/ClarifyMed')
candidates = sorted(p for p in drive_folder.rglob('*') if p.is_file() and p.suffix.lower() == '.zip') if drive_folder.exists() else []
if len(candidates) == 1:
    zip_path = candidates[0]
elif candidates:
    for index, path in enumerate(candidates, 1):
        print(index, path)
    choice = int(input('Enter the FracAtlas ZIP number: '))
    if not 1 <= choice <= len(candidates):
        raise ValueError('Invalid selection. Rerun this cell.')
    zip_path = candidates[choice - 1]
else:
    zip_path = Path(input('Paste full ZIP path, for example /content/drive/MyDrive/FracAtlas.zip: ').strip())
if not zip_path.is_file() or not zipfile.is_zipfile(zip_path):
    raise ValueError('The selected path is not a valid ZIP. Check that the Drive upload has finished.')
extracted = Path(tempfile.mkdtemp(prefix='clarifymed-fracatlas-', dir='/content'))
local_zip = extracted / 'source.zip'
shutil.copy2(zip_path, local_zip)
with zipfile.ZipFile(local_zip) as archive:
    if sum(info.file_size for info in archive.infolist()) > shutil.disk_usage(extracted).free:
        raise RuntimeError('Not enough Colab disk space to extract this ZIP.')
    for info in archive.infolist():
        target = (extracted / info.filename.replace('\\\\', '/')).resolve()
        if not target.is_relative_to(extracted.resolve()) or stat.S_ISLNK(info.external_attr >> 16):
            raise ValueError('ZIP contains an unsafe path or symbolic link.')
    archive.extractall(extracted)
roots = [p.parent for p in extracted.rglob('dataset.csv') if (p.parent / 'images').is_dir()]
if len(roots) != 1:
    raise ValueError('Expected one dataset.csv with an images folder beside it. Check that you uploaded the complete FracAtlas ZIP.')
DATA_ROOT = roots[0]
print('Dataset ready:', DATA_ROOT)
''')
    markdown('## 4. Prepare the training program\nThis cell writes the included trainer into the temporary Colab runtime.')
    code("trainer_source = " + repr((HERE / 'train_fracatlas.py').read_text(encoding='utf-8')) + "\nPath('/content/train_fracatlas.py').write_text(trainer_source, encoding='utf-8')\nprint('Training program ready.')\n")
    markdown('''## 5. Validate images and train
Start with the defaults: 8 epochs, batch size 32. Each run gets a new Drive output folder.
This cell checks images, makes reproducible splits, trains MobileNetV2, saves the best development checkpoint, then evaluates once on test data.
Unreadable images are recorded in data_validation.json and excluded (at most 1%); larger damage stops the run and requires a clean ZIP.
Expect image-check messages followed by epoch progress. Keep Colab open while it runs.
If the session ends early, the latest best checkpoint may be saved, but the run is **incomplete** without evaluation.json.
Automatic resume is not implemented; a rerun starts a new experiment and preserves previous results.
''')
    code('''from datetime import datetime, timezone
import uuid
EPOCHS = 8
BATCH_SIZE = 32
run_name = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
OUTPUT_DIR = drive_folder / 'models' / ('fracatlas-' + run_name)
print('Results will be saved to:', OUTPUT_DIR, flush=True)
subprocess.run([sys.executable, '-u', '/content/train_fracatlas.py',
                '--data-root', str(DATA_ROOT), '--output-dir', str(OUTPUT_DIR),
                '--epochs', str(EPOCHS), '--batch-size', str(BATCH_SIZE), '--skip-unreadable'], check=True)
''')
    markdown('## 6. View results and create an artifact ZIP\nAfter training, share evaluation.json for review. The website supports FracAtlas checkpoints through XRAY_MODEL_PATH after evaluation; do not install these weights as a MURA model.')
    code('''import json
evaluation_file = OUTPUT_DIR / 'evaluation.json'
if not evaluation_file.is_file():
    raise RuntimeError('Training/evaluation has not completed. Inspect the preceding cell error.')
evaluation = json.loads(evaluation_file.read_text())
print(json.dumps(evaluation['test_metrics'], indent=2))
archive_path = shutil.make_archive(str(OUTPUT_DIR), 'zip', root_dir=OUTPUT_DIR)
print('Saved model, evaluation, split manifest, predictions, and model card to:', OUTPUT_DIR)
print('Artifact ZIP:', archive_path)
print('Next: share evaluation.json with Codex for review and app integration.')
''')
    notebook = {'cells': cells, 'metadata': {'accelerator': 'GPU', 'colab': {'name': 'ClarifyMed_FracAtlas_Training.ipynb'},
                'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
                'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}
    for index, cell in enumerate(cells):
        cell['id'] = f'fracatlas-{index}'
    output = HERE / 'ClarifyMed_FracAtlas_Training.ipynb'
    output.write_text(json.dumps(notebook, indent=2), encoding='utf-8')
    for cell in cells:
        if cell['cell_type'] == 'code':
            compile(''.join(cell['source']), '<notebook cell>', 'exec')
    print(output)


if __name__ == '__main__':
    build()
