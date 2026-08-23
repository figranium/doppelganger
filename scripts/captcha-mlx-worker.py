#!/usr/bin/env python3
import base64
import contextlib
import io
import json
import os
import sys
import traceback

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from PIL import Image


def emit(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def extract_detections(parsed, label, threshold):
    if not isinstance(parsed, dict):
        return []
    value = parsed.get("<OPEN_VOCABULARY_DETECTION>", parsed)
    boxes = value.get("bboxes", value.get("boxes", [])) if isinstance(value, dict) else []
    labels = value.get("labels", []) if isinstance(value, dict) else []
    return [
        {"box": box, "label": labels[index] if index < len(labels) else label, "score": threshold}
        for index, box in enumerate(boxes)
    ]


def main():
    if len(sys.argv) != 2:
        raise RuntimeError("Expected a verified local model directory")
    model_path = os.path.realpath(sys.argv[1])
    if not os.path.isdir(model_path):
        raise RuntimeError("Verified local MLX model directory is missing")
    with contextlib.redirect_stdout(sys.stderr):
        from mlx_vlm import generate, load
        model, processor = load(model_path, lazy=False, trust_remote_code=True)
    emit({"ready": True, "backend": "mlx"})
    for line in sys.stdin:
        request = json.loads(line)
        request_id = request.get("id")
        try:
            image = Image.open(io.BytesIO(base64.b64decode(request["imageBase64"], validate=True))).convert("RGB")
            label = str(request["label"]).strip()
            threshold = float(request.get("threshold", 0.18))
            task = f"<OPEN_VOCABULARY_DETECTION>{label}"
            with contextlib.redirect_stdout(sys.stderr):
                result = generate(model, processor, task, image, max_tokens=64, temperature=0.0)
            text = result.text if hasattr(result, "text") else str(result)
            parsed = processor.post_process_generation(text, task=task, image_size=image.size)
            emit({"id": request_id, "detections": extract_detections(parsed, label, threshold)})
        except Exception as error:
            emit({"id": request_id, "error": str(error)[:500]})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(traceback.format_exc())
        emit({"ready": False, "error": str(error)[:500]})
        sys.exit(1)
