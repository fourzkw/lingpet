# ChatGPT · 白羽龙姬

根据用户提供的白发龙角少女形象，以现有 DeepSeek 桌宠为风格参考，使用内置 image_gen 生成透明八状态动作图集。保留白色长发、双龙角、淡紫眼睛、结花饰品、小龙翼和盘起的龙尾，改为大头短身坐姿。

`actions-v1/atlas.png` 为原始透明图集，1254×1254，8 列×8 行，每行依次为 idle、thinking、working、input、approval、done、error、sleep，合计 64 个姿势。保留原始 alpha；运行时在 128px 网格中进行透明边缘整理与像素渲染，不修改原图。完成和出错只播放一次，等待批准和休眠进入后仅循环稳定等待段。

完整生成提示词与来源记录见 `actions-v1/generation.json`。工作台、悬浮桌宠和会话跟随均使用 `desktop/companion-actions.js` 的动作时序。

0.3.4 起使用 `desktop/chatgpt-motion.js` 优化播放：头发和身体保持固定，只替换双眼眼睑；约每 5.8 秒眨眼一次，闭合过程约 225ms。其他动作进行头部位置对齐、稳定打字和等待段循环，庆祝、出错结束后回到原始空闲姿态。原图集保持不变。
