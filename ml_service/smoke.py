"""Exercise real report models with synthetic inputs and record latency/failures.

Run: python -m ml_service.smoke --output tmp/offline-smoke.json
Set HF_HUB_OFFLINE=1 to verify a cached, disconnected run.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import time


def main():
    import fitz
    from PIL import Image, ImageDraw
    from .text_pipeline import analyze_text_report

    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    text = ('SYNTHETIC TEST REPORT. No real patient data.\n'
            'Right wrist: no acute fracture.\n'
            'Routine follow-up with the referring clinician is recommended.\n'
            'Measurement: 4 mm. This document is a software test fixture.')
    document = fitz.open()
    page = document.new_page()
    page.insert_text((40, 50), text, fontsize=14)
    pdf = document.tobytes()
    document.close()
    image = Image.new('RGB', (1600, 450), 'white')
    ImageDraw.Draw(image).multiline_text((30, 30), text, fill='black', font_size=28, spacing=15)
    image_buffer = BytesIO()
    image.save(image_buffer, format='PNG')
    results = []
    for name, data, media_type in [('text_pdf', pdf, 'application/pdf'), ('scanned_png', image_buffer.getvalue(), 'image/png')]:
        started = time.monotonic()
        try:
            report = analyze_text_report(data, media_type).to_api_dict()
            if 'wrist' not in report['extractedText'].lower():
                raise ValueError('Extraction did not preserve the synthetic wrist text.')
            results.append({'case': name, 'ok': True, 'seconds': round(time.monotonic() - started, 3),
                            'extractionMethod': report['extractionMethod'], 'entityCount': len(report['entities']),
                            'modelVersions': report['modelVersions'], 'warnings': report['warnings']})
        except Exception as error:
            results.append({'case': name, 'ok': False, 'seconds': round(time.monotonic() - started, 3),
                            'errorType': type(error).__name__, 'error': str(error)})
        print(json.dumps(results[-1]), flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'synthetic_inputs_only': True, 'results': results}, indent=2), encoding='utf-8')
    raise SystemExit(0 if all(result['ok'] for result in results) else 1)


if __name__ == '__main__':
    main()
