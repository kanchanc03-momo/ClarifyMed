import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from clarifymed_nlp.evaluation import evaluate_jsonl

fixture = Path(__file__).resolve().parent / "fixtures" / "nlp_baseline.jsonl"
print(json.dumps(evaluate_jsonl(fixture), indent=2))
