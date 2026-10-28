import json,sys,math
from pathlib import Path
from PIL import Image,ImageDraw
bundle=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);spec=json.loads(Path(sys.argv[3]).read_text(encoding='utf-8-sig'));m=json.loads((bundle/'manifest.json').read_text());state=sys.argv[4] if len(sys.argv)>4 else 'idle';clip=m['clips'][state];sheets={v:Image.open(bundle/('original' if v=='original' else '')/clip['file']).convert('RGBA') for v in ['original','pixel']};frames=[];durations=[]
for n,frame in enumerate(clip['frames']):
 board=Image.new('RGB',(512,282),(35,40,50));d=ImageDraw.Draw(board);d.text((10,8),'Original',fill='white');d.text((266,8),'Pixel',fill='white')
 for col,v in enumerate(['original','pixel']):
  size=m['original']['tileSize'] if v=='original' else m['tileSize'];tile=sheets[v].crop((frame%m['columns']*size,frame//m['columns']*size,(frame%m['columns']+1)*size,(frame//m['columns']+1)*size)).resize((256,256),Image.Resampling.LANCZOS if v=='original' else Image.Resampling.NEAREST);board.paste(tile,(col*256,26),tile.getchannel('A'))
 frames.append(board);durations.append(spec.get('playbackOverrides',{}).get(state,{}).get('frameDurations',{}).get(str(frame),clip['durations'][n]))
frames[0].save(out/(state+'-comparison.png'));frames[0].save(out/(state+'-comparison.gif'),save_all=True,append_images=frames[1:],duration=durations,loop=0)
print(out/(state+'-comparison.gif'))
