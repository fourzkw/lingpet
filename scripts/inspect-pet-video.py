import av,json,sys,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);states=sys.argv[2:] or ['idle','thinking','working','input','approval','done','error','sleep'];reports={}
for state in states:
 file=root/state/'video.mp4'
 if not file.exists(): continue
 with av.open(str(file)) as video: frames=list(video.decode(video=0));fps=float(video.streams.video[0].average_rate)
 picks=list(range(0,len(frames),4));picks+=[] if picks[-1]==len(frames)-1 else [len(frames)-1]
 board=Image.new('RGB',(8*192,((len(picks)+7)//8)*216),(35,40,50));draw=ImageDraw.Draw(board)
 for n,i in enumerate(picks):board.paste(frames[i].to_image().resize((192,192)),(n%8*192,n//8*216+24));draw.text((n%8*192+4,n//8*216+4),str(i),fill='white')
 board.save(root/(state+'-contact.png'))
 frames[0].to_image().save(root/(state+'-first.png'))
 reports[state]={'frames':len(frames),'fps':fps,'uniqueFrames':len({hashlib.sha256(f.to_ndarray(format='rgb24').tobytes()).hexdigest() for f in frames})}
(root/'video-quality.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports))
