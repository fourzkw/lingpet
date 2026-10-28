"""Prepare/submit one local ComfyUI H3 desktop-pet sample; no cloud API nodes."""
import argparse,json,pathlib,urllib.request,urllib.error,uuid,struct
BASE='http://127.0.0.1:8188'
OUT=pathlib.Path('output/video/chatgpt-idle-h3');OUT.mkdir(parents=True,exist_ok=True)
def get(route):
 with urllib.request.urlopen(BASE+route,timeout=20) as r:return json.load(r)
def post(route,payload):
 raw=json.dumps(payload).encode();req=urllib.request.Request(BASE+route,data=raw,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  error=e.read().decode();(OUT/'request-error.json').write_text(error,encoding='utf-8');raise RuntimeError(error)
def upload(image):
 image=pathlib.Path(image);boundary='pet-'+uuid.uuid4().hex;pixels=image.read_bytes()
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="board_pet_chatgpt_reference.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+pixels+f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\nfalse\r\n--{boundary}--\r\n'.encode())
 req=urllib.request.Request(BASE+'/upload/image',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary})
 with urllib.request.urlopen(req,timeout=20) as r:result=json.load(r)
 result['source_width'],result['source_height']=struct.unpack('>II',pixels[16:24]);(OUT/'uploaded-reference.json').write_text(json.dumps(result,indent=2),encoding='utf-8');return result['name']
def node(kind,**inputs):return {'class_type':kind,'inputs':inputs}
def graph(image,preflight=False):
 prompt=('Locked static front-facing camera. A single seated chibi white-haired dragon girl, exactly matching the reference image. '+
 'Keep her two ivory horns, lavender eyes, small dragon wings, long white hair, white modest dress, one curled dragon tail and all proportions unchanged. '+
 'A calm idle animation: gentle natural breathing, a tiny relaxed head movement, hair tips softly swaying, a small slow tail-tip swish, one quick natural simultaneous blink in the middle. '+
 'Both feet remain planted in exactly the same location. Her mouth stays softly neutral. No speaking. Return smoothly to the exact starting pose at the end. '+
 'The entire character stays fully inside the frame. The background remains a completely flat solid green chroma-key color throughout, with even lighting. '+
 'Preserve the pixel-art chibi illustration style, crisp silhouette, consistent face and costume. No camera pan, zoom, cut, scene change, extra objects or extra characters. Silent desktop companion animation.')
 if args.smooth:prompt=prompt.replace('pixel-art chibi illustration style','clean high-detail non-pixel 2D chibi illustration style')
 meta=json.loads((OUT/'uploaded-reference.json').read_text())
 g={
 '4':node('LoadImage',image=image),
 '5':node('EmptyImage',width=meta.get('source_width',128),height=meta.get('source_height',128),batch_size=1,color=0x00AA00),
 '6':node('InvertMask',mask=['4',1]),
 '7':node('ImageCompositeMasked',destination=['5',0],source=['4',0],x=0,y=0,resize_source=False,mask=['6',0]),
 '8':node('ImageScale',image=['7',0],upscale_method='lanczos' if args.smooth else 'nearest-exact',width=args.size,height=args.size,crop='disabled'),
 }
 if preflight:g['16']=node('CreateVideo',images=['8',0],fps=24,codec='h264',color_space='sRGB',bit_depth=8)
 else:
  g.update({
  '1':node('UNETLoader',unet_name='minimax_h3_fl2va_pruned_int8_convrot.safetensors',weight_dtype='default'),
  '2':node('CLIPLoader',clip_name='qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type='minimax',device='default'),
  '3':node('VAELoader',vae_name='minimax_h3_video_vae_fp16.safetensors'),
  '9':node('MiniMaxH3ImageToVideo',clip=['2',0],vae=['3',0],prompt=prompt,width=args.size,height=args.size,length=124,first_frame=['8',0],last_frame=['8',0]),
  '10':node('BasicGuider',model=['1',0],conditioning=['9',0]),
  '11':node('RandomNoise',noise_seed=2026102401),
  '12':node('KSamplerSelect',sampler_name='res_multistep'),
  '13':node('BasicScheduler',model=['1',0],scheduler='simple',steps=20,denoise=1.0),
  '14':node('SamplerCustomAdvanced',noise=['11',0],guider=['10',0],sampler=['12',0],sigmas=['13',0],latent_image=['9',1]),
  '15':node('VAEDecodeTiled',samples=['14',0],vae=['3',0],tile_size=256,overlap=32,temporal_size=16,temporal_overlap=4),
  '16':node('CreateVideo',images=['15',0],fps=24,codec='h264',color_space='sRGB',bit_depth=8),
  })
 g['17']=node('SaveVideo',video=['16',0],filename_prefix='board_pet/chatgpt_idle_h3_'+args.prefix+('_preflight' if preflight else ''),format='auto',codec='auto')
 return g
parser=argparse.ArgumentParser();parser.add_argument('--preflight',action='store_true');parser.add_argument('--submit',action='store_true');parser.add_argument('--reference',default='artifacts/multi-pet-smoke/chatgpt.png');parser.add_argument('--out',default=str(OUT));parser.add_argument('--size',type=int,default=384);parser.add_argument('--prefix',default='v1');parser.add_argument('--smooth',action='store_true');args=parser.parse_args();OUT=pathlib.Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
queue=get('/queue')
if queue['queue_running'] or queue['queue_pending']:raise RuntimeError('ComfyUI has existing work; do not insert another task.')
image=upload(args.reference) if args.preflight else json.loads((OUT/'uploaded-reference.json').read_text())['name']
g=graph(image,args.preflight);name='preflight' if args.preflight else 'api-workflow';(OUT/(name+'.json')).write_text(json.dumps(g,ensure_ascii=False,indent=2),encoding='utf-8')
if args.submit:
 result=post('/prompt',{'prompt':g,'client_id':'board-pet-'+uuid.uuid4().hex});(OUT/(name+'-submission.json')).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
else:print('Workflow saved: '+str(OUT/(name+'.json')))
