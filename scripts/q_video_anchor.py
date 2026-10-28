"""Keep the approved lower-leg stance while retaining generated upper-body motion."""
from functools import lru_cache
from pathlib import Path
from PIL import Image,ImageFilter
import numpy as np

@lru_cache(maxsize=4)
def anchor(root):
 image=np.asarray(Image.open(Path(root)/'reference-green.png').convert('RGB').resize((384,384),Image.Resampling.LANCZOS)).astype(np.float32)
 yy,xx=np.mgrid[:384,:384];top=258 if Path(root).name.startswith('chatgpt') else 254
 weight=np.clip((yy-top)/10,0,1)*np.clip((xx-136)/6,0,1)*np.clip((248-xx)/6,0,1)
 weight*=yy<352
 return image,weight

def lock_lower_legs(image,root):
 if Path(root).name not in ['chatgpt-q-v2','gemini-q-v2']:return image
 reference,weight=anchor(str(root));rgb=np.asarray(image.convert('RGB')).astype(np.float32);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
 # Keep a gold approval shield in front of the body, including its dark outline.
 # Limit this allowance above the shoes so gold boot stars cannot move the feet.
 gold=(r>85)&(g>45)&(r>b*1.35)&(g>b*1.1);gold[302:]=False
 prop=np.asarray(Image.fromarray((gold*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)))>0
 blend=(weight*(~prop))[:,:,None]
 return Image.fromarray(np.clip(rgb*(1-blend)+reference*blend,0,255).astype(np.uint8))
