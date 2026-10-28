"""Export smooth, unquantized versions from the original H3 videos."""
import av,json,argparse
import numpy as np
from pathlib import Path
from PIL import Image
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from q_video_anchor import lock_lower_legs
parser=argparse.ArgumentParser();parser.add_argument('--asset',default='chatgpt-dragon');parser.add_argument('--video-root');args=parser.parse_args()
root=Path('assets')/args.asset/'actions-v1';video_root=Path(args.video_root or ('output/video/'+args.asset+'-v1'));out=root/'original';out.mkdir(exist_ok=True)
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
for state,clip in manifest['clips'].items():
 with av.open(str(video_root/state/'video.mp4')) as video:
  frames=list(video.decode(video=0));picks=list(range(0,len(frames),2))
  if picks[-1]!=len(frames)-1:picks.append(len(frames)-1)
  sheet=Image.new('RGBA',(384*8,384*8))
  for index,n in enumerate(picks):
   rgb=np.asarray(lock_lower_legs(frames[n].to_image(),video_root)).astype(np.float32);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
   dominance=g-np.maximum(r,b)
   alpha=np.clip(1-(dominance-10)/50,0,1)*255
   rgb[:,:,1]=np.where(dominance>10,np.minimum(g,(r+b)/2),g)
   rgba=np.concatenate((rgb,np.round(alpha)[:,:,None]),axis=2).astype(np.uint8);rgba[rgba[:,:,3]==0]=0
   image=Image.fromarray(rgba).resize((336,336),Image.Resampling.LANCZOS)
   # Tiny alpha values amplify chroma during canvas unpremultiplication.
   # Clamp spill after resizing as well, retaining meaningful smooth edges.
   clean=np.array(image);clean[:,:,1]=np.minimum(clean[:,:,1],np.maximum(clean[:,:,0],clean[:,:,2]));clean[clean[:,:,3]<4]=0;image=Image.fromarray(clean)
   tile=Image.new('RGBA',(384,384));tile.paste(image,(24,24))
   sheet.paste(tile,(index%8*384,index//8*384))
  sheet.save(out/(state+'.png'),optimize=True)
  if args.asset in ['chatgpt-q-v2','gemini-q-v2']:
   # Deliver a watchable final video as well as keeping the untouched H3 source.
   with av.open(str(video_root/state/'original-preview.mp4'),mode='w') as preview:
    stream=preview.add_stream('libx264',rate=12);stream.width=stream.height=384;stream.pix_fmt='yuv420p';stream.options={'crf':'18','preset':'fast'}
    for i in clip['frames']:
     tile=sheet.crop((i%8*384,i//8*384,i%8*384+384,i//8*384+384));background=Image.new('RGBA',(384,384),'#242936');background.alpha_composite(tile)
     for packet in stream.encode(av.VideoFrame.from_image(background.convert('RGB'))):preview.mux(packet)
    for packet in stream.encode():preview.mux(packet)
  print(state+' smooth original exported',flush=True)
manifest['original']={'tileSize':384,'directory':'original/','alpha':'smooth','palette':'unquantized'}
text=json.dumps(manifest,indent=2);(root/'manifest.json').write_text(text,encoding='utf-8');(root/'manifest.js').write_text('export default '+json.dumps(manifest,separators=(',',':'))+';\n',encoding='utf-8')
