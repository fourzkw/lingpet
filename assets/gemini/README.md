# Gemini · 星语猫娘

根据用户提供的蓝紫猫耳少女形象，以现有 DeepSeek 桌宠为风格参考，使用内置 image_gen 生成透明八状态动作图集。保留蓝紫渐变长发、粉色内耳、金色与粉红异色瞳、四色星形发饰、深蓝星饰裙与一条蓬松猫尾，改为大头短身坐姿。

`actions-v1/atlas.png` 为原始透明图集，1254×1254，8 列×8 行，每行依次为 idle、thinking、working、input、approval、done、error、sleep，合计 64 个姿势。保留原始 alpha；运行时在 128px 网格中进行透明边缘整理与像素渲染，不修改原图。完成和出错只播放一次，等待批准和休眠进入后仅循环稳定等待段。

完整生成提示词与来源记录见 `actions-v1/generation.json`。工作台、悬浮桌宠和会话跟随均使用 `desktop/companion-actions.js` 的动作时序。
