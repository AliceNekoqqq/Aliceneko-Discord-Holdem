#!/usr/bin/env python3
"""Build the 72-item realistic prop atlas and preserve the original public assets."""
import hashlib
import json
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

def split_props(image):
    """Assign complete connected props to cells, including parts crossing a cell edge."""
    width, height = image.size
    remaining = bytearray(value > 32 for value in image.getchannel('A').tobytes())
    cells = {(row, col): [] for row in range(6) for col in range(4)}
    for start in range(len(remaining)):
        if not remaining[start]:
            continue
        remaining[start] = 0
        pending, group = [start], []
        sx = sy = 0
        while pending:
            index = pending.pop()
            group.append(index)
            x, y = index % width, index // width
            sx += x
            sy += y
            neighbors = ([index-1] if x else []) + ([index+1] if x+1 < width else [])
            neighbors += ([index-width] if y else []) + ([index+width] if y+1 < height else [])
            for neighbor in neighbors:
                if remaining[neighbor]:
                    remaining[neighbor] = 0
                    pending.append(neighbor)
        cells[(min(5, int(sy/len(group)/256)), min(3, int(sx/len(group)/256)))].append(group)
    result = {}
    for cell, groups in cells.items():
        largest = max(map(len, groups), default=0)
        if largest < 100:
            raise ValueError(f'Missing prop in cell {cell}')
        kept = [index for group in groups if len(group) >= largest*0.08 for index in group]
        left, right = max(0, min(i%width for i in kept)-3), min(width, max(i%width for i in kept)+4)
        top, bottom = max(0, min(i//width for i in kept)-3), min(height, max(i//width for i in kept)+4)
        art = image.crop((left, top, right, bottom))
        mask = bytearray(art.width*art.height)
        for index in kept:
            mask[(index//width-top)*art.width+index%width-left] = 255
        # Two pixels of dilation preserve the original antialiasing and transparent edges.
        alpha = art.getchannel('A')
        expanded = Image.frombytes('L', art.size, bytes(mask)).filter(ImageFilter.MaxFilter(5))
        art.putalpha(Image.frombytes('L', art.size, bytes(min(a,b) for a,b in zip(alpha.tobytes(),expanded.tobytes()))))
        result[cell] = art
    return result

def encode_icon(art):
    art = art.copy()
    art.thumbnail((232, 232), Image.Resampling.LANCZOS)
    icon = Image.new('RGBA', (256, 256))
    icon.paste(art, ((256-art.width)//2, (256-art.height)//2))
    encoded = BytesIO()
    icon.save(encoded, format='PNG', optimize=True)
    content = encoded.getvalue()
    if not content.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid auction PNG')
    return icon, content

def build():
    public = ROOT / 'public/art/auction'
    public.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGBA', (512, 2304))
    legacy_atlas = Image.new('RGBA', (512, 768))
    items, legacy = {}, {}
    sources = [('atlas-v1.webp', 0, 'v1'), ('props-base-v2.webp', 0, 'v2'),
               ('props-memes-a-v2.webp', 4, 'v2'), ('props-memes-b-v2.webp', 8, 'v2')]
    for pack, (filename, first, version) in enumerate(sources):
        image = Image.open(ROOT / 'assets/auction-art' / filename).convert('RGBA')
        if image.size != (1024, 1536):
            raise ValueError(f'Invalid auction source dimensions: {filename}')
        cuts = [0, 253, 507, 755, 1005, 1245, 1536]
        props = split_props(image) if version == 'v2' else None
        for quality in range(6):
            for col in range(4):
                item_id = f'tavern-{quality}-{first+col}'
                art = props[(quality, col)] if props else image.crop((col*256+8, cuts[quality], (col+1)*256-8, cuts[quality+1]))
                icon, content = encode_icon(art)
                path = f'/art/auction/{item_id}-{version}.png'
                (public / f'{item_id}-{version}.png').write_bytes(content)
                x, y = col*128, (quality+(pack-1)*6 if version == 'v2' else quality)*128
                record = {'x': x, 'y': y, 'path': path, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
                small = icon.resize((128, 128), Image.Resampling.LANCZOS)
                if version == 'v1':
                    legacy_atlas.paste(small, (x, y)); legacy[item_id] = record
                else:
                    atlas.paste(small, (x, y)); items[item_id] = record
    old_pixels = legacy_atlas.tobytes()
    (public / 'sprites-v1.bin').write_bytes(old_pixels)
    pixels = atlas.tobytes()
    (public / 'sprites-v2.bin').write_bytes(pixels)
    manifest = {'width': 512, 'height': 2304, 'size': 128,
                'path': '/art/auction/sprites-v2.bin', 'bytes': len(pixels),
                'sha256': hashlib.sha256(pixels).hexdigest(), 'items': items, 'legacyItems': legacy,
                'legacyAtlas': {'path': '/art/auction/sprites-v1.bin', 'bytes': len(old_pixels), 'sha256': hashlib.sha256(old_pixels).hexdigest()}}
    (ROOT / 'auction-art-manifest.mjs').write_text('// Generated by scripts/build-auction-art.py.\nexport default '+json.dumps(manifest, ensure_ascii=False, indent=2)+';\n')
    return manifest

if __name__ == '__main__':
    result = build()
    print(json.dumps({'images': len(result['items']), 'atlasBytes': result['bytes']}))
