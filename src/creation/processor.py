"""Portable, project-scoped video -> RGBA / shared-palette sprite sheets.
Requires Pillow, numpy and PyAV in the configured Python. No model downloads.
"""
import hashlib,json,math,os,sys,traceback
from pathlib import Path
import av
import numpy as np
from PIL import Image, ImageFilter

def chroma_matte(image, spec):
    if spec['background']=='preserve': return image
    data=np.asarray(image).astype(np.float32).copy()
    key=np.array(spec['keyColor'],dtype=np.float32)
    distance=np.sqrt(np.mean((data[:,:,:3]-key)**2,axis=2))
    alpha=np.clip((distance-spec['threshold'])/max(1,spec['feather']),0,1)
    if spec.get('despill') and key.max()-key.min()>32:
        # Restrict decontamination to the keyed silhouette. A global channel
        # clamp destroys real skin/gold, and argmax cannot represent magenta.
        border=np.asarray(Image.fromarray(np.uint8((alpha<1)*255)).filter(ImageFilter.MaxFilter(9)))>0
        high=key>=(key.max()-32); low=key<=(key.min()+32)
        rgb=data[:,:,:3]
        excess=np.maximum(0,rgb[:,:,high].min(axis=2)-rgb[:,:,low].max(axis=2)-spec['spillTolerance'])
        spill=np.where(border,np.clip(excess/(key.max()-key.min()),0,0.98),0)
        rgb[:]=np.clip((rgb-spill[:,:,None]*key)/np.maximum(0.02,1-spill[:,:,None]),0,255)
        alpha*=1-spill
    data[:,:,3]*=alpha
    data[data[:,:,3]<4]=0
    return Image.fromarray(np.uint8(np.clip(data,0,255)),'RGBA')

def write(file,value):
    temp=file.with_suffix('.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(temp,file)

def main(spec):
    root=Path(spec['root']); bundle=root/'bundle'; bundle.mkdir(exist_ok=True)
    variants=spec['variants']; original_size=spec['originalSize']; pixel_size=spec['pixelSize']
    fps=spec['fps']; columns=8; clips={}; frames_by_state={}; palette_samples=[]; project_size=None
    def check():
        if (root/'cancel').exists(): raise InterruptedError('用户已取消后处理')
    def matte(image):
        return chroma_matte(image,spec)
    groups=spec['clips']; flattened={}
    for state,group in groups.items():
        candidates=[group]+group.get('alternatives',[])
        if len(candidates)>8:raise ValueError('每个状态最多8套动作')
        looping=group.get('loop',state not in ['done','error'])
        for index,candidate in enumerate(candidates):
            if candidate.get('loop',looping)!=looping:raise ValueError('同一状态候选的loop必须一致')
            name=state+('-'+str(index) if index else '')
            flattened[name]={**candidate,'loop':looping}
    spec={**spec,'clips':flattened}
    for state,rule in spec['clips'].items():
        check(); source=Path(rule['path'])
        if hashlib.sha256(source.read_bytes()).hexdigest()!=rule['sha256']: raise ValueError('视频输入哈希改变: '+state)
        target=root/state;target.mkdir(exist_ok=True); paths=[]; timestamps=[]; next_sample=0; last=None; last_time=0; origin=None; previous_size=None; frame_index=0
        with av.open(str(source)) as container:
            stream=container.streams.video[0]; fallback=float(stream.average_rate or 24)
            for frame in container.decode(stream):
                check(); t=float(frame.time) if frame.time is not None else frame_index/fallback;frame_index+=1
                if origin is None:origin=t
                t=max(0,t-origin)
                last=frame.to_image().convert('RGBA');last_time=t
                if previous_size is None:previous_size=last.size
                if project_size is None:project_size=last.size
                if last.size!=project_size:raise ValueError('不同动作视频必须使用同一画幅尺寸')
                if last.size!=previous_size:raise ValueError('视频中途改变尺寸')
                # Match fixed target times to the nearest source frame. H3's
                # container rate is slightly below 24; advancing from each
                # actual frame would drift and skip every third source frame.
                if t+0.5/fallback<next_sample:continue
                if len(paths)>=127:raise ValueError('采样超过128帧，请降低fps或缩短视频')
                file=target/(str(len(paths))+'.png');matte(last).save(file);paths.append(file);timestamps.append(t);next_sample+=1/fps
            if last is None:raise ValueError('视频不可解码: '+state)
            if last_time-timestamps[-1]>0.00001:
                file=target/(str(len(paths))+'.png');matte(last).save(file);paths.append(file);timestamps.append(last_time)
        durations=[max(1,round((timestamps[i+1]-t)*1000)) for i,t in enumerate(timestamps[:-1])]+[max(1,round(1000/fallback))]
        count=len(paths);start_frame=rule.get('startFrame',0)
        if start_frame>=count:raise ValueError('startFrame 超出采样帧数: '+state)
        indices=list(range(start_frame,count));loop_from=rule.get('loopFrom',0)
        if loop_from>=len(indices):raise ValueError('loopFrom 超出播放序列: '+state)
        if rule.get('pingPong') and len(indices)-loop_from>2:indices+=list(range(count-2,start_frame+loop_from,-1))
        clips[state]={'file':state+'.png','sourceFrames':count,'frames':indices,'durations':[durations[i] for i in indices],'loop':rule.get('loop',state.split('-')[0] not in ['done','error','click','pet']),'loopFrom':loop_from}
        frames_by_state[state]=paths
        for file in paths[::max(1,count//8)]:
            im=Image.open(file).convert('RGBA');im.thumbnail((64,64));bg=Image.new('RGB',(64,64));bg.paste(im,(0,0),im.getchannel('A'));palette_samples.append(bg)
    check()
    palette_board=Image.new('RGB',(64*8,64*math.ceil(len(palette_samples)/8)))
    for i,im in enumerate(palette_samples):palette_board.paste(im,((i%8)*64,(i//8)*64))
    # Reserve part of the shared palette for saturated accents. Area-only
    # quantization can erase small gold props and confetti on pale characters.
    palette=palette_board.quantize(colors=spec['colors'],method=Image.Quantize.MEDIANCUT)
    samples=np.array(palette_board).reshape(-1,3).astype(np.int16)
    accents=samples[(samples.max(axis=1)-samples.min(axis=1)>70)&(samples.max(axis=1)>130)]
    if len(accents):
        accent_count=max(1,spec['colors']//4);base_count=spec['colors']-accent_count
        base=palette_board.quantize(colors=base_count,method=Image.Quantize.MEDIANCUT)
        accent_image=Image.fromarray(np.uint8(accents).reshape(1,-1,3),'RGB')
        accent_palette=accent_image.quantize(colors=accent_count,method=Image.Quantize.MEDIANCUT)
        entries=base.getpalette()[:base_count*3]+accent_palette.getpalette()[:accent_count*3]
        palette.putpalette(entries+[0]*(768-len(entries)))
    previews=[]
    for state,paths in frames_by_state.items():
        preview_tiles={};preview_variant='original' if 'original' in variants else 'pixel'
        for variant in variants:
            check();size=pixel_size if variant=='pixel' else original_size
            directory=bundle/('original' if variant=='original' and 'pixel' in variants else '');directory.mkdir(exist_ok=True)
            sheet=Image.new('RGBA',(size*columns,size*math.ceil(len(paths)/columns)))
            for i,file in enumerate(paths):
                # Padding is measured on the pixel grid; scale it for originals
                # so changing display variant never changes character framing.
                padding=round(spec['padding']*size/pixel_size)
                check();im=Image.open(file).convert('RGBA');im.thumbnail((size-2*padding,size-2*padding),Image.Resampling.LANCZOS)
                if spec.get('despill') and spec['background']=='chroma':
                    # Pillow resamples RGBA with premultiplied alpha. Only
                    # discard invisible pixels; never clamp opaque RGB here.
                    clean=np.array(im)
                    clean[clean[:,:,3]<4]=0;im=Image.fromarray(clean,'RGBA')
                if variant=='pixel':
                    alpha=im.getchannel('A').point(lambda a:255 if a>=spec['alphaThreshold'] else 0)
                    im=im.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');im.putalpha(alpha)
                tile=Image.new('RGBA',(size,size));tile.paste(im,((size-im.width)//2,(size-im.height)//2))
                sheet.paste(tile,((i%columns)*size,(i//columns)*size))
                if variant==preview_variant:preview_tiles[i]=tile
            sheet.save(directory/(state+'.png'))
        # Shared-clock preview on a neutral backdrop; retain full RGBA sheets for light/dark inspection.
        gif_frames=[]
        for i in clips[state]['frames']:
            check();im=preview_tiles[i].copy();im.thumbnail((256,256),Image.Resampling.LANCZOS);bg=Image.new('RGB',(256,256),(38,42,50));bg.paste(im,((256-im.width)//2,(256-im.height)//2),im.getchannel('A'));gif_frames.append(bg)
        gif_frames[0].save(root/(state+'.gif'),save_all=True,append_images=gif_frames[1:],duration=clips[state]['durations'],loop=0 if clips[state]['loop'] else 1)
        previews.append(state+'.gif')
    grouped={}
    for state,group in groups.items():
        grouped[state]=clips[state]
        alternatives=[clips[state+'-'+str(i)] for i in range(1,len(group.get('alternatives',[]))+1)]
        if alternatives:
            grouped[state]['alternatives']=alternatives
            grouped[state]['selection']=group.get('selection','random')
    clips=grouped
    manifest={'schemaVersion':1,'character':'custom:'+spec['id'],'variants':variants,'tileSize':pixel_size if 'pixel' in variants else original_size,'columns':columns,'clips':clips}
    if 'original' in variants:manifest['original']={'tileSize':original_size,'directory':'original/' if 'pixel' in variants else ''}
    write(bundle/'manifest.json',manifest)
    (bundle/'manifest.js').write_text('export default '+json.dumps(manifest,ensure_ascii=False)+';\n',encoding='utf-8')
    write(bundle/'provenance.json',{'projectId':spec['projectId'],'baseId':spec['baseId'],'processing':{k:v for k,v in spec.items() if k not in ['root','clips']},'inputs':{k:{'sha256':v['sha256'],'assetId':v['assetId']} for k,v in spec['clips'].items()}})
    write(root/'result.json',{'status':'completed','previews':previews})

if __name__=='__main__':
    spec=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));root=Path(spec['root'])
    try:main(spec)
    except InterruptedError as e:write(root/'result.json',{'status':'cancelled','error':str(e)})
    except Exception:write(root/'result.json',{'status':'failed','error':traceback.format_exc()[-6000:]})
