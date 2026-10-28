# Claude / Clawd desktop art

`clawd-reference.png` is the user-selected eight-state reference. `states.png` is a transparent 1536×1024 atlas generated from it with the built-in image tool. The first successful output was selected to preserve the softer painted reference style.

Order: idle, thinking, working, input, approval, done, error, sleep. Rendering uses four columns, two rows; vertical crop bands are 120–456 and 560–896, retaining props without excessive empty space. `desktop/pixel-pet.js` samples these exact poses onto a 128×128 pixel grid, then animates the original pixels with local hand movements, blinking, breathing and prop motion at 10 fps. No replacement character is drawn. `desktop/claude.js` delegates to this shared renderer.

The final generation prompt is saved in `reference-atlas-prompt.txt`. RGB values outside the characters may contain a matte, but the PNG alpha is zero there; consumers must preserve alpha. Do not flatten to RGB.

`frames.json` is reserved for future LED output. The desktop does not use it.
