"""Render and OCR image-heavy Biology PDFs locally.

The OCR dependencies are intentionally kept outside the application install. Run
with a temporary target directory on sys.path, for example:

    python -m pip install --target tmp/biology-ocr pymupdf rapidocr_onnxruntime
    python scripts/ocr-biology-scanned-pdfs.py

The script never uploads source files. It writes page-level JSON to tmp/.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = Path(r"C:\Users\jonat\Downloads")
EXTRACTED_DIR = ROOT / "tmp" / "pdfs" / "biology-extracted"
OUTPUT_DIR = ROOT / "tmp" / "pdfs" / "biology-ocr"


def safe_name(name: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9._-]+", "_", name, flags=re.I))


def load_targets() -> list[dict]:
    index = json.loads((EXTRACTED_DIR / "index.json").read_text(encoding="utf-8"))
    targets = []
    seen_hashes: set[str] = set()
    import hashlib

    for item in index:
        source_path = INPUT_DIR / item["name"]
        if not source_path.exists():
            continue
        digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        # Image-heavy sources and scanned exam papers have almost no selectable
        # text. The explicit names cover the two image-only revision guides.
        density = item.get("characters", 0) / max(item.get("pages", 1), 1)
        if density < 200 or "BIOLOGY_KNOW" in item["name"] or "CGP" in item["name"]:
            targets.append({**item, "path": str(source_path), "sha256": digest})
    return targets


def ocr_page(page, engine, fitz, numpy, scale: float) -> str:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = numpy.frombuffer(pixmap.samples, dtype=numpy.uint8).reshape(
        pixmap.height, pixmap.width, pixmap.n
    )
    detections, _ = engine(image)
    if not detections:
        return ""

    # RapidOCR returns quadrilaterals, recognized text, and confidence. Group
    # nearby boxes into lines, then preserve left-to-right order within lines.
    boxes = []
    for detection in detections:
        points, text, confidence = detection
        if not text or float(confidence) < 0.30:
            continue
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
        boxes.append({"x": min(xs), "y": min(ys), "height": max(ys) - min(ys), "text": str(text).strip()})
    boxes.sort(key=lambda box: (box["y"], box["x"]))

    lines: list[dict] = []
    for box in boxes:
        center = box["y"] + box["height"] / 2
        line = next((candidate for candidate in reversed(lines) if abs(candidate["center"] - center) <= max(12, box["height"] * 0.55)), None)
        if line is None:
            line = {"center": center, "items": []}
            lines.append(line)
        line["items"].append(box)
    for line in lines:
        line["items"].sort(key=lambda box: box["x"])
    lines.sort(key=lambda line: line["center"])
    return "\n".join(" ".join(item["text"] for item in line["items"]) for line in lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=1.5)
    parser.add_argument("--limit-pages", type=int, default=0)
    parser.add_argument("--only", nargs="*", default=[])
    args = parser.parse_args()

    ocr_root = ROOT / "tmp" / "biology-ocr"
    sys.path.insert(0, str(ocr_root))
    try:
        import numpy
        import pymupdf as fitz
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise SystemExit(
            "Install local OCR dependencies first: "
            "python -m pip install --target tmp/biology-ocr pymupdf rapidocr_onnxruntime"
        ) from error

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = load_targets()
    if args.only:
        wanted = {value.lower() for value in args.only}
        targets = [target for target in targets if target["name"].lower() in wanted or safe_name(target["name"]).lower() in wanted]

    engine = RapidOCR()
    summary = []
    for target in targets:
        output_path = OUTPUT_DIR / f"{safe_name(target['name'])}.json"
        if output_path.exists() and not args.limit_pages:
            summary.append({"name": target["name"], "status": "existing", "output": str(output_path)})
            continue
        document = fitz.open(target["path"])
        page_rows = []
        page_limit = min(len(document), args.limit_pages) if args.limit_pages else len(document)
        for page_index in range(page_limit):
            text = ocr_page(document[page_index], engine, fitz, numpy, args.scale)
            page_rows.append({"page": page_index + 1, "text": text, "ocr": "rapidocr_onnxruntime", "verbatim": True})
            print(f"{target['name']} page {page_index + 1}/{page_limit}: {len(text)} chars", flush=True)
        payload = {
            "name": target["name"],
            "path": target["path"],
            "sha256": target["sha256"],
            "pages": page_rows,
            "extraction": "local_ocr",
            "ocr_engine": "rapidocr_onnxruntime",
            "ocr_scale": args.scale,
        }
        output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        summary.append({"name": target["name"], "status": "processed", "pages": len(page_rows), "output": str(output_path)})
        document.close()
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
