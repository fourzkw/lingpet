"""Assemble eight full-state previews from real renderer captures."""
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]/'artifacts/desktop-smoke'
states=('idle','thinking','working','input','approval','done','error','sleep')
strips={state:Image.open(root/f'claude-v2-{state}-strip.png').convert('RGB') for state in states}
palette_source=Image.new('RGB',(192*60,216*8))
for row,state in enumerate(states):
    assert strips[state].size==(192*60,216)
    palette_source.paste(strips[state],(0,row*216))
palette=palette_source.quantize(colors=256)
combined=[]
for frame in range(60):
    board=Image.new('RGB',(192*4,216*2),'#191f2a')
    for i,state in enumerate(states):
        cell=strips[state].crop((frame*192,0,(frame+1)*192,216))
        board.paste(cell,(i%4*192,i//4*216))
    combined.append(board.quantize(palette=palette,dither=Image.Dither.NONE))
target=root/'claude-complete-actions.gif'
combined[0].save(target,save_all=True,append_images=combined[1:],duration=80,loop=0,disposal=2,optimize=False)
for state in states:
    frames=[strips[state].crop((i*192,0,(i+1)*192,216)).quantize(palette=palette,dither=Image.Dither.NONE) for i in range(60)]
    frames[0].save(root/f'claude-v2-{state}.gif',save_all=True,append_images=frames[1:],duration=80,loop=0,disposal=2,optimize=False)
with Image.open(target) as result:
    assert result.n_frames==60
print(f'Exported 8 runtime clips and {target}; done/error replay only in this preview.')
