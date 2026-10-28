# Dedicated click and head-pat animations

Claude, DeepSeek whale, white dragon and cloud dragon each have two freshly
generated MiniMax H3 clips, independent of the eight session state animations.
Existing approved character references were retained. The project records,
generation tasks, prompts, video hashes and review contact sheets are retained in
`output/interaction-v1/`; each asset folder includes its input provenance.

- `click`: 56 source frames at 24fps, approximately 2.334 seconds. A brief nod,
  attentive expression and small personal acknowledgement, then return to rest.
- `pet`: 90 source frames at 24fps, 3.750 seconds. Closed-eye contentment with a
  small head tilt/sway, then return to rest. No celebratory jump sequence.
- `idle`: a single first pose used while the player initializes, not a replacement
  for the character's normal idle animation.

Both interactions play once. Runtime duration comes from the exported timing.
A new session animation key cancels the local override immediately; interaction
never writes demo state, changes follow rules, or changes saved configuration.

Video generation slots were `input` and `done` because the creation API accepts
eight session state names. The processed bundle slots `idle`/`done` are renamed
to the independent playback keys `click`/`pet` when packed. These slots do not
replace or overwrite any original session action.

DeepSeek and both dragons ship 384px originals and 192px pixel sprites with a
shared 64-color palette per character. Claude retains 128px pixel sprites and a
32-color palette. Pixel alpha is binary, original edges retain smooth alpha.
Green-screen processing uses the existing project pipeline and fixed margins;
no per-frame auto-cropping or rescaling is applied.

Regenerate packing only from reviewed bundles recorded in the project file:

```
node scripts/pack-interaction-assets.mjs
node --test test/interaction-actions.test.js
```
