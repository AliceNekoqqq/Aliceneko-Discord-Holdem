"""Bake bundled Twemoji SVG artwork into compressed RGBA static sprite files.

Build-only dependencies: PyMuPDF and Pillow.
Source/artwork license: TWEMOJI_LICENSE.txt and assets/emoji/ATTRIBUTION.md.
"""
from pathlib import Path
import json
import zlib
import fitz
from PIL import Image
root = Path(__file__).resolve().parents[1]
names = {
    "butterfly":"1f98b", "cat":"1f431", "fox":"1f98a", "rabbit":"1f430",
    "panda":"1f43c", "bear":"1f43b", "wolf":"1f43a", "owl":"1f989",
    "penguin":"1f427", "frog":"1f438", "flower":"1f338", "star":"2b50",
    "ghost":"1f47b", "robot":"1f916", "moon":"1f319", "fire":"1f525",
    "unicorn":"1f984", "octopus":"1f419", "crown":"1f451"
}
sprites = {}
for key, file in names.items():
    doc = fitz.open(root / "assets" / "emoji" / f"{file}.svg")
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(128 / page.rect.width, 128 / page.rect.height), alpha=True)
    image = Image.open(__import__("io").BytesIO(pix.tobytes("png"))).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)
    sprites[key] = zlib.compress(image.tobytes(), 9)
asset_dir = root / "assets" / "renderer"
asset_dir.mkdir(parents=True, exist_ok=True)
atlas = bytearray()
manifest = {}
for key, data in sprites.items():
    manifest[key] = [len(atlas), len(data)]
    atlas.extend(data)
(asset_dir / "emoji-sprites.bin").write_bytes(atlas)
(root / "emoji-sprites.mjs").write_text(
    "// Twemoji, CC-BY 4.0; see assets/emoji/ATTRIBUTION.md. Generated static sprite index.\n"
    + "export const emojiSprites=" + json.dumps(manifest, separators=(",", ":")) + ";\n"
    + "export const emojiSpriteAtlas=" + json.dumps({"bytes": len(atlas)}) + ";\n"
)
print(f"{len(sprites)} emoji sprites, {len(atlas)} binary bytes")
