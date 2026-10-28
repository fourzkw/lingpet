import av,sys
from PIL import Image,ImageDraw
from pathlib import Path
source=Path(sys.argv[1]); target=Path(sys.argv[2]);target.parent.mkdir(parents=True,exist_ok=True)
with av.open(str(source)) as video: frames=[frame.to_image().convert('RGB') for frame in video.decode(video=0)]
indices=[round(i*(len(frames)-1)/7) for i in range(8)]
sheet=Image.new('RGB',(384*4,410*2),'#202933');draw=ImageDraw.Draw(sheet)
for i,n in enumerate(indices):
    frame=frames[n];frame.thumbnail((384,384));sheet.paste(frame,((i%4)*384,(i//4)*410));draw.text(((i%4)*384+8,(i//4)*410+385),str(n),fill='white')
sheet.save(target)
print(str(target))
