# 云羽龙姬

Independent character ID: `chatgpt-dragon`. The existing `chatgpt` character,
its source images, action clips and saved pets remain unchanged.

The only visual input for all eight animations is the newly generated chibi
reference at `output/imagegen/chatgpt-chibi-original-v1/base.png`. That image
was generated from the user's original white-haired dragon illustration alone.
Its exact image-generation prompt and provenance are saved beside it.

Local MiniMax H3 generates 124-frame, 384×384 videos for idle, thinking,
working, input, approval, done, error and sleep. Node workflows, job IDs,
execution history and videos are retained in `output/video/chatgpt-dragon-v1`.
No previous desktop-pet imagery or video is an input to these jobs.

`scripts/pack-dragon-video.py` removes the green background, downsamples to
192×192 tiles, applies one shared 64-color palette, and writes eight 8×8 RGBA
atlases. Each contains 63 sampled frames with binary alpha and safe margins.
Done/error play once; sleep plays its entrance once and loops a settled segment.
Other actions return to their shared starting pose for looping. A window retains
idle plus at most two additional decoded atlases, loading other states on demand.

The new character gets 5.25 seconds for completion and its completion demo;
the existing characters retain their original 1.8-second behavior. A new agent
event can always interrupt a completion animation.

Regenerate using the bundled ComfyUI Python with Pillow, NumPy and PyAV:

```powershell
& 'E:\ComfyUI_windows_portable\python_embeded\python.exe' scripts/chibi-dragon-video.py
& 'E:\ComfyUI_windows_portable\python_embeded\python.exe' scripts/pack-dragon-video.py
```

Generation skips existing completed clips, and refuses to insert jobs into an
occupied ComfyUI queue. The packer requires all eight clips unless explicitly
invoked for development with `--available`.
