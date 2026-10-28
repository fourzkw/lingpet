import sys,json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);m=json.loads((root/'manifest.json').read_text());states=list(m['clips']);board=Image.new('RGB',(768,408*len(states)),'#e5e7eb');d=ImageDraw.Draw(board)
for j,state in enumerate(states):
 c=m['clips'][state];s=m['tileSize'];i=c['frames'][min(len(c['frames'])-1,48)];sheet=Image.open(root/c['file']).convert('RGBA');im=sheet.crop((i%m['columns']*s,i//m['columns']*s,(i%m['columns']+1)*s,(i//m['columns']+1)*s));board.paste(Image.new('RGB',(s,s),'white'),(0,j*408));board.paste(Image.new('RGB',(s,s),'#20242b'),(s,j*408));board.paste(im,(0,j*408),im);board.paste(im,(s,j*408),im);d.text((8,j*408+386),state+' on light / dark',fill='black')
board.save(root/'representative-check.png')
