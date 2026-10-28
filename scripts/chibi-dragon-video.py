"""Local H3 generation. The new chibi base is the ONLY visual input."""
import argparse,json,pathlib,urllib.request,urllib.parse,uuid,time,copy
from PIL import Image
ROOT=pathlib.Path('output/video/chatgpt-dragon-v1')
BASE='http://127.0.0.1:8188'
ACTIONS={
 'idle':'Calm natural breathing, hair tips and tail tip gently sway. ONE quick natural simultaneous blink in the middle, eyelids close fully then immediately open. Keep the original hand positions.',
 'thinking':'She slowly moves her lower hand to her chin, tilts her head a little with a thoughtful expression, holds this gesture, then smoothly returns to her starting pose.',
 'working':'She concentrates and moves both tiny hands to tap a small floating lavender keyboard at waist height. Gentle alternating tapping motions, with a steady head and body. At the end return to the original pose.',
 'input':'She makes two small inviting waves with her raised open hand and smiles gently, then returns her hand to the original pose.',
 'approval':'She nods once gently and turns her open palm upward in a patient asking gesture, pauses expectantly, then returns to her starting pose.',
 'done':'She smiles happily, raises her little hands in a small celebratory gesture and gently flutters her dragon wings once, then returns to her initial pose. Feet stay planted.',
 'error':'A brief mildly surprised expression, one small head shake, shoulders sink slightly in disappointment, then she relaxes back into her original pose.',
 'sleep':'She slowly lowers her arms and naturally closes both eyes, tilts her head slightly and remains asleep with her eyes closed and soft slow breathing. No waking up.'
}
def get(route):
 with urllib.request.urlopen(BASE+route,timeout=40) as r:return json.load(r)
def upload(image):
 boundary='pet-'+uuid.uuid4().hex
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="fresh_chibi_dragon.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+image.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
 req=urllib.request.Request(BASE+'/upload/image',body,{'Content-Type':'multipart/form-data; boundary='+boundary})
 with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)['name']
def main():
 global ROOT
 parser=argparse.ArgumentParser();parser.add_argument('--states',nargs='+',default=list(ACTIONS));parser.add_argument('--character',choices=['chatgpt-dragon','chatgpt-dumpling','gemini-dumpling'],default='chatgpt-dragon');parser.add_argument('--reference');args=parser.parse_args()
 ROOT=pathlib.Path('output/video')/(args.character+'-v1')
 ROOT.mkdir(parents=True,exist_ok=True)
 queue=get('/queue')
 if queue['queue_running'] or queue['queue_pending']:raise RuntimeError('ComfyUI already has work; nothing submitted.')
 source=args.reference or ('output/imagegen/chatgpt-chibi-original-v1/base.png' if args.character=='chatgpt-dragon' else 'output/imagegen/'+args.character+'-v1/base.png')
 original=Image.open(source).convert('RGBA')
 original=original.crop(original.getbbox());original.thumbnail((640,640),Image.Resampling.LANCZOS)
 ref=Image.new('RGB',(768,768),(0,170,0));ref.paste(original,((768-original.width)//2,680-original.height),original.getchannel('A'));ref.save(ROOT/'reference-green.png')
 image=upload(ROOT/'reference-green.png')
 # Reuse node configuration only, never old character imagery or animations.
 template=json.loads(pathlib.Path('output/video/chatgpt-idle-h3/api-workflow.json').read_text())
 for state in args.states:
  out=ROOT/state;out.mkdir(exist_ok=True)
  if (out/'video.mp4').exists():print(state+' already complete',flush=True);continue
  g=copy.deepcopy(template)
  for key in ['5','6','7']:g.pop(key,None)
  g['4']['inputs']['image']=image
  g['8']['inputs'].update(image=['4',0],upscale_method='lanczos',width=384,height=384)
  if args.character=='chatgpt-dragon':
   identity='A cute Q-version chibi dragon girl matching the reference exactly, big round head and tiny short body. Preserve her white hair, ivory horns, lavender eyes, pointed ears, white dress with knot ornaments, lavender wings, ONE curled scaled tail, and the little blue cloud companion floating near her. '
   action=ACTIONS[state]
  else:
   identity=('The exact seated Q-version chibi mascot in the reference, huge round head and extremely tiny seated dumpling body, round feet tucked directly below her. She remains seated throughout, NEVER stands, no elongated body or long legs. ')
   identity+=('Preserve her long pale lavender-white hair, two ivory ridged dragon horns, lavender eyes, pointed ears, modest white high-neck dress with lilac shadows and knot ornaments, two SMALL lavender dragon wings and ONE curled pale dragon tail. No cloud companion. ' if args.character=='chatgpt-dumpling' else 'Preserve her blue-violet-magenta long hair, two blue-purple CAT EARS with pink inner ears, asymmetric ruby-pink and GOLD eyes, four-point rainbow star hair ornament, modest full navy-purple dress with white ruffles and gold stars, ONE fluffy blue-purple CAT tail. NO horns, NO wings. ')
   action={
    'idle':'Calm natural breathing. Hair tips and tail tip gently sway. One quick simultaneous natural blink, closing then immediately reopening both eyes. Hands stay resting together in lap. Return smoothly to the initial pose.',
    'thinking':'One tiny hand rises from lap and rests under chin, a small thoughtful head tilt and curious eye movement. Hold the chin-resting seated thinking pose with very subtle breathing. Do not lower the hand again.',
    'working':'A tiny keyboard appears on the floor in front of her round feet. Both tiny hands move onto the keys and continuously alternate small tapping motions. Hands stay low at the keys, head and torso steady, no waving or head bobbing. End still typing on the keyboard.',
    'input':'Raise one tiny hand beside her cheek, politely wave twice with small wrist movements and a gentle smile, then lower hand back to lap and return to initial seated pose.',
    'approval':'Both tiny hands raise a SMALL golden shield with a dark KEYHOLE motif in front of her body, below her face. She holds the shield patiently and calmly blinks once. End still holding the shield in a steady waiting pose.',
    'done':'A small happy SEATED hop: tiny anticipation crouch, little hands rise beside cheeks, round feet lift a LITTLE, joyful closed-eye smile, then settle back into the exact initial seated hands-in-lap pose. No standing, no long legs, no high jump.',
    'error':'Brief mild surprise, small hands move to cheeks, shoulders draw inward slightly, then hands lower and she relaxes back to her exact initial seated pose.',
    'sleep':'Slowly close both eyes naturally and curl slightly into a comfy seated sleeping pose, hands folded at lap and tail curled near her feet. End with both eyes fully CLOSED, remain peacefully asleep with slow gentle breathing. Never wake up.'
   }[state]
  prompt=identity+action+' Fixed camera, full character always visible with generous margin, seated baseline anchored. Consistent clean 2D anime illustration, same face, proportions and costume throughout. Completely flat solid green chroma-key background throughout. No zoom, no camera movement, no cuts, no scenery, no extra characters, no text, no pixel art, no adult proportions. Silent desktop pet animation.'
  g['9']['inputs'].update(prompt=prompt,width=384,height=384,length=124,first_frame=['8',0])
  if state=='sleep' or (args.character!='chatgpt-dragon' and state in ['thinking','working','approval']):g['9']['inputs'].pop('last_frame',None)
  else:g['9']['inputs']['last_frame']=['8',0]
  g['11']['inputs']['noise_seed']=2026102500+list(ACTIONS).index(state)+(100 if args.character=='chatgpt-dumpling' else 200 if args.character=='gemini-dumpling' else 0)
  g['17']['inputs']['filename_prefix']='board_pet/'+args.character.replace('-','_')+'_'+state
  (out/'workflow.json').write_text(json.dumps(g,indent=2),encoding='utf-8')
  data=json.dumps({'prompt':g,'client_id':'fresh-dragon-'+uuid.uuid4().hex}).encode()
  req=urllib.request.Request(BASE+'/prompt',data,{'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=60) as r:result=json.load(r)
  job=result['prompt_id'];(out/'submission.json').write_text(json.dumps(result,indent=2));print(state+' submitted '+job,flush=True)
  start=time.time()
  while True:
   history=get('/history/'+job)
   if job in history:
    entry=history[job];(out/'history.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
    if entry['status']['status_str']=='error':raise RuntimeError(json.dumps(entry['status']))
    if entry['status']['completed']:
     assets=[a for v in entry['outputs'].values() for a in v.get('images',v.get('videos',[]))]
     asset=next(a for a in assets if a['filename'].endswith('.mp4'))
     with urllib.request.urlopen(BASE+'/view?'+urllib.parse.urlencode(asset),timeout=120) as r:(out/'video.mp4').write_bytes(r.read())
     print(state+' complete '+str(round(time.time()-start))+'s',flush=True);break
   (ROOT/'status.json').write_text(json.dumps({'state':state,'prompt_id':job,'seconds':round(time.time()-start)}))
   time.sleep(5)
if __name__=='__main__':main()
