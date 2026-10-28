"""Register DeepSeek pose sheets by face scale and seated foot baseline."""
from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/deepseek/actions-v1'
STATES=('idle','thinking','working','input','approval','done','error','sleep')
MARGIN=22

def landmarks(cell,state):
    data=np.array(cell)
    rgb=data[:,:,:3].astype(np.int16)
    alpha=data[:,:,3]>=160
    ys,xs=np.where(alpha)
    bounds=(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)
    # Warm skin excludes blue hair/eyes, neutral-white costume and gold shield.
    skin=alpha & (rgb[:,:,0]>170) & (rgb[:,:,1]>140) & (rgb[:,:,2]>110)
    skin &= (rgb[:,:,0]>rgb[:,:,1]+10) & (rgb[:,:,1]>rgb[:,:,2]+5)
    skin[int(bounds[1]+(bounds[3]-bounds[1])*.72):,:]=False
    candidates=[]
    for y in range(cell.height):
        row=np.flatnonzero(skin[y])
        if len(row)>8:
            left,right=np.quantile(row,[.05,.95]);candidates.append((right-left,left,right,y))
    assert candidates, f'Cannot locate {state} face'
    width,left,right,y=max(candidates)
    center=(left+right)/2
    foot=bounds[3]
    if state!='working':
        white=alpha & (rgb.min(axis=2)>175) & ((rgb.max(axis=2)-rgb.min(axis=2))<45)
        white[:int(bounds[1]+(bounds[3]-bounds[1])*.68),:]=False
        columns=np.arange(cell.width)
        white[:,abs(columns-center)>width*.8]=False
        foot_rows=np.flatnonzero(white.sum(axis=1)>=3)
        if len(foot_rows):foot=int(foot_rows[-1])+1
    cap=alpha & (rgb.min(axis=2)>175) & ((rgb.max(axis=2)-rgb.min(axis=2))<60)
    cap[int(bounds[1]+(bounds[3]-bounds[1])*.43):,:]=False
    cap_y,cap_x=np.where(cap)
    assert len(cap_x)>20,f'Cannot locate {state} headband'
    cap_left,cap_right=np.quantile(cap_x,[.02,.98])
    return {'bounds':bounds,'faceWidth':float(width),'headbandWidth':float(cap_right-cap_left),
            'center':float((cap_left+cap_right)/2),'foot':foot}

def cleanup(sprite,left,right):
    data=np.array(sprite)
    rgb=data[:,:,:3].astype(np.int16)
    opaque=data[:,:,3]>=128
    seen=set();components=[]
    for y,x in zip(*np.where(opaque)):
        x,y=int(x),int(y)
        if (x,y) in seen:continue
        queue=deque([(x,y)]);seen.add((x,y));component=[]
        while queue:
            px,py=queue.popleft();component.append((px,py))
            for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                if 0<=nx<128 and 0<=ny<128 and opaque[ny,nx] and (nx,ny) not in seen:
                    seen.add((nx,ny));queue.append((nx,ny))
        components.append(component)
    largest=max(components,key=len)
    keep=np.zeros((128,128),dtype=bool)
    for component in components:
        cx=sum(p[0] for p in component)/len(component)
        if component is largest or (len(component)>=max(6,len(largest)*.004) and left<=cx<=right):
            for x,y in component:keep[y,x]=True
    result=np.zeros_like(data)
    result[:,:,:3]=np.minimum(255,np.rint(rgb/8)*8).astype(np.uint8)
    result[~keep]=0;result[:,:,3]=np.where(keep,255,0)
    return Image.fromarray(result)

prepared={}
global_scale=1.0
for state in STATES:
    source=Image.open(OUT/f'raw/{state}.png').convert('RGBA')
    cw,ch=source.width//4,source.height//2
    cells=[source.crop((i%4*cw-MARGIN,i//4*ch,(i%4+1)*cw+MARGIN,(i//4+1)*ch)) for i in range(8)]
    points=[landmarks(cell,state) for cell in cells]
    # The white headband is stable under eye/cheek changes, unlike visible skin.
    camera=68/points[0]['headbandWidth']
    for i,point in enumerate(points):
        l,t,r,b=point['bounds'];center=point['center'];foot=point['foot']
        lift=(0,0,4,10,14,7,0,0)[i] if state=='done' else 0
        global_scale=min(global_scale,58/max(1,(center-l)*camera),58/max(1,(r-center)*camera),
                         (108-lift)/max(1,(foot-t)*camera),8/max(1,(b-foot)*camera))
    prepared[state]=(cells,points,camera,cw)

frames=[];registration=[]
for state in STATES:
    cells,points,camera,cw=prepared[state]
    scale=camera*global_scale
    action=[]
    for i,(cell,point) in enumerate(zip(cells,points)):
        lift=(0,0,4,10,14,7,0,0)[i] if state=='done' else 0
        pos=(round(64-point['center']*scale),round(116-lift-point['foot']*scale))
        resized=cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.LANCZOS)
        sprite=Image.new('RGBA',(128,128));sprite.paste(resized,pos)
        sprite=cleanup(sprite,pos[0]+MARGIN*scale,pos[0]+(cw+MARGIN)*scale)
        action.append(sprite)
        registration.append({'state':state,'frame':i,'cameraScale':scale,'faceWidth':point['faceWidth'],'headbandWidth':point['headbandWidth'],
                             'ground':116,'lift':lift,'offset':pos})
    if state=='working':
        # Head/hair/torso are held steady; both mittens only move at the keys.
        top=action[0].crop((0,0,128,80))
        for sprite in action:sprite.paste(top,(0,0))
        assert len({sprite.crop((0,0,128,80)).tobytes() for sprite in action})==1
        assert len({sprite.crop((0,80,128,128)).tobytes() for sprite in action})>=4
    if state in ('idle','input','done'):action[-1]=action[0].copy()
    frames.extend(action)

atlas=Image.new('RGBA',(1024,1024))
preview=Image.new('RGB',(1536,1536),'#191f2a')
for i,sprite in enumerate(frames):
    bounds=sprite.getbbox()
    assert bounds and 0<bounds[0]<bounds[2]<128 and 0<bounds[1]<bounds[3]<128,(STATES[i//8],i%8,bounds)
    assert len(sprite.getchannel('A').getcolors())==2
    atlas.paste(sprite,(i%8*128,i//8*128))
    big=sprite.resize((192,192),Image.Resampling.NEAREST)
    preview.paste(big,(i%8*192,i//8*192),big)
atlas.save(OUT/'atlas.png');preview.save(OUT/'contact-sheet.png')
(OUT/'registration.json').write_text(json.dumps({'states':STATES,'globalScale':global_scale,
    'typingHandsMinY':80,'totalFrames':64,'frames':registration},indent=2),encoding='utf-8')
print(f'Packed 64 DeepSeek poses with one registered camera scale per action: {OUT/"atlas.png"}')
