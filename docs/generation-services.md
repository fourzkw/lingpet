# 云端生成与桌宠制作

本地生成请先阅读 [ComfyUI 安装、模型下载与配置指南](comfyui-setup.md)，包含官方下载、模型目录、节点检查和 Python 后处理环境。

在「应用设置 → 创作服务」配置生图 API、Seedance 或 MiniMax 的基础地址、密钥和模型。生图采用 OpenAI Images 兼容协议；MiniMax 可选择 H3 v2 或 Hailuo v1。不要将聊天 API 地址填作生图接口。

「生成服务优先级」分别管理生图与视频，可上移、下移和启停。AI 通过 `board_pet_generation_settings` 读取同一份配置，生成工具默认 `provider:auto` 遵循顺序。未配置的候选被跳过；已提交任务不会因为失败或调整优先级而自动换服务重提。

视频通过任务 ID 查询和下载为项目资源，再由现有 Python 后处理生成桌宠图集。云端生图/视频无需 ComfyUI，但动作导出仍需 Python、Pillow、numpy、av。完整工具参数和恢复规则见 [生成服务说明](../skills/board-pet-creator/references/generation-services.md)。

协议依据：[OpenAI Images](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Seedance](https://docs.volcengine.com/docs/ark/seedance-2-5)、[MiniMax H3 提交](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)、[H3 查询](https://platform.minimax.io/docs/api-reference/video-generation-v2-query)、[Hailuo 图生视频](https://platform.minimax.io/docs/api-reference/video-generation-i2v)。

旧版通用视频 API 配置会保留，但不会猜测其服务商并自动提交。将其迁移至对应 Seedance 或 MiniMax 配置后使用。更新桌面运行时不会自动替换宿主已加载的 MCP 工具与技能；应同时更新插件，重启相应 MCP/插件或开启新会话后使用新工具。
