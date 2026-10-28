import subprocess,sys
from pathlib import Path
for asset in ['chatgpt-q-v2','gemini-q-v2']:
 root='output/video/'+asset
 subprocess.run([sys.executable,'scripts/pack-dragon-video.py','--asset',asset,'--video-root',root],check=True)
 subprocess.run([sys.executable,'scripts/pack-dragon-original.py','--asset',asset,'--video-root',root],check=True)
