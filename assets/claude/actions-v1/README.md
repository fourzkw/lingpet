# Claude action samples v1

Three action samples retain the original orange Clawd design: typing (`working`), waving (`input`) and a celebratory jump (`done`). DeepSeek and Claude's other states retain their existing renderer.

`atlas.png` is an 8-column, 3-row transparent atlas with 128×128 cells: wave frames 0–7, typing frames 8–15, jump frames 16–23. Every pose has separately drawn arms/hands/feet/eyes. Body width is normalized to 80 pixels and the floor anchor is 108; only anticipation and landing use a shorter torso. Grounded poses share a baseline, with authored takeoff, airborne and landing positions for jumping. Neutral boundary frames are identical.

The built-in **image_gen** tool generated the three sheets in `raw/` from the original `assets/claude/states.png` reference. Exact prompts are recorded in `prompts.json`. The original eight-state atlas is unchanged. `scripts/build-claude-actions.py` removes disconnected fragments, crops with overlapping margins to retain raised hands, registers body dimensions and the floor, then samples the artwork onto the pixel grid. `anchors.json` records this registration; `contact-sheet.png` shows every pose.

`desktop/claude-actions.js` supplies explicit per-frame durations. Typing and waving loop; the jump plays once, lands, and holds its recovery frame until the state changes. No stretch, rotation or per-pixel deformation is applied to these three body clips. Keyboard activity, greeting accents and confetti are independently timed pixel layers, forming the hybrid animation.

Run the ordinary desktop smoke check to capture `claude-actions-strip.png`, then run `scripts/export-claude-actions.py` with Pillow to assemble a GIF from the actual runtime frames. The working directory must be the project root for desktop smoke testing.
