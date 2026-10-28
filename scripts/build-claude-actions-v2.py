"""Pack eight full Claude actions; keep typing hands below a fixed torso layer."""
from pathlib import Path
import json
from PIL import Image
from claude_sprite_tools import clean_cell, body_anchor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/claude/actions-v2'
SIZE = 128
NAMES = ('wave', 'typing', 'jump', 'idle', 'thinking', 'approval', 'error', 'sleep')
v1 = Image.open(ROOT / 'assets/claude/actions-v1/atlas.png').convert('RGBA')
frames, metrics = [], []

for row, name in enumerate(NAMES):
    if name in ('wave', 'jump'):
        old_row = 0 if name == 'wave' else 2
        frames.extend(v1.crop((i*128, old_row*128, (i+1)*128, (old_row+1)*128)) for i in range(8))
        continue
    source = Image.open(OUT / f'raw/{name}.png').convert('RGBA')
    cw, ch = source.width // 4, source.height // 2
    cells = [clean_cell(source.crop((i%4*cw-40, i//4*ch, (i%4+1)*cw+40, (i//4+1)*ch)), name)
             for i in range(8)]
    _, bw, top, bottom = body_anchor(cells[0])
    # One camera scale for the entire action preserves natural leaning/crouching.
    # In particular, sleeping poses are not stretched back into standing poses.
    sx, sy = 80/bw, 44/(bottom-top)
    action = []
    for i, cell in enumerate(cells):
        pixels = cell.load()
        orange_x = sorted(x for y in range(cell.height) for x in range(cell.width)
                          if pixels[x,y][3] and pixels[x,y][0] > 125
                          and pixels[x,y][0] > pixels[x,y][1]*1.35 and pixels[x,y][2] < 140)
        center = (orange_x[len(orange_x)*15//100] + orange_x[len(orange_x)*85//100])/2
        ground = 108
        bounds = cell.getbbox()
        anchor_bottom = bounds[3]
        if name == 'approval':
            # Anchor the outer feet, not the shield tip: raising the shield must
            # never drag the torso down to keep a moving prop on the floor.
            foot_rows = [y for y in range(cell.height)
                         if sum(1 for x in range(cell.width)
                                if bw*.24 < abs(x-center) < bw*.48 and pixels[x,y][3]
                                and pixels[x,y][0] > 125 and pixels[x,y][0] > pixels[x,y][1]*1.35
                                and pixels[x,y][2] < 140) >= 4]
            anchor_bottom = max(foot_rows)+1
        pos = (round(64-center*sx), round(ground-anchor_bottom*sy))
        resized = cell.resize((round(cell.width*sx), round(cell.height*sy)), Image.Resampling.LANCZOS)
        sprite = Image.new('RGBA',(128,128));sprite.paste(resized,pos)
        sprite.putdata([(min(255,round(r/8)*8), min(255,round(g/8)*8), min(255,round(b/8)*8),255)
                        if a>=128 else (0,0,0,0) for r,g,b,a in sprite.get_flattened_data()])
        action.append(sprite)
        metrics.append({'action':name,'frame':i,'cameraScale':[sx,sy],'ground':ground,'offset':pos})
    if name == 'typing':
        # Use the identical head/torso on every frame; all motion stays at the keys.
        # This also prevents a future generated raised-hand pose entering playback.
        fixed_top = action[0].crop((0,0,128,64))
        for sprite in action:
            sprite.paste(fixed_top,(0,0))
        assert len({sprite.crop((0,0,128,64)).tobytes() for sprite in action}) == 1
    if name == 'idle':
        action[-1] = action[0].copy()
    frames.extend(action)

assert len(frames) == 64
atlas = Image.new('RGBA',(1024,1024))
for i,sprite in enumerate(frames):
    assert sprite.getbbox() is not None
    assert sprite.getchannel('A').getextrema() == (0,255)
    bounds=sprite.getbbox()
    if NAMES[i//8] not in ('wave','jump'):
        assert 0<bounds[0]<bounds[2]<128 and 0<bounds[1]<bounds[3]<128, (NAMES[i//8],i%8,bounds)
    atlas.paste(sprite,(i%8*128,i//8*128))
atlas.save(OUT / 'atlas.png')
(OUT / 'registration.json').write_text(json.dumps({'actions':list(NAMES),'frames':metrics,
    'typingHandsMinY':64,'totalFrames':64},indent=2),encoding='utf-8')
preview=Image.new('RGB',(1536,8*192),'#191f2a')
for i,sprite in enumerate(frames):
    big=sprite.resize((192,192),Image.Resampling.NEAREST)
    preview.paste(big,(i%8*192,i//8*192),big)
preview.save(OUT / 'contact-sheet.png')
print(f'Packed 64 key poses for all 8 Claude states: {OUT / "atlas.png"}')
