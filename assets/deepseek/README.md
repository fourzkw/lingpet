# Q版DeepSeek桌宠资源

states.png：内置image_gen以用户确认的Q版鲸鱼娘设定图为参考生成的透明4列×2行状态图。

顺序：idle、thinking、working、input、approval、done、error、sleep。原始 PNG 保留作造型参考。桌面与工作台已改为使用 `actions-v1/atlas.png` 的八状态逐帧动作，共 64 张 128×128 姿势帧，由 `desktop/deepseek-actions.js` 播放，并叠加独立计时的像素提示。身体不再使用原图拉伸、旋转或局部像素形变。完整素材、提示词和生成流程见 `actions-v1/README.md`。

身份保留蓝色渐变长发、鳍耳、白女仆头饰、侧蝴蝶结、白围裙、圆脚与一条鲸尾。视觉比例采用用户提供的第二张图的巨大头部、短身团子坐姿和粗描边。
