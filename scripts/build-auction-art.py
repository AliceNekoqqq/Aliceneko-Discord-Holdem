#!/usr/bin/env python3
"""Build 204 realistic props and preserve all prior public assets."""
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
    previous = {'path': '/art/auction/sprites-v2.bin', 'bytes': len(pixels), 'sha256': hashlib.sha256(pixels).hexdigest()}
    previous_items = {key: record.copy() for key,record in items.items()}
    # Revised natural palettes get new PNG paths; immutable v1/v2 files stay intact.
    plans = json.loads((ROOT / 'assets/auction-art/palettes-v4.json').read_text())
    for plan in (p for p in plans['packs'] if 'firstVariant' in p):
        source = Image.open(ROOT / 'assets/auction-art' / plan['output']).convert('RGBA')
        if source.size != (1024,1536):
            raise ValueError('Invalid revised palette atlas dimensions')
        props = split_props(source)
        for slot,entry in enumerate(plan['items']):
            key = entry['id']
            icon,content = encode_icon(props[(slot//4,slot%4)])
            path = f'/art/auction/{key}-v4.png'
            (public / f'{key}-v4.png').write_bytes(content)
            items[key] = {'path':path,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()}
    all_icons = {key: Image.open(public / record['path'].split('/')[-1]).convert('RGBA') for key,record in items.items()}
    extra = json.loads((ROOT / 'assets/auction-art/expansion-v2.json').read_text())
    for pack in 'abcde':
        source = Image.open(ROOT / 'assets/auction-art' / f'props-expansion-{pack}-v3.webp').convert('RGBA')
        if source.size != (1024, 1536):
            raise ValueError(f'Invalid expansion dimensions: {pack}')
        props = split_props(source)
        for entry in (x for x in extra if x['pack'] == pack):
            key,slot = entry['id'],entry['slot']
            if key in items:
                raise ValueError(f'Duplicate prop: {key}')
            icon,content = encode_icon(props[(slot//4, slot%4)])
            path = f'/art/auction/{key}-v3.png'
            (public / f'{key}-v3.png').write_bytes(content)
            items[key] = {'path':path, 'bytes':len(content), 'sha256':hashlib.sha256(content).hexdigest()}
            all_icons[key] = icon
    if len(items) != 192:
        raise ValueError('Incomplete 192-item atlas')
    expanded = Image.new('RGBA', (1024, 3072))
    for index,(key,record) in enumerate(items.items()):
        x,y = index%8*128, index//8*128
        expanded.paste(all_icons[key].resize((128,128), Image.Resampling.LANCZOS), (x,y))
        record.update(x=x,y=y)
    expanded_pixels = expanded.tobytes()
    (public / 'sprites-v3.bin').write_bytes(expanded_pixels)
    previous_expanded = {'path': '/art/auction/sprites-v3.bin', 'bytes': len(expanded_pixels), 'sha256': hashlib.sha256(expanded_pixels).hexdigest()}
    large_atlas = Image.new('RGBA', (1024, 3840))
    large_atlas.paste(expanded, (0, 0))
    large = json.loads((ROOT / 'assets/auction-art/large-props-v1.json').read_text())
    sources = {pack: Image.open(ROOT / 'assets/auction-art' / f'large-props-{pack}-v1.webp').convert('RGBA') for pack in 'ab'}
    for index, entry in enumerate(large):
        source, slot, key = sources[entry['pack']], entry['slot'], entry['id']
        if source.size != (1024, 1536) or key in items:
            raise ValueError('Invalid large prop source')
        art = source.crop((slot%2*512, slot//2*512, slot%2*512+512, slot//2*512+512))
        bbox = art.getchannel('A').getbbox()
        if not bbox:
            raise ValueError('Missing large prop')
        icon, content = encode_icon(art.crop(bbox))
        x, y = index%4*256, 3072+index//4*256
        large_atlas.paste(icon, (x, y))
        path = f'/art/auction/{key}-v5.png'
        (public / f'{key}-v5.png').write_bytes(content)
        items[key] = {'x':x,'y':y,'size':256,'bounds':icon.getchannel('A').getbbox(),'path':path,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()}
    pixels = large_atlas.tobytes()
    (public / 'sprites-v4.bin').write_bytes(pixels)
    manifest = {'width': 1024, 'height': 3840, 'size': 128,
                'path': '/art/auction/sprites-v4.bin', 'bytes': len(pixels),
                'sha256': hashlib.sha256(pixels).hexdigest(), 'items': items, 'legacyItems': legacy,
                'previousExpandedAtlas': previous_expanded, 'previousAtlas': previous, 'previousItems': previous_items,
                'legacyAtlas': {'path': '/art/auction/sprites-v1.bin', 'bytes': len(old_pixels), 'sha256': hashlib.sha256(old_pixels).hexdigest()}}
    (ROOT / 'auction-art-manifest.mjs').write_text('// Generated by scripts/build-auction-art.py.\nexport default '+json.dumps(manifest, ensure_ascii=False, indent=2)+';\n')
    return manifest

if __name__ == '__main__':
    result = build()
    print(json.dumps({'images': len(result['items']), 'atlasBytes': result['bytes']}))
