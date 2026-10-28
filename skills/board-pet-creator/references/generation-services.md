# 生成服务与优先级

## 配置发现

从灵伴 0.6.6 起，`board_pet_generation_settings {action:"inspect"}` 返回与「应用设置 → 创作服务」相同的配置：`apis`（地址、模型、协议、hasApiKey）、`comfyui`、`priorities.image/video`。不要向用户重复索要已保存的密钥，也不要把密钥放入提示词、项目或任务记录。

配置可通过 `action:"configure"` 更新：`kind:"image"|"seedance"|"minimax"`，`values:{url,model,apiKey,protocol}`。密钥留空保留；`clearApiKey:true` 清除。只在用户要求配置时更改，生成任务无需重复配置。

优先级是完整有序列表，每项 `{id,enabled}`。生图包含 `api/comfyui`；视频包含 `seedance/minimax/comfyui`。`priorities` 更新必须同时传两类列表，保留另一类当前值。设置页可上移、下移和启停，立即保存。

`provider:"auto"` 按顺序跳过禁用、未配置或提交前不可用的服务。ComfyUI 会检查节点和模型；云 API 的已配置不等于密钥、额度已验证。明确指定 `provider` 时覆盖优先级（包括被禁用的自动候选）。一旦开始提交，不自动切换服务、不自动重提：超时可能已扣费。

## 生图

`board_pet_generate_image` 默认使用 `auto`，也可指定 `api/comfyui`。API 基础地址例如 `https://your-provider.example/v1`；文生图 POST `images/generations`，参考图编辑 multipart POST `images/edits`，返回 `data[].b64_json` 或 `data[].url`。只适配此协议，聊天补全接口不能代替它。

API 使用 `apiSize`（如 `1024x1024`），或显式 width/height；未指定默认 1024 方图。`negativePrompt` 追加为自然语言避免事项，不冒充服务端负向条件。只接收 PNG/JPEG。ComfyUI 使用原有采样参数，API 不使用 sampler/steps/cfg/cache。

生图 API 请求可能在调用返回时已完成；无论状态是 completed、queued 还是 finalizing，都以真实任务状态和可读产物为准。生成结果不会自动成为基础图：预览后通过项目 `select_base` 选定。

## 视频

每个动作调用 `board_pet_generate_video`，传当前选定基础图或 `baseId`、`state`、`prompt`。API 使用 `durationSeconds` 和 `resolution`；`size/frames/steps` 是 ComfyUI 参数，不要把 H3 的 17k+5 帧数规则套给云服务。模型可用时长、分辨率和首尾帧能力以具体模型为准；不静默截断或替换模型。

- `provider:"seedance"`：基础地址 `https://ark.cn-beijing.volces.com/api/v3`，协议 `seedance`；提交 `contents/generations/tasks`，通过 `content` 发送首帧 Data URL，`returnToStart:true` 同时发送相同尾帧。默认 5 秒、720p、自适应画幅。
- `provider:"minimax"`、协议 `minimax-h3`：基础地址 `https://api.minimax.io`（或对应区域/代理），H3 v2 提交及查询；`content` 携带首帧，支持相同尾帧。默认 5 秒、768P、自适应画幅。
- `provider:"minimax"`、协议 `minimax-hailuo`：v1 图生视频；默认 6 秒、720P。完成后通过 file_id 查询下载地址。该适配器不将 returnToStart 当成通用 Hailuo 能力，需使用 H3/Seedance 或调整设计。
- `provider:"comfyui"`：原有本机 MiniMax H3 工作流；只用 size/frames/steps，不传云 API 专用参数。

配置中的模型 ID 必须是用户有权限使用的真实 ID，不在 Skill 中硬编码用户环境。AI 设计的视频时长应显式写出，并考虑后处理最多128张采样帧。

## 查询、取消与恢复

任务返回本机 `id` 和服务商 `remoteId`。用本机 id 调用 `board_pet_task`；get 查询同一服务并将 MP4 下载到项目资源，写入 baseId/state/输入哈希，后续后处理规则与 ComfyUI 相同。不能拿服务商 ID 代替本机 taskId。

MCP/应用重启后可继续查询。修改优先级不改变已有任务；若修改了旧任务的服务地址或协议，需要恢复旧配置后才能查询，避免把新密钥发到旧地址。修改同一地址的密钥后，查询使用新保存的密钥。

`submission_unknown` 表示提交结果不明且可能已扣费；没有服务商 ID 时不能自动查询恢复或重提，需核对服务商后台。`finalizing` 表示正在保存产物，下载失败时可继续 get，不重新生成。

取消先查询任务，完成的任务保存产物。Seedance、MiniMax H3 只取消指定任务；Hailuo 缺少适配的取消接口时报告远端仍在执行，不假称已取消。图像同步请求若超时，不假称已停止远端生成。

## 制作与交付

读取配置 → 建立/恢复项目 → 生图或导入基础图 → 预览并 select_base → 设计动作 → 单动作试片 → 查询并检查视频 → 扩展其余状态 → process_assets → 预览/validate → import → 用户需要时 activate。图片与视频可以使用不同服务，但所有动作必须绑定同一选定基础图。

云端生成不要求本机安装 ComfyUI；视频转动作图集仍需配置带 Pillow、numpy、av 的 Python。未完成视觉审阅时明确说明，不把接口返回成功视为作品通过审查。
