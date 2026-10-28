import av,sys,json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);states=sys.argv[2:]
for state in states:
    frames=[];times=[]
    with av.open(str(root/(state+'.mp4'))) as c:
        fps=float(c.streams.video[0].average_rate or 24)
        for frame in c.decode(video=0):frames.append(frame.to_image().convert('RGB'));times.append(float(frame.time or 0))
    indices=sorted(set(round(i*(len(frames)-1)/11) for i in range(12)))
    board=Image.new('RGB',(256*4,280*3),'#e5e7eb');d=ImageDraw.Draw(board)
    for j,i in enumerate(indices):
        im=frames[i].copy();im.thumbnail((256,256));x=j%4*256;y=j//4*280;board.paste(im,(x,y));d.text((x+5,y+257),f'{state} {times[i]:.2f}s / frame {i}',fill='black')
    board.save(root/(state+'-contact.png'))
    frames[0].save(root/(state+'-first.png'));frames[-1].save(root/(state+'-last.png'))
    frames[0].save(root/(state+'-raw.gif'),save_all=True,append_images=frames[2::2],duration=round(2000/fps),loop=0)
    print(json.dumps({'state':state,'frames':len(frames),'fps':fps,'duration':times[-1]+1/fps}))
