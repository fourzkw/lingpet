# 灵伴 · LingPet

**0.7.14 本体优先架构（开发中）**：新增 Windows 独立安装包和工作台「Agent 接入」，本体携带运行环境，按需安装轻量 Codex、Cursor、DSH 接入。构建、使用和旧版迁移边界见 [独立本体安装](docs/desktop-installation.md)。下文 0.6.x 的完整插件安装方式作为历史兼容说明保留。

**桌宠当前版本 0.7.14**（以 package.json 为准）。安装包仅内置 Claude 像素形象；鲸鱼娘、白羽龙姬、云羽龙姬分别提供独立 `.petpack`，在工作台导入后使用，保留八种状态、原图／像素版本和点击、摸头动作。升级会从旧运行时缓存保留正在使用的旧内置形象及配置。支持 Windows 本机 DSH、Cursor、Codex 三种会话来源；网站服务独立版本见 market/VERSION。

0.6.19 修复 Codex 下载提示缺失：启动请求立即返回并由面板持续查询，始终显示 Electron 状态与首次下载说明，更新面板资源标识避免复用旧页面。

0.6.18 为 Cursor 侧边栏、Codex 管理面板和独立控制页补齐 Electron 下载进度，启动等待期间持续刷新状态。

0.6.17 新增 Electron 首次下载提示：DSH 终端和桌宠设置页显示下载大小、百分比、解压及失败原因。运行时未启动时也可查看进度。

0.6.16 显式声明创作工具所需的 Zod 4，避免在 DSH 中误用宿主的 Zod 3 而启动失败；DSH bundle 补丁改为纯 insert，兼容插件市场热挂载，不再修改宿主 HMR 开关。

首次使用请从 [安装与接入检查](docs/getting-started.md) 开始：选择宿主 → 检查环境 → 安装插件 → 显示桌宠 → 验证真实会话。下载对应宿主的发布包即可；下面的构建命令供源码开发使用。

0.6.15 修复健康运行版本与共享启动记录不同步、延迟启动器误回退，以及 Cursor 本地副本不更新的问题。新增卸载预览、保留数据卸载、备份后重置流程，见 [卸载与重装](docs/uninstall-and-reinstall.md)。默认发布包仍不携带 Electron 二进制。

支持按设置优先级通过生图 API、Seedance、MiniMax 或 ComfyUI 创作桌宠。配置与完整流程见 [云端生成说明](docs/generation-services.md)。

以下为历史版本记录；安装请使用下文当前版本步骤。

**0.6.1 品牌图标与网页同步。** 原创伴星图标替代汉字占位，覆盖桌面工作台、托盘、窗口、控制入口、Cursor 活动栏与网站 favicon。市场服务 0.4.13 同步纸感主页、作品列表、后台与四主题选择；网页主题由浏览器保存，与本机应用分别记忆。图标源文件及多尺寸导出位于 assets/brand。

**0.6.0 四套界面主题与工作台整理。** 默认「纸感手账」，可在「应用设置 → 界面主题」切换「像素工坊」「暖光夜桌」「终端脉动」，选择自动保存并同步到工作台、桌宠提示与快捷栏。角色原图／像素版本独立设置。工作台分为「外观与显示」「互动」「会话跟随」，九档大小刻度与动作试映放在实时预览旁；自动跟随时不要求选择会话，固定会话时才展示选择列表。启动、更新与诊断统一移至「应用设置」。市场默认收藏到形象库，明确选择后才新增桌宠或替换外观。

**0.5.0 完善互动与维护。** 社区形象可携带独立点击、摸头动作，内置形象导出也包含互动；旧八动作包继续使用通用回应。工作台可分别设置点击、摸头、文字气泡和三档摸头灵敏度，识别距离随桌宠大小变化。「应用与诊断」提供版本、开机启动、本地更新包安装进度和诊断导出；Windows Electron 运行方式也支持开机启动。「桌宠市场 → 已安装与版本」可检查同源已审核更新、保留旧版并离线切换／回退，只影响当前桌宠。

**桌面客户端 0.4.4 将桌宠市场集成到工作台。** 侧边栏「桌宠市场」可直接浏览封面、预览八种动作并切换原图/像素、安装桌宠，也能提交作品、查询进度和保存投稿凭证。市场预览不影响正在运行的桌宠和会话跟随。无需跳转浏览器，兼容现有市场服务0.4.7。

**市场后端 0.4.5 支持修改管理员用户名。** 在网页验证当前密码后更换登录名，新用户名随数据库保留，重启和升级均不重置。密码保持不变，其他旧会话失效。

**市场后端 0.4.4 简化首次部署。** 自动生成本次部署专属的初始管理员密码，首次登录后强制修改。密码保存在数据库，后续更新服务时保持不变；继续使用端口9633。

**市场后端 0.4.2 改为免登录投稿。** 投稿后凭编号和私密凭证查询进度；管理员使用独立账号密码审核，部署无需 GitHub OAuth App。兼容桌面客户端0.4.1，见 [集市说明](docs/market.md)。

**0.4.1 改进 Windows 安装。** 资源包和共享运行时的原子目录发布支持有限次数的文件占用重试；不会删除目标目录强制覆盖。

**0.4.0 新增灵伴集市。** 工作台支持浏览审核作品、从 GitHub 下载并进行包格式安全校验后安装、导出与导入 `.petpack` 分享包。新增 Go 后端，提供投稿、八动作预览、人工审核和版本记录（登录方式已在市场0.4.2调整）。Linux 使用 systemd + Nginx 部署，无需 Docker。默认域名 `lingpet.fourzkw.top`，正式服务需配置 DNS 和管理员密码后部署，见 [集市说明](docs/market.md)。

**0.3.13 品牌更新。** 应用名称统一为「灵伴」，工程包名为 `lingpet`，新增 `lingpet` CLI 命令。保留旧 CLI、接入协议、插件标识与 `BoardAiPet` 数据目录，已有桌宠及跟随配置继续使用。

本地打包：`npm pack --pack-destination artifacts`，生成 `lingpet-<package.json 版本>.tgz`。

**0.3.12 改进桌宠管理。** 界面名称统一为 Claude；我的桌宠列表为每只实例提供直接删除入口，使用工作台内确认框。支持删除最后一只后重新新增，不删除角色素材或其他实例。

**0.3.11 更新白羽龙姬。** 使用用户确认的第四版 Q 版形象，通过 MiniMax H3 制作八种动作，提供原图与像素版本。完成动作保留彩屑庆祝，共享色板保留金色道具和彩屑等小面积强调色，空闲眨眼缩短，休眠与等待使用持续段循环。替换 white-dragon 的素材绑定，保留实例、位置、跟随设置及旧素材备份；云羽龙姬与 DeepSeek 保持原样。

**0.3.9 对齐 Qwen-Image 2.1 生图工作流。** 文生图显式创建宽高画布，参考图编辑默认保留首图画幅；支持可选缓存、自定义采样器和尺寸。CFG=1 的负向词限制、参考图编号与透明背景边界同步写入创作说明；不默认启用 PE，也不自动提交素材生成任务。

**0.3.8 移除 Gemini 与旧版 DeepSeek 像素形象。** 工作台、右键菜单和创作工具统一提供 Claude、DeepSeek、ChatGPT。旧版 DeepSeek 配置自动使用新版鲸鱼娘；已选择 Gemini 的桌宠自动切换为 ChatGPT 云羽龙姬，保留名称、位置和跟随设置。新版 DeepSeek 继续提供原图／像素两版。历史素材仅保留为源码备份。

**0.3.7 更新 DeepSeek 鲸鱼娘。** 使用用户确认的透明形象，通过本机 MiniMax H3 制作八种视频动作，同步提供平滑原图和统一色板像素版。当前 DeepSeek 像素选择自动使用新素材，原有跟随与位置设置保持；旧像素形象已在 0.3.8 退出选择列表。此前停止制作的 GPT/Gemini 新生草稿保留在源码，尚未提供完整素材的形象不进入工作台列表。

**0.3.7 新增对话式桌宠创作工具。** 插件提供 ComfyUI 环境配置、项目/参考图/基础图版本、Qwen-Image 2.1 图像制作、MiniMax H3 单动作视频、任务查询/取消、媒体预览、原图/像素图集导出及新形象导入/激活。DSH 原生工具和 MCP 共用实现，Skill 随包分发，不新增一键创作页面。具体输入、依赖与限制见 [创作工具说明](skills/board-pet-creator/references/tools.md)。生成后端由使用者配置；优先宿主 imagegen，不可用时再使用 ComfyUI Qwen-Image 2.1。

**0.3.6 支持角色下保留多个形象，并分别选择原图 / 像素版。** ChatGPT 的白羽龙姬、云羽龙姬归入同一角色；工作台和右键菜单分为角色、形象、显示版本三级选择。旧桌宠自动迁移并保持原外观与跟随配置，详情见 [形象与版本说明](docs/appearances.md)。

**0.3.5 新增 ChatGPT · 云羽龙姬。** 以原图重新创作 Q 版基础形象，本机 MiniMax H3 生成八种视频动作，再统一抠像、像素化。新旧 GPT 独立可选，原有 GPT 的形象、动作和配置保留。工作台与右键菜单提供五角色选择，详情见 [云羽龙姬素材说明](assets/chatgpt-dragon/README.md)。

**0.3.4 新增桌宠右键快捷控制。** 右键可以切换角色、调整大小与置顶、选择跟随来源、隐藏或暂停当前桌宠；选择“打开工作台”才进入完整设置。ChatGPT 动作改用固定姿态的局部眨眼，并优化思考、打字、挥手、批准等待、庆祝、出错恢复和休眠的循环与衔接。

**0.3.3 新增 ChatGPT 与 Gemini 两个像素 Q 版桌宠。** 根据用户参考形象创作，风格与 DeepSeek 统一；各提供八种状态、64 个姿势。工作台支持四角色选择，悬浮按钮按四角色循环切换。角色外观与会话来源独立，所有角色均可跟随 DSH、Cursor 或 Codex。原始图集与生成提示词位于 `assets/chatgpt`、`assets/gemini`。

**0.3.1 新增 ChatGPT 左侧桌宠管理入口。** Codex 本地插件通过官方 MCP App 扩展提供“启动／显示桌宠”“关闭全部桌宠”“打开工作台”按钮。保留 0.3.0 的 Codex 状态跟随，Codex、Cursor 与 DSH 共用后台和桌宠列表。安装、重启与 Hooks 信任审核步骤见 [Codex 接入说明](docs/codex-integration.md)。

**0.2.0 已支持多桌宠和共享运行时。** 每只桌宠独立选择形象、位置和跟随规则：全局自动、DSH 自动、Cursor 自动或指定会话。任意宿主独立安装齐所需组件；同时安装时复用一个后台，不重复部署、不降级覆盖。详见 [多桌宠使用与安装说明](docs/multi-pet.md)。该历史版本安装包为 `dsh-board-pet-0.2.0.tgz` 和 `board-pet-sidebar-0.2.0.vsix`。

本机 DSH 会话状态桌宠，Windows 优先，适配 DSH `0.2.1-rc.2`。Claude 的八种状态全部使用 128×128 独立姿势帧，共 64 帧：空闲观察与眨眼、思考挠头、持续敲键盘、挥手等待输入、举盾等待批准、完成跳跃、出错恢复、入睡与休眠。身体播放真实姿势帧，提示符与粒子独立播放，不对 Claude 身体做拉伸或像素形变。打字时上半身固定，双手始终在键盘附近；批准和休眠只循环等待／睡眠段，完成和出错进入动作只播放一次。DeepSeek 也已按既有鲸鱼娘形象补齐八状态、64 张独立姿势帧，包含观察眨眼、托腮、持续打字、挥手、举盾、庆祝、出错恢复和入睡；同样使用单次进入与稳定循环，身体不再做像素形变。原始角色素材与 v1 样板保留，当前分别使用 assets/claude/actions-v2 和 assets/deepseek/actions-v1 图集。

## 安装到 Cursor

侧边栏管理现已提供 VSIX 编辑器扩展，安装与当前发布配套的 `artifacts/board-pet-sidebar-<版本>.vsix` 后，活动栏出现“灵伴桌宠”，可打开/关闭桌宠、打开工作台并刷新状态。命令面板也可搜索“灵伴”。0.1.1 增加用户级 Hooks 兼容注册，并修复 Windows PowerShell 输入 BOM 导致真实对话无法接入的问题。如安装后没有出现，执行 `Developer: Reload Window`。侧边栏说明见 [cursor-extension/README.md](cursor-extension/README.md)。

已实现 Windows 本机 Cursor 原生插件，通过 Hooks 同步思考、并行工具执行、完成、出错和中断。DSH 与 Cursor 共用桌宠；工作台支持来源识别与筛选。

```powershell
node scripts/build-cursor-plugin.mjs artifacts/cursor-board-pet-local
node scripts/install-cursor-plugin.mjs artifacts/cursor-board-pet-local
```

构建目录必须不存在；后续构建使用新的目录名。安装后重启 Cursor 并创建新的 Agent 会话。需要 PATH 中 Node.js >=22.19，构建包包含生产依赖和 Electron 下载组件，默认不携带 Electron 二进制；首次启动下载并校验运行时，之后复用用户缓存。首次准备无需 DSH 或模型 API Key。详见 [Cursor 插件说明](cursor-plugin/README.md) 和 [接入架构](docs/cursor-integration.md)。实际 Cursor 版本及审批组合行为仍需现场验收，自动测试覆盖真实 Hook 子进程、本机桥接和桌宠渲染。

## 安装到 DSH

使用发布的 .tgz 无需自行构建。源码开发者可在项目目录执行 `npm ci`、`npm run check` 和 `npm pack --pack-destination artifacts`，生成 `artifacts/lingpet-<package.json 版本>.tgz`。

本机 DSH Web 版安装命令：

```powershell
dsh plugin --profile web add "file:C:/LingPet/lingpet-0.6.19.tgz"
```

路径与文件名需替换为你实际下载的插件包位置及版本。插件尚未发布到 npm，因此目前不能通过公共包名安装。

运行中的DSH推荐通过应用内插件管理安装，以便立即应用。插件使用纯 insert 补丁，不修改宿主 HMR 设置；如果用户配置关闭HMR，需先在DSH中启用，否则仍需要重启DSH。**profile必须匹配你正在使用的DSH实例**。DSH Desktop 用户应在应用内插件管理安装，或先初始化Desktop、退出应用，再用Desktop提供的 `dsh` 命令执行 `dsh plugin --profile desktop add <包路径>`；普通npm安装的DSH命令不能管理Desktop profile。

插件首次启用会自动：

1. 查找同一用户的桌宠进程；存在时直接连接。
2. 准备Electron运行时。依赖已带运行时则复用，否则从Electron发行源下载，校验SHA256后放入用户数据目录；首次准备需要网络。
3. 启动透明桌宠和托盘，自动连接本机事件服务。
4. 同步已有活跃会话的状态，继续观察后续事件。

不需要手工填写端口，不需要API密钥，不调用大模型。灯板通信和固件按当前要求暂缓，未包含设备配对功能。远程DSH、容器、WSL到Windows桌面的跨环境连接尚未实现。

## 在DSH中热更新

0.1.1起，在运行中的DSH插件管理页安装新版；若界面没有更新按钮，可先卸载旧插件，再安装新版包。正常情况下DSH进程和进行中的Agent会话保持运行，插件重新挂载后同步当前活跃会话。

- 插件代码或配置重载：注销旧监听，再挂载新监听。快速重载会保留来源ID与事件序号，并延迟断开通知，减少界面闪烁。
- 界面或角色素材变化：桌宠窗口重新加载页面，保留当前会话、位置与设置。
- 桌宠主进程代码变化：仅自动重启桌宠，随后恢复会话快照并重连；窗口可能短暂消失，DSH无需跟着重启。
- 新旧包内容相同：直接复用现有桌宠。多个来源连接时忽略低版本包发来的降级请求。

首次从0.1.0升级时，旧桌宠没有更新接口，需要从托盘退出后重新启动桌宠一次（可执行下文的 `board-pet start` 命令）；DSH可保持运行。之后使用上述自动更新流程。

热更新受DSH自身HMR能力约束。涉及宿主模块变化、包路径移动等情况，DSH可能明确提示需要重启，应以插件管理页的应用结果为准。插件不会修改DSH核心或覆盖用户明确关闭HMR的设置。此功能不包含远程自动检查版本或自动下载新版插件。

## DSH 设置页

安装0.1.7后，打开DSH「设置 → 桌宠」。页面直接使用DSH原生配置表单，可修改自动启动与显示子Agent；保存写入当前profile，带版本冲突保护，无需重启DSH。恢复继承配置会移除这两个选项的用户覆盖。启停插件仍在DSH插件管理页。

页面还提供「桌宠运行状态」：显示运行中／未运行与PID，并有「启动桌宠」「关闭桌宠」「打开工作台」三个按钮。它们经DSH Web服务器的同源路由 `/board-pet/status|start|stop|dashboard` 调用宿主插件；关闭桌宠等同于托盘「退出桌宠」，会退出桌宠进程并写入暂停标记，之后再点启动即可恢复。DSH Desktop 的页面不走Web服务器，按钮会提示改用DSH Web。

「桌宠」页签由插件包里的浏览器 bundle（`dsh.client` + `./client` 导出）注册。DSH 的客户端模块扫描只对**裸包名**解析 `package.json`，所以 `cordis.patch.yml` 里必须以 `name: lingpet` 挂载宿主插件；写成子路径 `dsh-board-pet/plugin` 时该扫描会静默跳过整个包，设置界面就不会出现页签（0.1.6 已修复）。管理按钮的宿主路由要求0.1.7。升级后如果DSH仍在运行旧实例，请刷新DSH页面或重启DSH。

此入口不增加左侧栏项目。角色、外观和试映仍通过桌面工作台管理；高级数据目录仍由插件配置文件设置。关闭自动启动不会退出已运行的桌宠，关闭显示子Agent会清除该来源已展示的子会话；要退出桌宠请用「关闭桌宠」按钮或托盘菜单。

## 使用

- 轻点角色会点头回应；不按鼠标，在头部来回移动几次会触发眯眼轻晃和爱心提示。Claude 和三个独立形象包均拥有点击、摸头动作；互动结束后恢复会话状态，新会话状态会立即接管。
- 按住并移动角色可拖动位置，右键角色打开快捷控制，在菜单中选择“打开工作台”进入完整设置。
- 角色下方悬停按钮可打开设置、切换角色、隐藏角色。
- 工作台支持角色切换、大小、置顶、状态提示、多会话选择和动作试映。
- 默认优先显示等待批准／输入的会话，再显示最近活动会话；点击会话可固定跟随，点击“自动跟随”解除固定。
- “动作试映”只影响桌宠，不向Agent发送输入，也不替用户批准操作。
- 关闭工作台不退出桌宠。隐藏角色后，托盘菜单可以恢复。
- 从托盘“退出桌宠”会暂停自动唤起，防止插件把用户主动关闭的程序立即重启。安装版可执行 `dsh plugin --profile web exec board-pet start` 恢复；项目源码可执行 `node bin/board-pet.js start`。Desktop用户使用匹配的Desktop命令与profile。

本地开发：

```powershell
npm ci
npm start
# 打开设置
node bin/board-pet.js settings
# 仅试映，不连接模型
npm run demo
# 连接诊断
node bin/board-pet.js doctor
```

如npm脚本找不到Electron运行时，可用 `node bin/board-pet.js start`，它会执行同一自动准备流程。

## 状态语义

| DSH事件 | 桌宠状态 |
| --- | --- |
| `turn/start`、`step/start` | 处理中 |
| `tool/call`、`tool/result` | 执行工具／恢复处理中，按并行工具集合计算 |
| `ask_user_question` | 等待用户输入，直到该工具返回 |
| `approval/asked`、`approval/decided` | 等待批准，直到所有待定批准均结束 |
| `turn/end` + `completed` | 本轮完成，短暂庆祝后回空闲 |
| `turn/end` + `aborted` | 已中断，不显示成功 |
| `turn/end` + `error`／`max-tokens` | 出错 |
| 失去来源心跳／插件卸载 | 连接断开 |

普通自然语言回复中隐含的“请你补充信息”不做猜测识别；仅工具化提问有明确的等待输入事件。休眠为当前手动试映状态。单个工具失败不等于整个回合失败。完成不保证用户整个项目目标已实现。

## 配置与数据

DSH插件配置见 `cordis.patch.yml`：

```yaml
- id: hmr
  disabled: false
- insert:
    - id: board-ai-pet
      name: dsh-board-pet
      config:
        autoStart: true
        includeSubagents: false
```

也可设置 `dataDir` 为绝对路径，覆盖默认数据位置。

配置保存为 `settings.json`，每次有效变更前将上一份有效配置原子写入 `settings.json.bak`；重复保存相同设置不会覆盖旧备份。启动时验证 JSON 与桌宠配置，损坏或丢失则自动恢复有效备份；两者均不可用时保留损坏文件并使用默认设置。恢复后自动打开工作台，应用设置显示恢复结果与保留文件名；也可点击「恢复配置备份」手动恢复，当前配置会另存为 `settings.json.before-restore-*.json`。损坏文件保留为 `settings.json.corrupt-*.json`（损坏备份为 `settings.json.backup-corrupt-*.json`）。权限、磁盘等 I/O 错误会明确报错，不会静默重置。

Windows默认数据目录是 `%LOCALAPPDATA%/BoardAiPet`。环境变量 `BOARD_PET_DATA_DIR` 可覆盖，适合隔离测试。目录内保存设置、带认证凭证的本机连接描述和按需下载的运行时；不保存会话正文。不要分享 `endpoint.json`。

本地服务只绑定 `127.0.0.1`，使用随机认证凭证，拒绝浏览器Origin请求；窗口开启sandbox/contextIsolation，未暴露通用Shell或任意文件访问。插件只发送白名单元数据，会话ID、回合ID、事件序号和状态，不发送提示词、工具参数或工具输出。

## 测试

```powershell
npm test
npm run check
npm run test:dsh
npm run test:desktop-hot
```

新增配置恢复与连接生命周期回归：`node --test test/settings-recovery.test.js test/bridge-lifecycle.test.js`；实际工作台恢复流程：`node scripts/test-settings-recovery.mjs`。

若连接测试出现 `fetch failed`，先检查异常的 `cause.code`。受限执行环境可能禁止 `127.0.0.1` 回环连接并返回 `EACCES`，继而引起 Hook 超时和清理失败；应在允许本机回环连接的环境重跑，不能据此直接判断桌宠连接失效。连接测试使用独立临时数据目录，不应对日常桌宠注入测试状态。

`test:dsh`使用已安装的真实DSH Cordis和SessionStore，测试不调用模型；可用 `DSH_PACKAGE_PATH` 指定DSH的package.json路径。测试在项目内临时目录运行，不改动日常DSH配置。

`test:desktop-hot`启动真实Electron，验证页面热刷新、主进程替换及会话恢复。`scripts/test-native-hmr.mjs`用于本机已有隔离DSH测试profile的完整插件管理流程验证，结果见 `artifacts/native-hmr-results.json`，不是全新环境的通用测试入口。

桌面自动检查输出在 `artifacts/desktop-smoke/`，包含截图和结果。源码主要分为 `src/plugin.js`（宿主接入）、`src/dsh-observer.js`（事件归一化）、`src/state-store.js`（会话状态）、`src/bootstrap.js`（自动准备）、`desktop/`（桌宠与工作台）。

## 当前边界

- Windows本机已验证；macOS/Linux尚未验证。
- 透明窗口、大小调整与鼠标穿透仍需在更多DPI、多屏、全屏软件环境验证。
- Windows 已提供开机启动注册与本地更新包安装；应用本体尚未提供远程版本检查。市场形象的同源审核版本检查与离线回退已实现。独立安装器尚未提供。
- 已实现 DSH、Cursor、Codex 本机接入；Codex 插件与 Hooks 配置见 [Codex 接入说明](docs/codex-integration.md)。通用 Agent 安装管理、灯板通信与跨环境连接尚未实现。
- 角色是非官方二创。当前素材与代码按私有项目处理，未声明可自由再分发授权。

接口来源：DSH [架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[插件开发](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)、[CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)。






### 新建独立角色

通过 MCP 工具 `board_pet_character` 创建或列出角色，创建后的角色 ID 可交给创作工具作为 `character` 使用；导入完整的八种动作形象后即可在工作台切换。角色及其形象保存在用户数据目录，重启后保留。

工作台通过一个「显示桌宠／隐藏桌宠」按钮控制当前桌宠，隐藏时保留配置和会话跟随。大小使用水平刻度条调节，共九档，从 50% 到 150%，中间第五档为正常大小 100%；右键快捷栏顶部直接显示相同刻度条，拖动立即生效并自动保存。快捷栏支持方向键调整、Esc 关闭，点击外部也会关闭。
