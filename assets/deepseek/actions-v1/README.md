# DeepSeek full action set v1

Eight states each have eight independently drawn key poses. The 1024×1024 RGBA atlas has eight columns of 128×128 cells; rows are idle, thinking, working, input, approval, done, error and sleep.

Identity follows the original `assets/deepseek/states.png`: blue gradient long hair, blue eyes, white maid headband, side fin ears and blue bow, navy dress with white apron, round white shoes and mitten hands, and one whale tail on viewer-right. The original reference is preserved.

The built-in **image_gen** tool generated the sheets in `raw/`; exact prompts are in `prompts.json`. `scripts/build-deepseek-actions.py` registers the white headband width and white-shoe baseline, retains hair and tail margins, removes disconnected neighboring fragments and samples to a binary-alpha pixel grid. The headband provides a stable head-size reference even while the cheeks or eyes change. One camera scale is used per action with a shared global safety factor to retain the whole silhouette. `registration.json` records the alignment. The complete pose contact sheet is `contact-sheet.png`.

Typing keeps both mitten hands at the keyboard. Its upper 80 pixel rows are held fixed; motion is limited to hands and keys below. Idle and waving loop. Thinking and approval play their entrance once, then loop only the settled poses. Celebration and error play once, then hold recovery. Sleep curls the tail in front; after its entrance, only the four closed-eye resting poses loop.

`desktop/deepseek-actions.js` plays the actual poses and adds independently timed pixel accents. `desktop/action-clips.js` supplies the shared frame clock for both characters. No body stretch, image rotation or pixel warping is applied to these new actions.

Error playback uses atlas poses 48 → 49 → 50 → 49 → 54 → 55: hands rise to cover the mouth, pause, lower to the chest and return to rest. The opposing head tilts and deep slump (51–53) remain in the source atlas but are not played. There is no moving sweat accent. The sequence plays once and holds its final pose.
