# Follow-up Label Annotation Guide

This dataset supports a prototype communication-guidance classifier. It does not assign medical urgency, diagnose disease, or replace clinician judgment.

## Before annotation

- Use only data approved by the responsible data owner and privacy team.
- De-identify each excerpt before it enters the labeling file.
- Keep source documents, identifiers, linkage keys, and reviewer credentials outside Git.
- Preserve enough surrounding wording to support the label; do not label isolated disease names.

## Labels

- `routine`: The source gives no time-sensitive follow-up instruction or uses ordinary/routine review wording.
- `monitor`: The source explicitly recommends surveillance, comparison, repeat imaging, or non-immediate follow-up.
- `prompt`: The source explicitly requests prompt, expedited, urgent, or immediate clinical review. This label is not an emergency determination.

When wording is ambiguous or the recommendation depends on missing context, flag the example for adjudication instead of guessing.

## Review workflow

1. Two qualified reviewers label each example independently.
2. Calculate raw agreement and Cohen's kappa before adjudication.
3. Resolve disagreements with a designated clinical adjudicator and record the reason.
4. Mark `review_status` as `approved` only after de-identification and adjudication are complete.
5. Assign splits by patient/source group so related reports never cross train, dev, and test.
6. Freeze the held-out test split before model or threshold selection.

Recommended columns are `example_id,text,label,split,reviewer_id,review_status,notes`. Only `text`, `label`, and `split` are consumed by training; governance fields should remain in the private dataset.

## Validation

From the repository root, run:

```bash
python ml/training/validate_severity_dataset.py --data /private/clarifymed/severity.csv --output /private/clarifymed/severity-validation.json
```

Warnings about possible identifiers require manual review. A passing automated check does not prove that data is de-identified or clinically correct.
