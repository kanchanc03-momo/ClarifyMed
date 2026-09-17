from __future__ import annotations

import re
from functools import lru_cache

from .schemas import Evidence
from .settings import BASIC_SEVERITY_MODEL_PATH, SEVERITY_MODEL_DIR

PROMPT = re.compile(r"\b(urgent|urgently|immediate|prompt|critical)\b", re.IGNORECASE)
MONITOR = re.compile(r"\b(follow[ -]?up|recommend(?:ed|ation)?|monitor|surveillance|compare with prior)\b", re.IGNORECASE)


@lru_cache(maxsize=1)
def _distilbert_classifier():
    if not (SEVERITY_MODEL_DIR / "config.json").is_file():
        return None
    from transformers import pipeline
    return pipeline("text-classification", model=str(SEVERITY_MODEL_DIR), tokenizer=str(SEVERITY_MODEL_DIR), device=-1)


@lru_cache(maxsize=1)
def _basic_classifier():
    if not BASIC_SEVERITY_MODEL_PATH.is_file():
        return None
    import joblib
    return joblib.load(BASIC_SEVERITY_MODEL_PATH)


def _extract_basic_evidence(text: str, pipeline, label: str) -> list[Evidence]:
    import numpy as np
    vectorizer = pipeline.named_steps.get("tfidf")
    classifier = pipeline.named_steps.get("clf")
    if not vectorizer or not classifier:
        return []
    
    classes = list(classifier.classes_)
    if label not in classes:
        return []
    
    class_idx = classes.index(label)
    feature_names = np.array(vectorizer.get_feature_names_out())
    top_indices = np.argsort(classifier.coef_[class_idx])[-20:][::-1]
    top_ngrams = set(feature_names[top_indices])

    evidence: list[Evidence] = []
    text_lower = text.lower()
    for ngram in top_ngrams:
        if len(ngram) < 3 or ngram in {"in", "with", "or", "are"}:
            continue
        pattern = re.compile(rf"\b{re.escape(ngram)}\b", re.IGNORECASE)
        for match in pattern.finditer(text):
            evidence.append(Evidence(match.group(), match.start(), match.end(), "model_feature_attribution"))
            if len(evidence) >= 3:
                return evidence
    return evidence


def classify(text: str) -> tuple[str, float, list[Evidence], str]:
    # 1. Check for DistilBERT transformer
    distilbert = _distilbert_classifier()
    if distilbert is not None:
        result = distilbert(text[:4000], truncation=True)[0]
        label = str(result["label"]).casefold()
        if label not in {"routine", "monitor", "prompt"}:
            raise RuntimeError("Severity artifact returned an unsupported label.")
        return label, float(result["score"]), [], "distilbert"

    # 2. Check for Basic Scikit-Learn model
    basic_model = _basic_classifier()
    if basic_model is not None:
        probs = basic_model.predict_proba([text[:4000]])[0]
        classes = list(basic_model.classes_)
        best_idx = int(probs.argmax())
        label = classes[best_idx].casefold()
        score = float(probs[best_idx])
        evidence = _extract_basic_evidence(text, basic_model, label)
        return label, score, evidence, "scikit_learn_tfidf_lr"

    # 3. Explicit wording fallback
    match = PROMPT.search(text) or MONITOR.search(text)
    level = "prompt" if match and PROMPT.fullmatch(match.group()) else ("monitor" if match else "routine")
    evidence = [] if not match else [Evidence(match.group(), match.start(), match.end(), "explicit_report_wording")]
    return level, 1.0 if match else 0.4, evidence, "explicit_wording_fallback"
