"""Contact sheets for generated video and exported original/pixel interactions."""
import json,sys
from pathlib import Path
import av
from PIL import Image,ImageDraw

records=json.loads(Path('output/interaction-v1/projects.json').read_text(encoding='utf-8'))
files=Path(sys.argv[1])/'creation/files'
for record in records:
    for kind,asset_id in record.get('videos',{}).items():
        frames=[frame.to_image() for frame in av.open(str(files/asset_id)).decode(video=0)]
        width,height=frames[0].size
        board=Image.new('RGB',(width*4,(height+24)*2),'#20242b');draw=ImageDraw.Draw(board)
        for index in range(8):
            n=round(index*(len(frames)-1)/7);x=index%4*width;y=index//4*(height+24)
            board.paste(frames[n],(x,y));draw.text((x+5,y+height+4),f'{kind} {n}/{len(frames)}',fill='white')
        board.save(f'output/interaction-v1/{record["asset"]}-{kind}-review.jpg')
    if not record.get('bundle'):continue
    manifest=json.loads((Path(record['bundle'])/'manifest.json').read_text(encoding='utf-8'))
    board=Image.new('RGB',(256*8,280*len(manifest['variants'])*2),'#20242b');draw=ImageDraw.Draw(board)
    for action,(kind,state) in enumerate([('click','idle'),('pet','done')]):
        clip=manifest['clips'][state]
        for variant_index,variant in enumerate(manifest['variants']):
            tile=manifest['original']['tileSize'] if variant=='original' else manifest['tileSize']
            folder=manifest['original']['directory'] if variant=='original' else ''
            sheet=Image.open(Path(record['bundle'])/folder/clip['file']).convert('RGBA')
            for index in range(8):
                frame=clip['frames'][round(index*(len(clip['frames'])-1)/7)];col=frame%manifest['columns'];row=frame//manifest['columns']
                im=sheet.crop((col*tile,row*tile,(col+1)*tile,(row+1)*tile));im=im.resize((256,256),Image.Resampling.NEAREST if variant=='pixel' else Image.Resampling.LANCZOS)
                x=index*256;y=(action*len(manifest['variants'])+variant_index)*280
                # Alternate light/dark backdrops to reveal matte spill and holes.
                board.paste(Image.new('RGB',(256,256),'#f3eee8' if index%2 else '#20242b'),(x,y));board.paste(im,(x,y),im)
                draw.text((x+4,y+258),f'{kind}/{variant}/{frame}',fill='white')
    board.save(f'output/interaction-v1/{record["asset"]}-matte-review.jpg')
