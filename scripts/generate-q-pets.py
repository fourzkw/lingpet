"""Generate new standing GPT/Gemini Q pets with local ComfyUI H3."""
import argparse,copy,hashlib,json,time,urllib.request,urllib.parse,uuid
from pathlib import Path
from PIL import Image
BASE='http://127.0.0.1:8188'
STATES=['idle','thinking','working','input','approval','done','error','sleep']
IDENTITIES={
 'chatgpt-q-v2':'White-haired dragon girl: long pale lavender-white hair, ivory ridged horns, lavender eyes, pointed elf ears, modest white dress with lilac trim and knot ornaments, two small lavender wings, ONE pale scaled dragon tail. No cloud companion.',
 'gemini-q-v2':'Cat girl: blue-violet-magenta long hair, two blue-purple cat ears with pink inner ears, asymmetric ruby-pink and GOLD eyes, four-point rainbow star ornament, modest navy-purple dress with white ruffles and gold stars, ONE fluffy blue-purple cat tail. NO horns, NO wings.'
}
ACTIONS={
 'idle':'Calm natural breathing, hair tips and tail gently sway. ONE quick simultaneous blink that closes then promptly reopens both eyes. Hands and feet stay at the starting positions. Return smoothly to the exact initial pose.',
 'thinking':'One little hand moves up to rest under chin. A small thoughtful head tilt and curious eye movement. Hold the chin-resting pose with subtle breathing. End still thoughtfully holding chin.',
 'working':'A small floating keyboard appears at WAIST height. Both hands move to the keys and alternate light tapping, arms and fingers moving naturally. Head, torso, legs and feet steady, no waving. End still typing on keyboard.',
 'input':'One hand lifts beside her cheek and gives two small friendly waves, a gentle smile, then lowers back to the exact initial pose. Feet stay planted.',
 'approval':'Both hands lift a SMALL gold shield with a dark KEYHOLE motif in front of her body below face level. Calm patient expression, one natural blink. End holding the shield in a steady waiting pose.',
 'done':'Happy smile, little hands rise beside her face in a graceful celebratory flourish, hair and tail respond gently, then return to the initial pose. No jump, feet stay planted.',
 'error':'Brief mild surprise, small hands move towards cheeks, a tiny shoulder movement, then hands lower and she relaxes back to the exact initial pose. Feet stay planted.',
 'sleep':'Slowly close both eyes and relax arms, head tilts a little in a drowsy standing rest. Remain safely balanced on both feet, do not crouch or collapse. End with eyes fully closed and gentle slow breathing, never wake up.'
}
def get(route):
 with urllib.request.urlopen(BASE+route,timeout=40) as r:return json.load(r)
def ensure_queue_empty():
 q=get('/queue')
 if q['queue_running'] or q['queue_pending']:raise RuntimeError('ComfyUI has other active work; no new task submitted.')
def upload(path):
 boundary='q-pet-'+uuid.uuid4().hex
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="fresh_standing_q_pet.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+path.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
 req=urllib.request.Request(BASE+'/upload/image',body,{'Content-Type':'multipart/form-data; boundary='+boundary})
 with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)['name']
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--characters',nargs='+',choices=list(IDENTITIES),default=list(IDENTITIES));parser.add_argument('--states',nargs='+',choices=STATES,default=STATES);args=parser.parse_args()
 for character in args.characters:
  root=Path('output/video')/character;root.mkdir(parents=True,exist_ok=True)
  source=Path('output/imagegen')/character/'base.png';digest=hashlib.sha256(source.read_bytes()).hexdigest()
  previous=root/'reference-provenance.json'
  if previous.exists() and json.loads(previous.read_text())['sha256']!=digest:raise RuntimeError('Reference changed: use a fresh output revision to avoid mixing character identities')
  ensure_queue_empty();image=Image.open(source).convert('RGBA');image=image.crop(image.getbbox());image.thumbnail((624,624),Image.Resampling.LANCZOS)
  ref=Image.new('RGB',(768,768),(0,170,0));ref.paste(image,((768-image.width)//2,680-image.height),image.getchannel('A'));ref.save(root/'reference-green.png')
  previous.write_text(json.dumps({'image':str(source),'sha256':digest,'pose':'natural standing; parallel or slightly outward feet; no pigeon toes'},indent=2));uploaded=upload(root/'reference-green.png')
  template=json.loads(Path('output/video/chatgpt-idle-h3/api-workflow.json').read_text())
  for state in args.states:
   out=root/state;out.mkdir(exist_ok=True)
   if (out/'video.mp4').exists():print(character+' '+state+' already complete',flush=True);continue
   ensure_queue_empty();g=copy.deepcopy(template)
   for key in ['5','6','7']:g.pop(key,None)
   g['4']['inputs']['image']=uploaded;g['8']['inputs'].update(image=['4',0],upscale_method='lanczos',width=384,height=384)
   prompt=('The EXACT naturally STANDING Q-version chibi in the reference. Big head and short body, preserve her exact face, costume and proportions. '+IDENTITIES[character]+' '+ACTIONS[state]+' Keep TWO complete short legs with visible calves, narrow ankles and small correctly attached shoes. Knees and toes face the SAME forward direction, feet parallel or gently outward, toes never point toward each other. NO pigeon toes, inward-rotated knees, crossed ankles, fused limbs, giant shoe soles or missing shins. Feet stay on the same fixed baseline. Camera fixed, full body including horns/ears/hair/tail/shoes always inside generous margins. Consistent smooth 2D anime art. Background stays completely FLAT SOLID GREEN with no scenery, shadows, text or extra characters. No camera pan, zoom, cuts, adult proportions or pixel art. Silent desktop pet animation.')
   g['9']['inputs'].update(prompt=prompt,width=384,height=384,length=124,first_frame=['8',0])
   if state in ['thinking','working','approval','sleep']:g['9']['inputs'].pop('last_frame',None)
   else:g['9']['inputs']['last_frame']=['8',0]
   g['11']['inputs']['noise_seed']=2026102600+STATES.index(state)+(100 if character.startswith('gemini') else 0)
   g['17']['inputs']['filename_prefix']='board_pet/'+character.replace('-','_')+'_'+state
   (out/'workflow.json').write_text(json.dumps(g,indent=2),encoding='utf-8')
   req=urllib.request.Request(BASE+'/prompt',json.dumps({'prompt':g,'client_id':'standing-q-'+uuid.uuid4().hex}).encode(),{'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=60) as r:result=json.load(r)
   job=result['prompt_id'];(out/'submission.json').write_text(json.dumps(result,indent=2));print(character+' '+state+' submitted '+job,flush=True);started=time.time()
   while True:
    history=get('/history/'+job)
    if job in history:
     entry=history[job];(out/'history.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
     if entry['status']['status_str']=='error':raise RuntimeError(json.dumps(entry['status']))
     if entry['status']['completed']:
      assets=[a for value in entry['outputs'].values() for a in value.get('images',value.get('videos',[]))];asset=next(a for a in assets if a['filename'].endswith('.mp4'))
      with urllib.request.urlopen(BASE+'/view?'+urllib.parse.urlencode(asset),timeout=120) as r:(out/'video.mp4').write_bytes(r.read())
      print(character+' '+state+' complete '+str(round(time.time()-started))+'s',flush=True);break
    (root/'status.json').write_text(json.dumps({'state':state,'prompt_id':job,'seconds':round(time.time()-started)}));time.sleep(5)
if __name__=='__main__':main()
