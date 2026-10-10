#!/usr/bin/env python3
"""Validate and fingerprint the fifteen imagegen portraits; no inline payload modules."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "pets"
PAIRS = {
    "lamp-cat": ["amber", "silver", "calico"],
    "moss-dog": ["moss", "cocoa", "cream"],
    "paper-sparrow": ["rice", "ink", "rose"],
    "dusk-rabbit": ["lavender", "peach", "moon"],
    "river-otter": ["chestnut", "slate", "honey"],
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--version", choices=("v1", "v2"), default="v2")
VERSION = parser.parse_args().version
manifest = []
for species, coats in PAIRS.items():
    for coat in coats:
        stem = f"{species}-{coat}-{VERSION}"
        original, packed = ASSETS / f"{stem}.png", ASSETS / f"{stem}.jpg"
        if original.exists():
            with Image.open(original) as image:
                if image.mode == "RGBA" and image.getchannel("A").getextrema()[0] != 255:
                    raise ValueError(f"Expected opaque card background: {original}")
                image = image.convert("RGB")
                image.thumbnail((768, 768), Image.Resampling.LANCZOS)
                image.save(packed, "JPEG", quality=88, optimize=True, progressive=True)
        if not packed.exists():
            raise FileNotFoundError(f"Missing generated portrait: {stem}")
        data = packed.read_bytes()
        with Image.open(packed) as image:
            width, height = image.size
            if image.format != "JPEG" or width != height or width < 512:
                raise ValueError(f"Invalid packed portrait: {packed}")
        manifest.append({
            "species": species, "coat": coat, "path": str(packed.relative_to(ROOT)),
            "width": width, "height": height, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "source": "imagegen",
        })
manifest_name = "manifest.json" if VERSION == "v1" else "manifest-v2.json"
(ASSETS / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
for generated in (ROOT / "pet-art-data.mjs", ROOT / "pet-art-data-v2.mjs"):
    generated.unlink(missing_ok=True)
print(json.dumps({"version": VERSION, "portraits": len(manifest), "jpeg_bytes": sum(row["bytes"] for row in manifest)}))
