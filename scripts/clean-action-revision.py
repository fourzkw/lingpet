"""Project-local magenta matte cleanup on copied exports; keeps source outputs intact."""
import json,sys,shutil
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
source=Path(sys.argv[1]);out=Path(sys.argv[2]);shutil.copytree(source,out,dirs_exist_ok=True)
m=json.loads((out/'manifest.json').read_text())
key=np.array([250.,40.,158.]);checks=[]
for state,clip in m['clips'].items():
    path=out/clip['file'];im=Image.open(path).convert('RGBA');a=np.asarray(im).astype(np.float32);rgb=a[:,:,:3];old=a[:,:,3]/255
    # Estimate background mixture only from the two magenta opponent channels.
    excess=np.minimum((rgb[:,:,0]-rgb[:,:,1])/210,(rgb[:,:,2]-rgb[:,:,1])/118)
    alpha=np.minimum(old,1-np.clip(excess,0,1));alpha=np.where(alpha<.035,0,alpha)
    foreground=(rgb-key*(1-alpha[:,:,None]))/np.maximum(alpha[:,:,None],.035)
    a[:,:,:3]=np.clip(foreground,0,255);a[:,:,3]=alpha*255;a[alpha==0]=0
    clean=Image.fromarray(a.astype('uint8'),'RGBA');clean.save(path)
    size=m['tileSize'];cols=m['columns'];frames=[]
    for i in clip['frames']:
        x=i%cols*size;y=i//cols*size;frames.append(clean.crop((x,y,x+size,y+size)))
    # Palette GIF previews only; RGBA PNG sheets are the production asset.
    gifs=[]
    for f in frames:
        p=f.convert('RGB').quantize(colors=255);mask=f.getchannel('A').point(lambda v:255 if v<96 else 0);p.paste(255,mask=mask);p.info['transparency']=255;gifs.append(p)
    opts={'loop':0} if clip['loop'] else {}
    gifs[0].save(out/(state+'.gif'),save_all=True,append_images=gifs[1:],duration=clip['durations'],disposal=2,transparency=255,**opts)
    for j in [0,len(frames)//2,len(frames)-1]:
        board=Image.new('RGB',(size*2,size),'white');board.paste(Image.new('RGB',(size,size),'#20242b'),(size,0));board.paste(frames[j],(0,0),frames[j]);board.paste(frames[j],(size,0),frames[j]);checks.append((state,j,board))
w=768;h=408*len(checks);board=Image.new('RGB',(w,h),'#e5e7eb');d=ImageDraw.Draw(board)
for i,(state,j,im) in enumerate(checks):im.thumbnail((768,384));board.paste(im,(0,i*408));d.text((8,i*408+384),f'{state} playback frame {j}',fill='black')
board.save(out/'matte-review.png')
prov=json.loads((out/'provenance.json').read_text());prov['edgeCleanup']={'method':'magenta opponent-channel alpha estimate and background unmix','keyColor':key.tolist(),'sourceSheetsPreserved':True};(out/'provenance.json').write_text(json.dumps(prov,indent=2))
print(out)
