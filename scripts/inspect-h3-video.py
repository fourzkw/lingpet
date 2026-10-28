import av,json,pathlib
from PIL import Image,ImageDraw
p=pathlib.Path('output/video/chatgpt-idle-h3/chatgpt_idle_h3_v1_00001_.mp4')
container=av.open(str(p));stream=container.streams.video[0];selected={0,24,48,72,96,123};images=[];count=0
for index,frame in enumerate(container.decode(video=0)):
 count=index+1
 if index in selected:
  image=frame.to_image();image.save(p.parent/f'frame-{index:03d}.png');images.append((index,image))
sheet=Image.new('RGB',(384*3,408*2),'#191f2a');draw=ImageDraw.Draw(sheet)
for i,(index,image) in enumerate(images):
 sheet.paste(image.resize((384,384)),(i%3*384,i//3*408+24));draw.text((i%3*384+10,i//3*408+5),f'Frame {index}',fill='white')
sheet.save(p.parent/'contact-sheet.png')
result={'width':stream.width,'height':stream.height,'fps':str(stream.average_rate),'frames':count,'duration_seconds':float(stream.duration*stream.time_base) if stream.duration else None}
(p.parent/'video-info.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
