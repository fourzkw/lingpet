"""Pack imagegen key poses without altering character artwork or inventing inbetweens."""
from collections import deque
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/claude/actions-v1'
SIZE = 128

def clean_cell(image, action):
    image = image.copy().convert('RGBA')
    pixels = image.load()
    width, height = image.size
    seen = set()
    components = []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y][3] < 160:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            component = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and pixels[nx, ny][3] >= 160:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append(component)
    largest = max(map(len, components))
    # A raised hand may cross the nominal cell edge. Expanded crops recover it;
    # keep the main connected character, excluding fragments from neighboring cells.
    main = max(components, key=len)
    keep = set(main)
    if action == 'typing':
        min_x, max_x = min(x for x, y in main), max(x for x, y in main)
        min_y = min(y for x, y in main)
        for component in components:
            cx = sum(x for x, y in component) / len(component)
            cy = sum(y for x, y in component) / len(component)
            if len(component) >= largest * .02 and min_x-15 <= cx <= max_x+15 and cy > min_y+80:
                keep.update(component)
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255) if (x, y) in keep else (0, 0, 0, 0)
    return image

def body_anchor(image):
    pixels = image.load()
    orange = []
    for y in range(image.height):
        xs = [x for x in range(image.width) if pixels[x, y][3] and pixels[x, y][0] > 125
              and pixels[x, y][0] > pixels[x, y][1] * 1.35 and pixels[x, y][2] < 140]
        orange.append(xs)
    runs = []
    for xs in orange:
        groups = []
        for x in xs:
            if not groups or x > groups[-1][-1]+1:
                groups.append([x])
            else:
                groups[-1].append(x)
        runs.append(max(groups, key=len) if groups else [])
    max_run = max(map(len, runs))
    top = next(y for y, run in enumerate(runs) if len(run) >= max_run * .75)
    # Measure the broad forehead above the eyes, so outstretched arms never
    # influence scale or make the body grow/shrink during an action.
    forehead = max(runs[top+8:top+26], key=len)
    left, right = forehead[0], forehead[-1]
    body_rows = [y for y, run in enumerate(runs) if len(run) >= len(forehead) * .65]
    return (left + right) / 2, right - left + 1, min(body_rows), max(body_rows)+1

