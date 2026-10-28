"""Chroma key fresh H3 videos, then pixelize with ONE shared palette."""
import av,json,hashlib,argparse
import numpy as np
from pathlib import Path
from PIL import Image,ImageDraw
from collections import deque
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from q_video_anchor import lock_lower_legs
ROOT=Path('output/video/chatgpt-dragon-v1');OUT=Path('assets/chatgpt-dragon/actions-v1')
STATES=['idle','thinking','working','input','approval','done','error','sleep']
def matte(image):
 rgb=np.asarray(image.convert('RGB')).astype(np.int16);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
 # No green occurs in this character's costume. Keep white hair and blue props.
 green=(g>55)&(g>r*1.25+12)&(g>b*1.25+12)
 rgba=np.empty((*rgb.shape[:2],4),dtype=np.uint8);rgba[:,:,:3]=rgb;rgba[:,:,3]=np.where(green,0,255)
 spill=g>np.maximum(r,b)+10;rgba[:,:,1]=np.where(spill,np.minimum(g,(r+b)//2+6),g)
 im=Image.fromarray(rgba).resize((168,168),Image.Resampling.LANCZOS)
 a=np.array(im);a[:,:,3]=np.where(a[:,:,3]>=190,255,0)
 # Remove compression specks, preserving the separate blue cloud companion.
 alpha=a[:,:,3];seen=np.zeros(alpha.shape,bool);h,w=alpha.shape
 for y,x in np.argwhere(alpha>0):
  if seen[y,x]:continue
  q=[(int(x),int(y))];seen[y,x]=True
  for px,py in q:
   for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
    if 0<=nx<w and 0<=ny<h and alpha[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;q.append((nx,ny))
  if len(q)<4:
   for px,py in q:a[py,px]=0
 a[a[:,:,3]==0]=0
 canvas=Image.new('RGBA',(192,192));canvas.paste(Image.fromarray(a),(12,12));return canvas
def main():
 global ROOT,OUT
 parser=argparse.ArgumentParser();parser.add_argument('--available',action='store_true');parser.add_argument('--asset',default='chatgpt-dragon');parser.add_argument('--video-root');parser.add_argument('--reference');args=parser.parse_args()
 ROOT=Path(args.video_root or ('output/video/'+args.asset+'-v1'));OUT=Path('assets')/args.asset/'actions-v1'
 reference=Path(args.reference or ('output/imagegen/chatgpt-chibi-original-v1/base.png' if args.asset=='chatgpt-dragon' else 'output/imagegen/'+args.asset+'/base.png'))
 states=[s for s in STATES if (ROOT/s/'video.mp4').exists()]
 if not args.available and states!=STATES:raise RuntimeError('All eight fresh videos are required before release')
 OUT.mkdir(parents=True,exist_ok=True);clips={};raw={};indices={};durations={}
 for state in states:
  with av.open(str(ROOT/state/'video.mp4')) as container:
   fps=float(container.streams.video[0].average_rate);frames=list(container.decode(video=0))
   picks=list(range(0,len(frames),2))
   if picks[-1]!=len(frames)-1:picks.append(len(frames)-1)
   raw[state]=[matte(lock_lower_legs(frames[i].to_image(),ROOT)) for i in picks];indices[state]=picks
   durations[state]=[round(((picks[i+1] if i+1<len(picks) else len(frames))-n)/fps*1000,4) for i,n in enumerate(picks)]
 # Build a shared palette from opaque colors sampled across every state.
 colors=np.concatenate([np.array(im)[:,:,:3][np.array(im)[:,:,3]>0][::8] for frames in raw.values() for im in frames[::6]])
 colors=colors[:len(colors)//256*256].reshape((-1,256,3)).astype(np.uint8)
 palette=Image.fromarray(colors).quantize(colors=64,method=Image.Quantize.MEDIANCUT)
 manifest={'schemaVersion':1,'character':args.asset,'tileSize':192,'columns':8,'fps':12,'palette':palette.getpalette()[:192],'clips':{}}
 report={};previews=[]
 for state,frames in raw.items():
  processed=[]
  for im in frames:
   quant=im.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');quant.putalpha(im.getchannel('A'))
   a=np.array(quant);a[a[:,:,3]==0]=0;processed.append(Image.fromarray(a))
  atlas=Image.new('RGBA',(192*8,192*8))
  for i,im in enumerate(processed):atlas.paste(im,(i%8*192,i//8*192))
  atlas.save(OUT/(state+'.png'),optimize=True)
  clip={'file':state+'.png','sourceFrames':len(processed),'frames':list(range(len(processed))),'durations':durations[state],'loop':state not in ['done','error']}
  if state=='sleep' or (args.asset in ['chatgpt-q-v2','gemini-q-v2'] and state in ['thinking','working','approval']):
   # Only the fully asleep, closed-eye breathing segment is reversible.
   # Walk it back gently instead of cutting between differently tilted heads.
   start=36;back=list(range(len(processed)-2,start,-1));clip['loopFrom']=start
   clip['frames']+=back;clip['durations']+= [durations[state][i] for i in back]
  manifest['clips'][state]=clip
  changes=len({hashlib.sha256(im.tobytes()).hexdigest() for im in processed})
  loop_start=clip.get('loopFrom',0)
  seam=float(np.abs(np.array(processed[clip['frames'][-1]]).astype(float)-np.array(processed[clip['frames'][loop_start]]).astype(float)).mean())
  boxes=[im.getbbox() for im in processed]
  report[state]={'frames':len(processed),'uniqueFrames':changes,'seamMeanRGBA':round(seam,3),'bounds':[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]}
  processed[0].save(OUT/(state+'-preview.png'))
  gif=[]
  for index in clip['frames']:
   im=processed[index]
   bg=Image.new('RGB',(192,192),'#242936');bg.paste(im,mask=im.getchannel('A'));gif.append(bg.resize((384,384),Image.Resampling.NEAREST))
  gif[0].save(ROOT/state/'pixel-preview.gif',save_all=True,append_images=gif[1:],duration=[max(20,round(d)) for d in clip['durations']],loop=0,disposal=2)
  previews.append(processed[36 if state=='sleep' else 24])
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 (OUT/'manifest.js').write_text('export default '+json.dumps(manifest,separators=(',',':'))+';\n',encoding='utf-8')
 provenance={'generator':'local ComfyUI MiniMax H3','visualInput':str(reference),'visualInputSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'designPrompt':str(reference.parent/('prompt.txt' if args.asset=='chatgpt-dragon' else 'first-version-prompt.json')),'reusedPreviousPetAssets':False,'lowerLegAnchor':args.asset in ['chatgpt-q-v2','gemini-q-v2'],'pipeline':['reference and first-version design prompt -> freshly generated chibi base','H3 image-to-video, eight independent actions','approved lower-leg stance anchoring for new Q v2 appearances','green-screen keying','one global 64-color palette, 192px sprites, binary alpha']}
 (OUT/'provenance.json').write_text(json.dumps(provenance,indent=2),encoding='utf-8');(ROOT/'quality.json').write_text(json.dumps(report,indent=2))
 sheet=Image.new('RGB',(384*4,412*2),'#242936');draw=ImageDraw.Draw(sheet)
 for i,(state,im) in enumerate(zip(states,previews)):
  up=im.resize((384,384),Image.Resampling.NEAREST);sheet.paste(up,(i%4*384,i//4*412+28),up);draw.text((i%4*384+12,i//4*412+8),state,fill='white')
 sheet.save(ROOT/'all-states.png');print(json.dumps(report),flush=True)
if __name__=='__main__':main()
