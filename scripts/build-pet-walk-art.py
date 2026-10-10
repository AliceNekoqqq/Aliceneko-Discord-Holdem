#!/usr/bin/env python3
"""Create compact JPEGs from generated pet-walk scenes; no inline payload modules."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "pet-walk"
records = []
for item in json.loads((ASSETS / "generation.json").read_text()):
    source = Path(item["original_path"])
    target = ASSETS / f"{item['id']}.jpg"
    if source.is_file():
        with Image.open(source) as image:
            image = image.convert("RGB")
            if image.width / image.height < 1.75 or image.width / image.height > 1.81:
                raise ValueError(f"Expected 16:9 generated scene: {source} ({image.size})")
            image = ImageOps.fit(image, (960, 540), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            image.save(target, "JPEG", quality=82, optimize=True, progressive=True)
    elif not target.is_file():
        raise FileNotFoundError(f"No source PNG or committed JPEG for {item['id']}")
    data = target.read_bytes()
    with Image.open(target) as image:
        if image.format != "JPEG" or image.size != (960, 540):
            raise ValueError(f"Invalid scene JPEG: {target}")
        width, height = image.size
    records.append({"id": item["id"], "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "width": width, "height": height})
for generated in (ROOT / "pet-walk-art-data.mjs", ROOT / "pet-walk-map-data.mjs"):
    generated.unlink(missing_ok=True)
print(json.dumps({"scenes": len(records), "jpeg_bytes": sum(row["bytes"] for row in records)}))
