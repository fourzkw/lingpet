# ComfyUI 安装与模型配置

本文面向 Windows 本机用户，对应灵伴当前的 Qwen Image 2.1 生图／编辑和 MiniMax H3 图生视频工作流。下载来源核对日期：2026-10-30。

## 先确定需要哪些组件

| 你的用途 | 需要配置 |
| --- | --- |
| 显示桌宠、跟随 Agent、安装市场形象 | 无需 ComfyUI、模型或 Python |
| 使用云端生图／视频服务 | 无需本地 ComfyUI；视频转桌宠动作仍需后处理 Python |
| 本地生图或修改参考图 | ComfyUI + Qwen 三个模型 |
| 本地图生视频 | ComfyUI + H3 三个模型 |
| 视频转原图／像素动作图集 | 灵伴所在电脑上的 Python + Pillow、numpy、av |

灵伴不会自动安装、启动或更新 ComfyUI，也不会自动下载权重。可以只配置所需的生图或视频能力，另一项未就绪不影响已配置的能力。

## 1. 安装并启动 ComfyUI

1. 打开 [ComfyUI 官方 Windows Portable 安装说明](https://docs.comfy.org/installation/comfyui_portable_windows)，按显卡类型选择安装包，解压到有足够空间的目录。
2. NVIDIA 便携版通常通过 `run_nvidia_gpu.bat` 启动；其他显卡使用对应官方包的启动方式。保留启动终端，关闭它会停止服务。
3. 等待终端提示服务地址，在浏览器访问 `http://127.0.0.1:8188`。若实际端口不同，以启动日志为准。
4. 已安装 ComfyUI 的用户可继续使用原环境；若缺少下文节点，按官方方式更新 ComfyUI 及其依赖，然后重启。

本文以 `D:\AI\ComfyUI_windows_portable\ComfyUI` 为 ComfyUI 根目录示例，请替换成实际目录。便携版的 `models` 位于内部 `ComfyUI` 文件夹，不能放在便携包最外层。

### 硬件与空间

模型文件大小不等于显存要求。能否生成还取决于显卡、驱动、PyTorch／CUDA、卸载策略、分辨率和帧数；当前项目没有统一的最低显存验收标准。先在 ComfyUI 中跑通对应模型的官方示例，再接入灵伴。

下面 Qwen 文件合计约 17.3 GB，H3 合计约 41.9 GB（十进制，按下载页面取近似值）。这是权重占用，另需给运行环境、下载缓存、视频和图集留空间。不要为了使用一个流程下载整个模型仓库。H3 仓库对 INT8 ConvRot 提供 PyTorch／CUDA 建议，使用前查看其 [模型说明](https://huggingface.co/Comfy-Org/MiniMax-H3)；无法运行时，可改用云端生成服务。

## 2. 下载模型并放到正确目录

点击表格中的文件链接，进入 Comfy-Org 的 Hugging Face 文件页面，选择 Download。保留原始 `.safetensors` 文件名。下表是灵伴当前默认绑定，不要将 Turbo、GGUF、其他量化版或同名近似模型直接替换进来。

### Qwen Image 2.1：生图／参考图编辑

| 灵伴字段 | 模型下载 | 约占空间 | 存放目录（相对 ComfyUI 根目录） |
| --- | --- | --- | --- |
| 生图 · Qwen 模型 | [qwen_image_2.1_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors) | 7.26 GB | `models/diffusion_models/` |
| 生图 · CLIP | [qwen3vl_8b_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors) | 9.35 GB | `models/text_encoders/` |
| 生图 · VAE | [qwen_image_2.1_vae_bf16.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/vae/qwen_image_2.1_vae_bf16.safetensors) | 676 MB | `models/vae/` |

模型及目录依据 [Qwen 官方 ComfyUI 模型页](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)。带 `pe_t2i`／`pe_i2i` 的文件用于提示词增强，不能填入生图 CLIP；当前灵伴工作流不默认启用 PE。

### MiniMax H3：从基础图生成动作视频

| 灵伴字段 | 模型下载 | 约占空间 | 存放目录（相对 ComfyUI 根目录） |
| --- | --- | --- | --- |
| 生视频 · H3 模型 | [minimax_h3_fl2va_pruned_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors) | 21 GB | `models/diffusion_models/` |
| 生视频 · CLIP | [qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors) | 15.7 GB | `models/text_encoders/` |
| 生视频 · VAE | [minimax_h3_video_vae_fp16.safetensors](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/vae/minimax_h3_video_vae_fp16.safetensors) | 5.21 GB | `models/vae/` |

灵伴当前生成无声动作视频，工作流只绑定视频 VAE，不要求额外配置音频 VAE。上游新模板可能选用其他 VAE 或音频分支，不要照抄其全部模型列表；当前兼容范围以灵伴代码及实际检查结果为准。

下载后重启 ComfyUI。如果使用模型子目录，灵伴中填写检查结果返回的相对名称，例如 `qwen/qwen_image_2.1_int8_convrot.safetensors`，不要填写 `D:\...` 绝对路径。已有共享模型库可按 [官方额外模型路径说明](https://docs.comfy.org/installation/comfyui_portable_windows#adding-extra-model-paths) 配置 ComfyUI 的搜索路径。

## 3. 确认所需节点

灵伴使用固定的 API 工作流，无需手动将工作流 JSON 导入灵伴。节点名称相似不代表接口兼容；仅下载权重不能补齐缺失节点。

- 生图：`UNETLoader`、`CLIPLoader`、`VAELoader`、`TextEncodeQwenImage21`、`KSampler`、`VAEDecode`、`SaveImage`、`LoadImage`、`InvertMask`、`JoinImageWithAlpha`、`EmptyLatentImage`。
- 生视频：`UNETLoader`、`CLIPLoader`、`VAELoader`、`MiniMaxH3ImageToVideo`、`BasicGuider`、`RandomNoise`、`KSamplerSelect`、`BasicScheduler`、`SamplerCustomAdvanced`、`VAEDecodeTiled`、`CreateVideo`、`SaveVideo`、`LoadImage`、`ImageScale`。
- 可选缓存：只有使用 `cache:true` 时才需要 `QwenImage21Cache`，首次配置可不开启。

先更新 ComfyUI 核心及依赖，再检查缺失项。H3 是 [ComfyUI 内置节点](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py)，不要仅因缺少它就随意安装同名第三方节点。Qwen 可参考 [官方工作流模板](https://github.com/Comfy-Org/workflow_templates)。如果当前稳定版尚无对应节点，请核对支持该模型的官方版本；更新后仍缺失时，记录版本及缺失列表反馈，不用近似节点强行替代。

## 4. 在灵伴中配置并检查

1. 启动 ComfyUI，打开灵伴 **应用设置 → 创作服务 → ComfyUI 配置**。
2. 填写基础地址，例如 `http://127.0.0.1:8188`，不要追加 `/prompt`、`/object_info`，也不要填浏览器工作流页面链接。
3. 点击 **保存 ComfyUI 配置**，再点击 **检查已保存配置**。检查不会读取尚未保存的修改，也不会生成图片、视频或下载模型。
4. 展开 **模型配置**，根据检查后提供的候选填入所需模型的完整相对文件名；默认文字只是预设，不代表文件已安装。
5. 再次保存并检查。需要生图时确认“生图：就绪”；需要本地视频时确认“生视频：就绪”。
6. 在生成服务优先级中启用 ComfyUI，并按需要调整生图／视频顺序。明确指定其他服务时，不使用这项自动选择。

连接检查通过仅代表服务可访问、所需节点及模型名称存在，不保证显存足够或实际推理成功。先让 Agent 生成一张基础图或一段短动作，确认输出后再批量制作八种状态。

当前连接不支持 ComfyUI 登录或 API Key 输入。`127.0.0.1` 指灵伴所在电脑；本机教程优先使用回环地址。

## 5. 配置后处理 Python

后处理在灵伴所在电脑运行，负责将视频转换成动作图集。它可以使用独立 Python 环境，无需与 ComfyUI 共用。下面是在 PowerShell 中创建专用环境的示例（需先安装带 `py` 启动器的 Python）：

```powershell
py -3 -m venv D:\AI\lingpet-processing
& 'D:\AI\lingpet-processing\Scripts\python.exe' -m pip install --upgrade pip
& 'D:\AI\lingpet-processing\Scripts\python.exe' -m pip install Pillow numpy av
& 'D:\AI\lingpet-processing\Scripts\python.exe' -c "import PIL,numpy,av; print('后处理环境就绪')"
```

在 **后处理与高级选项 → 后处理 Python 路径** 填写：

```text
D:\AI\lingpet-processing\Scripts\python.exe
```

填写可执行文件路径，不能填文件夹或带参数的整条命令。保存后再检查，看到“后处理：就绪”即可。也可使用已有环境，但安装依赖时必须使用这里填写的同一个 Python。仅生成基础图片、不导出动作时可以暂不配置。

**定向中断默认关闭。** 只有确认 ComfyUI 服务支持按 `prompt_id` 中断指定任务时才开启。关闭时仍可取消所属排队任务；运行中的任务可能无法立即停止，不会为取消一个任务而清空整个服务队列。

## 常见问题

| 提示或现象 | 处理方法 |
| --- | --- |
| 连接失败、拒绝连接 | 确认服务已启动，浏览器可打开相同地址；核对端口，确认修改后已保存。 |
| 返回 401／403 或登录页面 | 当前连接不支持鉴权；确认填写的是可直接访问的 ComfyUI API 基础地址。 |
| 缺少节点 | 更新核心及依赖、重启；核对上述精确节点名，并检查 ComfyUI 启动日志中的加载错误。 |
| 缺少 `qwenModel`／`h3Clip` 等 | 这些是灵伴配置键。对照模型表检查下载文件、存放目录、相对名称；保存后重新检查。 |
| 候选中没有下载的模型 | 确认文件下载完整且未变成 HTML／链接文件；检查是否放错实例或外层目录，重启 ComfyUI。 |
| 保存成功，检查仍失败 | 保存只记录配置，不安装模型或校验推理；按具体缺项处理。 |
| 后处理提示找不到模块 | 使用设置中的 Python 执行 `-m pip install Pillow numpy av`，避免把依赖装进另一个环境。 |
| 检查就绪，生成时显存不足 | 先降低分辨率或帧数并核对模型的运行要求；必要时使用云端生成，不能只凭权重大小判断显存。 |
| 升级后出现输入、维度或 VAE 错误 | 核对工作流与模型版本是否匹配；记录 ComfyUI 版本、灵伴版本及错误，勿仅改文件名冒充旧模型。 |

反馈时附上检查结果与已脱敏日志；不需要上传模型权重。模型许可证独立于灵伴的 MIT 许可证，使用和分享作品前请阅读相应模型仓库的许可。
