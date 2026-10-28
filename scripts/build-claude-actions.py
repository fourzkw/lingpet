"""Pack the v1 action samples. Shared registration lives in claude_sprite_tools."""
from pathlib import Path
import json
from PIL import Image
from claude_sprite_tools import clean_cell, body_anchor
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/claude/actions-v1'
SIZE = 128

frames = []
anchors = []
for name in ('wave', 'typing', 'jump'):
    source = Image.open(OUT / f'raw/{name}.png').convert('RGBA')
    cell_w, cell_h = source.width // 4, source.height // 2
    for index in range(8):
        x, y = index % 4 * cell_w, index // 4 * cell_h
        cell = clean_cell(source.crop((x-40, y, x + cell_w+40, y + cell_h)), name)
        center, body_width, body_top, body_bottom = body_anchor(cell)
        scale = 80 / body_width
        body_height = 38 if name == 'jump' and index in (1, 6) else 44
        scale_y = body_height / (body_bottom-body_top)
        bounds = cell.getbbox()
        lift = [0, 0, 5, 15, 20, 9, 0, 0][index] if name == 'jump' else 0
        target = Image.new('RGBA', (SIZE, SIZE))
        scaled = cell.resize((round(cell.width * scale), round(cell.height * scale_y)), Image.Resampling.LANCZOS)
        px = round(64 - center * scale)
        py = round(108 - lift - bounds[3] * scale_y)
        target.paste(scaled, (px, py))
        # Snap alpha and colors to the actual game grid after the single downsample.
        data = [(min(255, round(r/8)*8), min(255, round(g/8)*8), min(255, round(b/8)*8), 255)
                if a >= 128 else (0, 0, 0, 0) for r, g, b, a in target.get_flattened_data()]
        target.putdata(data)
        frames.append(target)
        anchors.append({'action': name, 'frame': index, 'sourceBodyWidth': body_width,
                        'targetBodyWidth': 80, 'targetBodyHeight': body_height,
                        'ground': 108, 'lift': lift, 'offset': [px, py]})

# Reuse the same neutral stance at clip boundaries to avoid a seam on recovery.
frames[7] = frames[0].copy()
frames[16] = frames[0].copy()
frames[23] = frames[0].copy()

atlas = Image.new('RGBA', (SIZE * 8, SIZE * 3))
for index, frame in enumerate(frames):
    atlas.paste(frame, (index % 8 * SIZE, index // 8 * SIZE))
atlas.save(OUT / 'atlas.png')
(OUT / 'anchors.json').write_text(json.dumps(anchors, indent=2), encoding='utf-8')

preview = Image.new('RGB', (8*192, 3*192), '#191f2a')
for index, frame in enumerate(frames):
    big = frame.resize((192, 192), Image.Resampling.NEAREST)
    preview.paste(big, (index % 8 * 192, index // 8 * 192), big)
preview.save(OUT / 'contact-sheet.png')
print(f'Packed {len(frames)} independent key poses into {OUT / "atlas.png"}')
