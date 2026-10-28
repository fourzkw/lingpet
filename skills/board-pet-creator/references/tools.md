# 已实现的创作工具

工具由当前插件后端执行。安装的旧版未暴露这些工具时，应升级并重连宿主；不能靠加载 Skill 获得接口。MCP 宿主可读取 `board-pet://creation/guide` 和 `board-pet://creation/tools`。无共享文件系统时，参考文档也可按 `board-pet://creation/references/creation`（以及 capabilities/project-record/assets）读取。

## 环境与项目

1. 先调用 `board_pet_generation_settings {action:"inspect"}` 读取已保存的 API 配置、协议和优先级（不返回密钥）。使用 ComfyUI 或需要检查后处理时，再调用 `board_pet_environment {action:"inspect"}` 读取节点、模型与 Python 环境。
2. 使用 `action:"configure"` 保存 `url`、`models` 及可选 `python`。模型映射键为 `qwenModel/qwenClip/qwenVae/h3Model/h3Clip/h3Vae`，值必须来自检测结果，不猜文件名或自动替换模型。`python` 是插件所在机器安装了 Pillow、numpy、av 的可执行文件。无需后处理时不必配置 Python。
3. Qwen-Image 2.1 的主文本编码器与 PE 提示词增强模型不同。不要将带 `pe_t2i` / `pe_i2i` 的提示词增强权重绑定为 `qwenClip`；按匹配的官方工作流选用编码器。
4. 确认 ComfyUI `/interrupt` 支持 `prompt_id` 定向中断后，可配置 `targetedInterrupt:true`。默认只删除所属待执行任务，不冒险调用旧版全局中断；正在运行的任务会返回明确说明。绝不清空公共队列。
5. `board_pet_project` 支持 `create/list/get/update/add_reference/select_base`。创建时记录 `name/brief/character/constraints`。更新和读取均传 `projectId`；参考图传插件机器绝对 `path` 或 `base64` 二选一，支持 PNG/JPEG，`purpose` 标明 identity/style/pose/base。返回可持久读取的 `assetId`（结果中字段 `id`）。

用户配置位于桌宠数据目录的 `creation/config.json`，项目/任务/文件位于 `creation/`。不写进安装目录或 Skill；不附带模型，不自动启动或修改 ComfyUI。支持 HTTP(S) 无凭证地址；ComfyUI 本地连接目前无鉴权入口；云端生成服务的 Bearer 密钥通过应用设置或 `board_pet_generation_settings` 保存。

## 图像与视频

后端顺序以应用设置为准。默认调用 `board_pet_generate_image` 的 `provider:"auto"`；可显式指定 `api` 或 `comfyui`。API 使用 OpenAI Images 协议，`apiSize` 表示 API 尺寸；参考图走 images/edits。ComfyUI 的 sampler/steps/cfg/cache 等只用于 ComfyUI，不能当作 API 参数。完整规则见 [生成服务与优先级](generation-services.md)。

`board_pet_generate_image` 必传 `projectId/prompt`；`referenceIds:[]` 为文生图，传图为参考创作/编辑。当前 Qwen 工作流版本为 2，默认 Euler/simple、25 steps、CFG 1；可指定 `sampler/scheduler`（须为环境实际支持的选项）、`steps/cfg/seed/negativePrompt`。

- 文生图：单独创建 EmptyLatentImage，默认 1024 方图；同时传 `width/height` 可指定非方形画幅，不依赖文本编码节点返回的 latent。
- 参考图编辑：`referenceIds` 第一张是编辑目标，其他是参考；提示词显式使用 `<image1>`、`<image2>` 指定身份、风格等作用。默认 `size=0`，参考图不做等面积缩放，仅由编码节点对齐 32 倍数，输出画幅跟随第一张图。需要缩放时传 `size`（256～2048 的 32 倍数），它表示约 size×size 的面积预算，保留纵横比。只有明确需要改变输出画幅时才同时指定 `width/height`，编辑时画幅差异过大可能偏离原图。
- CFG=1 时负向提示词不起作用；工具会记录提示，不自动提高 CFG。保持身份时优先使用简短、明确的局部编辑要求，不把整个人物重新描述一遍当作锁定身份。
- 可选 `cache:true` 使用 QwenImage21Cache；要求节点实际存在。`cacheDevice` 为 auto/gpu/cpu/off，`cacheDtype` 为 default/int8/int4，默认 auto/default；默认不启用缓存。缓存配置只影响缓存，不能替代参考图约束。
- 未实现模板的 PE 自动提示词增强分支；不要声称已启用。PE 是额外文本生成步骤，其权重不能替代主编码器。需要精确编辑时保留原始指令。

工具保留上传 PNG 的输入 alpha，但 VAEDecode/SaveImage 不会因为提示词要求透明就生成透明通道。已有透明图如经外部裁切或补边处理，应重新核对 alpha；输出需独立抠像并验收。任务返回异步 `id`，不自动选择基础图或启动视频。示例：

```json
{"projectId":"项目ID","referenceIds":["目标图ID","风格图ID"],"prompt":"保留 <image1> 的角色身份与姿势，仅将绘画风格改为 <image2> 的柔和Q版插画。保持双脚自然朝前、鲸尾轮廓不变。","size":0,"cfg":1,"steps":25,"cache":true}
```


调用 `board_pet_task {action:"get",projectId,taskId}` 检查真实结果。完成后通过 `board_pet_preview {projectId,assetId}` 检查候选，再用 `board_pet_project {action:"select_base",projectId,assetId}` 确定版本。基础图修改时创建新候选，不覆盖旧文件。

`board_pet_generate_video` 必传 `projectId/state/prompt`，可传 `baseId`，否则使用项目选定图。`state` 为八种标准状态之一。参数为 `size/frames/steps/seed/returnToStart`；当前 H3 工作流版本 1 默认 384 方图、124 帧、24fps、20 steps、res_multistep/simple。帧数必须为 17k+5（22～362）。`returnToStart:true` 将同图作为末帧，不能用于需要保持入睡或等待姿势的片段。

按角色动作的分镜逐个显式设置 `frames`，不把默认 124 帧当作固定时长。仅 ComfyUI 使用此帧数规则；云端 API 使用 `durationSeconds` 与 `resolution`，不要套用 H3 帧数换算。ComfyUI 在24fps 下目标时长 T 秒可换算为 `frames = 5 + 17 × round((24 × T - 5) / 17)`，检查结果在 22～362 内。超出范围先调整动作设计并说明限制，不静默截断；现有接口不自动拼接多个视频。例如 90/141/192/243 帧分别约 3.75/5.88/8/10.13 秒，容器时间戳可能略有差异，导出以真实时序为准。`returnToStart` 根据动作结尾选择，不用于强制所有道具消失。

H3 输入目前直接读取基础图后缩放到方形；不要送入会被明显拉伸的长立绘。先通过图像编辑准备留边充分的方形首帧。工具不会自动把透明底换成绿幕；视频模型可能将 alpha 展平成背景。需要抠像时明确准备适合角色颜色的纯色背景，在视频提示词中保持它，再配置对应后处理。

## 任务、恢复与预览

`board_pet_task` 的 `list` 返回项目任务记录快照，`get` 刷新并下载输出，`cancel` 取消指定所属任务。每个动作单独提交，不自动批量重试或继续失败动作。任务由所选 API 或 ComfyUI 运行，MCP 重启后用原 ID 继续查询；后处理为本机独立进程。查询发现旧基础图会返回 `stale:true`，但不删除历史候选。

网络超时导致提交结果不明时，状态为 `submission_unknown`，按唯一客户端 ID 查询队列和最近 200 条历史恢复。没有找到时保持不明，不盲目重提。`missing` 表示已知 prompt ID 不在队列/历史中，需要人工核对，不等同于完成。取消过程中可能得到 `cancelling`，继续查询到实际终态。取消前已经执行完成的任务会保存结果并返回 completed。

`board_pet_preview` 对小于等于 8MB 的 PNG/JPEG 返回 MCP 图像块；其他文件返回 `board-pet://assets/<id>` 资源链接。MCP 资源读取返回实际媒体字节。宿主是否直接播放视频由宿主决定；不能把“链接返回成功”宣称为 AI 已看过视频。DSH 原生适配返回同机路径，应使用宿主的图片读取/文件展示能力审阅；无此能力时明确未完成视觉检查。

## 后处理与导入

`board_pet_process_assets` 必传 `projectId/clips`。`clips` 结构：

```json
{"idle":{"assetId":"已完成视频资源ID","loop":true,"loopFrom":0,"pingPong":false}}
```

从灵伴 0.4.9 起，每个状态可在主规则的 `alternatives` 中追加最多 7 套视频规则，总共最多 8 套；每套可有独立的时长、startFrame、loopFrom 和 pingPong。`selection:"random"` 随机且不连续重复，`selection:"round-robin"` 按主动作、候选列表依次轮换。未指定方式默认随机。同一状态的 loop 需一致；候选省略 loop 时继承主规则。

```json
{"idle":{"assetId":"主待机视频ID","loop":true,"selection":"random","alternatives":[{"assetId":"翻书待机视频ID"},{"assetId":"整理流苏视频ID"}]}}
```

循环状态每播完一整套切换候选，切换时从新候选首帧开始（包括其进入段）；非循环状态每次进入时选一套，播完保持末帧。单套动作继续按 loopFrom 循环持续段。逐套检查循环边界和跨候选接缝；候选动作不等于不同角色或不同形象，不要为每套新增形象。仅按用户授权制作和启用候选，明确暂不使用的素材不自动加入。

支持部分动作样片；最终导入要求 idle/thinking/working/input/approval/done/error/sleep 八个状态齐全。视频必须属于当前已选择的基础图，旧版本会被拒绝。工具不会替用户判断样片是否自然。

每个动作可选 `startFrame`（默认 0），表示从哪张采样帧开始播放，用于略过道具从画外进入等不适合桌宠的片头；源视频与图集源帧仍保留。`loopFrom` 始终相对于最终播放序列，使用 startFrame 后需重新检查持续段位置。

可设置 `variants:["original","pixel"]`、`fps/originalSize/pixelSize/padding/colors/alphaThreshold`。`background:"preserve"` 保留已有 alpha；`"chroma"` 按 `keyColor:[r,g,b]`、`threshold/feather` 抠像。`despill/spillTolerance` 为可选去溢色；会影响同色服饰细节，应在深浅底审阅。默认不做人物特定的局部覆盖。

工具按视频时间戳采样（每动作最多128帧），保持固定画幅缩放，跨动作共用色板；像素 alpha 二值化，原图保留平滑 alpha。padding 按 pixelSize 网格计量，原图按比例放大留边，保持两版构图一致。默认 done/error 单次保持最后帧，其他循环；按实际动作显式配置 loop/loopFrom/pingPong，默认循环不保证接缝自然。`loopFrom` 为采样后播放序列位置。GIF 为预览，最终时序以 manifest 为准。

不同动作允许不同视频时长，无需补齐到同一帧数。后处理 `fps` 为本次所有 clips 共用参数，应按最长片段选择并为末帧留余量，建议 `ceil(最长秒数 × fps) + 2 ≤ 128`；默认 12fps 不适合接近15秒的长片段，可根据动作细节选择较低采样率或简化/缩短设计。重新采样后按实际播放序列确定 `loopFrom/startFrame`，不能直接传视频秒数或24fps的源帧编号。

用任务查询等待后处理 completed，再调用 `board_pet_appearance {action:"validate",projectId,taskId}`。结构检查包含八状态完整性报告、PNG 尺寸、RGBA 格式、帧引用、时长和路径，视觉审阅需另行完成。

`action:"import"` 可传 `appearanceId/name/character`。创建新形象目录、同步运行时，不改实例或跟随设置；ID 冲突拒绝覆盖。`action:"activate"` 必传已经导入的 `appearanceId/petId`，可指定 variant；运行时必须已启动。`action:"list"` 列出已导入形象。旧运行时不支持动态加载时返回 synced:false，安装支持此功能的版本后重启才能显示；不能声称已激活。

## 分发边界

当前 npm 包包含 `skills/`，Codex/Cursor 构建脚本将 Skill 复制到插件根目录及 runtime，MCP 提供同内容资源；DSH 加载 tools 服务时注册八类原生工具，加载 skills 服务时通过 bundled provider 注册本 Skill。目录被打包不保证所有宿主自动发现 Skill，应检查宿主支持方式。仓库开发用人物脚本不属于公共工具，也不应再用它们执行通用创作。

## 独立角色

调用 `board_pet_character {action:"create",name:"小狐狸",description:"森林伙伴"}` 创建角色；用 `action:"list"` 获取角色 ID。将返回的 `id` 作为 `board_pet_project` 和 `board_pet_appearance` 的 `character`。空角色会保留在工作台，导入八种动作齐全的形象后才可应用；重启保留角色和形象。

## 互动动作（0.5.0）

升级插件并重新连接宿主后，视频和后处理工具的动作参数还支持 click（点击）与 pet（摸头）。互动动作应 loop:false，使用与八种状态相同的基础图、画幅、图集列数和帧尺寸；完整形象清单可在 clips 中附带这两个动作，八种状态仍必须齐全。仅处理互动可生成试片，导入仍需完整八动作。导出 .petpack 会保留已有互动并声明最低桌面版本0.5.0。旧宿主尚未加载新 schema 时，不要声称支持新参数。
