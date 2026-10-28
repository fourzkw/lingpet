from PIL import Image
from collections import deque
from pathlib import Path
import numpy as np,json,hashlib
out=Path('output/video/chatgpt-original-v1');source=out/'source.png';im=Image.open(source).convert('RGB');rgb=np.asarray(im).astype(np.int16);h,w=rgb.shape[:2]
# Remove only neutral white connected to the outside. Interior whites in the
# dress, hair and horns are protected by the original linework.
white=(rgb.min(axis=2)>=224)&((rgb.max(axis=2)-rgb.min(axis=2))<=24)
seen=np.zeros((h,w),bool);q=deque()
for x in range(w):
 for y in (0,h-1):
  if white[y,x] and not seen[y,x]:seen[y,x]=True;q.append((x,y))
for y in range(h):
 for x in (0,w-1):
  if white[y,x] and not seen[y,x]:seen[y,x]=True;q.append((x,y))
while q:
 x,y=q.popleft()
 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
  if 0<=nx<w and 0<=ny<h and white[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;q.append((nx,ny))
rgba=np.concatenate([rgb.astype(np.uint8),np.where(seen,0,255).astype(np.uint8)[:,:,None]],axis=2);cut=Image.fromarray(rgba)
canvas=Image.new('RGBA',(576,1024));cut.thumbnail((528,928),Image.Resampling.LANCZOS);canvas.alpha_composite(cut,((576-cut.width)//2,1000-cut.height));canvas.save(out/'reference-transparent.png')
green=Image.new('RGB',canvas.size,(0,170,0));green.paste(canvas,mask=canvas.getchannel('A'));green.save(out/'reference-green.png')
metadata={'source':'source.png','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'identityReferences':['source.png'],'reusePreviousCharacterAssets':False,'preparation':'border-connected neutral-white matte only; original proportions, clothing, wings, tail and companion preserved','sourceSize':[w,h],'referenceSize':list(canvas.size)}
(out/'provenance.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8');print(json.dumps(metadata))
