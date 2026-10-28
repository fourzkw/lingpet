"""Export the three authored action samples from the real renderer capture."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'artifacts/desktop-smoke'
strip = Image.open(root / 'claude-actions-strip.png').convert('RGB')
assert strip.size == (768*40, 288)
palette = strip.quantize(colors=256)
frames = [strip.crop((i*768, 0, (i+1)*768, 288)).quantize(palette=palette, dither=Image.Dither.NONE)
          for i in range(40)]
target = root / 'claude-actions.gif'
frames[0].save(target, save_all=True, append_images=frames[1:], duration=80, loop=0,
               disposal=2, optimize=False)
with Image.open(target) as result:
    assert result.n_frames == 40
for column, name in enumerate(('wave', 'typing', 'jump')):
    clip = [frame.crop((column*256, 0, (column+1)*256, 288)) for frame in frames]
    clip[0].save(root / f'claude-{name}.gif', save_all=True, append_images=clip[1:], duration=80,
                 loop=0, disposal=2, optimize=False)
print(f'Exported {target}: 40 runtime frames, 80ms/frame; jump repeats for preview only.')
