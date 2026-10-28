import av,argparse
from pathlib import Path
from PIL import Image,ImageDraw
parser=argparse.ArgumentParser();parser.add_argument('asset');args=parser.parse_args();root=Path('output/video')/args.asset
states=[s for s in ['idle','thinking','working','input','approval','done','error','sleep'] if (root/s/'video.mp4').exists()]
sheet=Image.new('RGB',(384*4,408*len(states)),'#242936');draw=ImageDraw.Draw(sheet)
for row,state in enumerate(states):
 with av.open(str(root/state/'video.mp4')) as video:frames=[frame.to_image() for frame in video.decode(video=0)]
 for column,index in enumerate([0,40,80,123]):
  sheet.paste(frames[index],(column*384,row*408+24));draw.text((column*384+10,row*408+5),state+' '+str(index),fill='white')
sheet.save(root/'video-contact.png');print(str(root/'video-contact.png'))
