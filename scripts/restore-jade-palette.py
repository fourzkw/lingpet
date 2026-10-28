"""Restore this jade character's neutral palette; retain frame timing/alpha."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
import json,hashlib

root=Path(__file__).resolve().parents[1]/'output/community-interactions'
source=root/'color-corrected/bundle';out=root/'palette-corrected/bundle'
(out/'original').mkdir(parents=True,exist_ok=True)
reference=root/'extended-appearance/original/sprites/idle.png'
manifest=json.loads((source/'manifest.json').read_text())
manifest['variants']=['original'];manifest['tileSize']=384
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'referenceSha256':digest(reference),'method':'Jade neutral palette: subtract positive min(R,B)-G; preserve Rec.709 luminance; fixed transform across all frames','clips':{}}
board=Image.new('RGB',(1536,1660),'#eee8dd');draw=ImageDraw.Draw(board)
for col,label in enumerate(['Original idle','Previous interaction','Corrected / light','Corrected / dark']):
    draw.text((col*384+8,8),label,fill='black')
for kind,state in [('click','idle'),('pet','done')]:
    file=source/'original'/manifest['clips'][state]['file']
    im=Image.open(file).convert('RGBA');old=np.asarray(im);data=old.astype(np.float32);rgb=data[:,:,:3]
    excess=np.maximum(np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1],0)
    rgb[:,:,0]-=excess;rgb[:,:,2]-=excess;rgb+=excess[:,:,None]*0.2848
    corrected=np.uint8(np.clip(np.rint(data),0,255));corrected[corrected[:,:,3]==0,:3]=0
    assert np.array_equal(corrected[:,:,3],old[:,:,3])
    opaque=old[:,:,3]>250
    residual=np.minimum(corrected[:,:,0].astype(int),corrected[:,:,2].astype(int))-corrected[:,:,1].astype(int)
    assert residual[opaque].max()<=1
    Image.fromarray(corrected,'RGBA').save(out/'original'/manifest['clips'][state]['file'])
    report['clips'][kind]={'sourceSha256':digest(file),'sha256':digest(out/'original'/manifest['clips'][state]['file']),'positiveMagentaPixelsBefore':int(((excess>3)&opaque).sum()),'positiveMagentaPixelsAfter':int(((residual>3)&opaque).sum()),'alphaUnchanged':True}
    n=manifest['clips'][state]['sourceFrames']
    for j,frame in enumerate([0,n//2]):
        row=(0 if kind=='click' else 2)+j;y=36+row*406
        box=((frame%8)*384,(frame//8)*384,(frame%8+1)*384,(frame//8+1)*384)
        for col,frameim in enumerate([Image.open(reference).crop((0,0,384,384)),im.crop(box),Image.fromarray(corrected).crop(box),Image.fromarray(corrected).crop(box)]):
            bg=Image.new('RGB',(384,384),'#202733' if col==3 else '#faf6eb')
            bg.paste(frameim,(0,0),frameim.getchannel('A'));board.paste(bg,(col*384,y))
            draw.text((col*384+8,y+385),kind+' / frame '+str(frame),fill='black')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
(out/'manifest.js').write_text('export default '+json.dumps(manifest)+';\n')
provenance=json.loads((source/'provenance.json').read_text());provenance['paletteRestoration']=report
(out/'provenance.json').write_text(json.dumps(provenance,indent=2))
(root/'palette-restoration-report.json').write_text(json.dumps(report,indent=2))
board.save(root/'palette-restoration-review.jpg',quality=95)
print(json.dumps(report))
