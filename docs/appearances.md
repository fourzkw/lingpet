# 角色、形象与显示版本

每只桌宠独立保存三个字段：`character`（角色）、`appearance`（形象）、
`variant`（`original` 原图或 `pixel` 像素）。更换外观不会改变名称、位置、
大小、显示开关或会话跟随规则。复制桌宠会复制其完整外观选择。

在工作台依次选择角色、形象、显示版本；右键菜单提供对应的三个入口。
ChatGPT 的白羽龙姬、云羽龙姬属于同一角色下的两个保留形象。

原图版保留源素材的画风、颜色与透明边缘；像素版使用处理后的像素帧。
云羽龙姬的八种动作同时提供两版：384px 的未量化视频帧和 192px 的
64 色像素帧，共用动作时序。旧 GPT、Gemini 的原图版直接读取原始图集。
Claude、DeepSeek 当前仅有像素素材，原图按钮会禁用，不用放大像素图假冒原图。

形象库位于 `src/characters.js`。每个角色的 `appearances` 数组可以保留多个
形象，每个形象声明自己的 `variants`。增加新形象不需要增加角色分类。
不可用版本不会自动替换为另一形象；非法的形象/角色/版本组合会拒绝保存。

旧配置自动迁移：`chatgpt` 对应 `chatgpt / white-dragon / pixel`；
旧 `chatgpt-dragon` 对应 `chatgpt / cloud-dragon / pixel`。保留桌宠 ID、
名称、数量、位置与跟随规则，旧客户端仍可传入该别名。配置结构继续使用
兼容的 schemaVersion 2，新增字段会独立保存。

素材更新：先运行 `scripts/pack-dragon-video.py` 导出像素帧，再运行
`scripts/pack-dragon-original.py` 导出原图帧并更新本地模块清单。
后者使用已有 H3 视频，不重新调用模型。桌宠窗口维持禁止网络请求的安全策略。

## 同一状态的多套候选动作（0.4.9）

每个状态仍保留原有主 clip，可追加 `alternatives`（最多7套），因此旧资源包无需改动。主 clip 的 `selection` 为 `random`（默认）或 `round-robin`。随机会避开刚播放的一套，轮换按主动作、候选列表顺序播放。

循环状态每播完一整套后选择下一套，新动作从首帧开始；非循环状态每次进入只选一套，播完保持末帧。每套可有不同的帧数、时长和循环点，同一状态的 loop 必须一致。只有一套时仍沿用原来的 loopFrom 逻辑。原图/像素切换保持当前选择，工作台各个预览与桌宠窗口独立计时。

创作时通过 `board_pet_process_assets` 的同名字段传入候选视频：

```json
{"clips":{"idle":{"assetId":"idle-main","loop":true,"selection":"round-robin","alternatives":[{"assetId":"idle-reading"},{"assetId":"idle-tail"}]}}}
```

处理工具会分别输出图集和 GIF，合并到同一状态；导入、指纹去重、市场安装和再次导出均保留候选列表及播放方式。分享包使用 `sprites/idle.png`、`sprites/idle-1.png` 至 `sprites/idle-7.png`，原图位于对应 `original/` 目录；含候选的包最低客户端版本为0.4.9。完整包依旧需要八个状态，创作试片可只提供部分状态。
