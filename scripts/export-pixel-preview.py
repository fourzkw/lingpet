"""Assemble the runtime frames exported by desktop-smoke.mjs into a GIF."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'artifacts' / 'desktop-smoke'
strips = [Image.open(root / f'pixel-{state}-strip.png').convert('RGB')
          for state in ('idle', 'working')]
palette_source = Image.new('RGB', (strips[0].width, strips[0].height * 2))
for row, strip in enumerate(strips):
    palette_source.paste(strip, (0, row * strip.height))
palette = palette_source.quantize(colors=256)
frames = [strip.crop((frame * 512, 0, (frame + 1) * 512, 288))
          .quantize(palette=palette, dither=Image.Dither.NONE)
          for strip in strips for frame in range(32)]
target = root / 'pixel-animation.gif'
frames[0].save(target, save_all=True, append_images=frames[1:],
               duration=100, loop=0, disposal=2, optimize=False)
with Image.open(target) as preview:
    assert preview.n_frames == 64
print(f'Exported {target}: 64 runtime frames, 100ms/frame')
