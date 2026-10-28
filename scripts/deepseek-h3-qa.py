"""Inspect actual generated videos / processed sheets, without generating art."""
import av,json,math,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
root=Path('output/video/deepseek-h3-v1');states=['idle','thinking','working','input','approval','done','error','sleep']
report={};contact=Image.new('RGB',(384*4,408*8),(35,40,50));draw=ImageDraw.Draw(contact)
for row,state in enumerate(states):
 file=root/state/'video.mp4'
 if not file.exists():continue
 with av.open(str(file)) as video:frames=list(video.decode(video=0));fps=float(video.streams.video[0].average_rate)
 assert len(frames)==124,(state,len(frames))
 picks=[0,40,80,123]
 for col,i in enumerate(picks):
  contact.paste(frames[i].to_image(),(col*384,row*408+24));draw.text((col*384+8,row*408+6),f'{state} / {i}',fill='white')
 changed=len({hashlib.sha256(f.to_ndarray(format='rgb24').tobytes()).hexdigest() for f in frames})
 bounds=[]
 for f in frames:
  a=f.to_ndarray(format='rgb24').astype(float);key=np.array([0,170,0]);mask=np.sqrt(np.mean((a-key)**2,axis=2))>70;y,x=np.where(mask)
  if len(x):bounds.append([int(x.min()),int(y.min()),int(x.max()),int(y.max())])
 b=np.array(bounds);report[state]={'frames':len(frames),'fps':fps,'uniqueFrames':changed,'boundsMin':b[:,:2].min(0).tolist(),'boundsMax':b[:,2:].max(0).tolist(),'footBaselineRange':[int(b[:,3].min()),int(b[:,3].max())]}
contact.save(root/'contact-all.png');contact.crop((0,0,1536,1632)).save(root/'contact-top.png');contact.crop((0,1632,1536,3264)).save(root/'contact-bottom.png');(root/'video-quality.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
