# Codex 接入（0.3.1）

Codex 原生插件使用官方生命周期 Hooks，加入现有共享桌宠服务，不需要安装 DSH 或 Cursor。工作台支持 Codex 自动跟随、全局自动跟随和指定 Codex 会话。所有形象和动作保持原样。

## ChatGPT 左侧桌宠入口

0.3.1 添加本地 MCP App，使用官方 `openai/ui.entrypoints` 的 `global` 注册左侧「灵伴桌宠」，同时注册会话内的 `thread` 入口。点击入口显示管理面板，可直接启动／显示桌宠、关闭全部桌宠和打开工作台。页面无需通过对话触发操作。

管理服务由插件启动，独立于 Electron 桌宠；关闭桌宠不会关闭入口。关闭全部桌宠会写入暂停标记，阻止 Codex、Cursor 和 DSH 自动重新拉起；点击启动或打开工作台会解除暂停。启动时恢复显示已启用桌宠，全部暂停时启用第一个；列表为空时创建跟随 Codex 的桌宠。

安装或更新后重启 ChatGPT 桌面版，以重新发现插件的 MCP 服务与左侧入口。Hooks 的信任审核单独影响会话状态同步，不影响手动启停。云端或未支持本地 MCP App 入口的客户端无法控制本机桌宠。

接口依据：https://developers.openai.com/plugins/build/extensions 。协议参考实现：https://github.com/openai/mcp-extensions/blob/main/docs/spec.md 。

## 独立控制面板（备用）

运行 `node bin/board-pet.js control` 会返回本机控制页面地址。在 ChatGPT 桌面版右侧浏览器打开该地址，即可点击“启动桌宠”“关闭全部桌宠”“打开工作台”。地址含本机访问凭证，请勿分享。

控制页面独立于桌宠运行，关闭全部桌宠后仍可再次启动；关闭会暂停所有来源的自动拉起。插件启用/禁用仅控制 Codex 事件接入，不等同于桌宠启停。该页面是本项目提供的本地控制入口，不会修改 ChatGPT 自身的工具栏或插件管理界面。普通浏览器也可打开。

## 安装插件

Windows 需要 Node.js 22.19 或更高版本（本机已具备）。构建产物包含 Electron 和运行时依赖：

```
codex plugin marketplace add D:/_Project/board_ai_pet/artifacts/codex-board-pet-0.3.1-win-x64
codex plugin add board-pet@board-pet-local
```

重启 Codex 或开始新的 Codex CLI 会话，在 `/hooks` 中审核并信任灵伴的八个事件 Hook。官方要求插件 Hooks 经过信任审核；安装程序不会修改信任记录或绕过审核。桌面版从插件管理页启用，按该版本提供的 Hooks 审核入口完成信任。

此插件没有 VSIX 侧边栏。桌面角色右键打开快捷控制后选择“打开工作台”，或运行 `node bin/board-pet.js settings`；在左侧列表选择桌宠，再将跟随规则改成“Codex 自动跟随”。停止或卸载插件只影响 Codex 的事件接入，共享桌宠及其他来源保留。已打开的会话需要重新加载插件才能应用变更。

## 事件和限制

### Windows 会话无法连接时

若八项都已信任，但真实事件仍在 3 秒时限内超时，完整插件中的 Electron、素材和依赖会增加 Codex 的插件内容校验成本。这项校验也包含在 Hook 超时内。可先启动桌宠，再运行 `node bin/install-codex-hooks.js` 接入官方用户级 Hooks：小型启动器从现有共享运行时读取当前版本，保留其他用户 Hooks，只禁用灵伴重复的八项插件 Hooks，并备份修改前的文件。它不会写入任何信任哈希；重新打开 Hooks 页审核八个指向 `BoardAiPet/codex/user-hook.cjs` 的新命令。桌宠运行时升级后启动器自动跟随 `shared/active.json`，无需固定版本路径。

审核后，在真实 Codex 会话发送一条消息，再运行 `node scripts/diagnose-codex-hooks.mjs --live` 只读检查桌宠主服务和 Codex 桥接的连接及会话数量。用户级接入使用实际共享运行时，不应使用临时会话向真实桌宠注入测试状态。

Windows 的 Codex command Hook 使用 `COMSPEC`（通常为 `cmd.exe`），与终端中使用 PowerShell 无关。插件的 `commandWindows` 必须写成 `node "%PLUGIN_ROOT%/runtime/bin/codex-hook.js" SessionStart`，不能写 `$env:PLUGIN_ROOT`。旧安装可运行 `node scripts/fix-codex-windows-hooks.mjs <插件根目录>` 修正；脚本备份 Hook 定义，不写入信任记录。

修正后重新打开 Codex 的 Hooks 管理页，审核八个变更后的命令。若仍看到旧命令，重启 Codex 后再审核。`node scripts/test-codex-discovery.mjs <codex.exe>` 可查询当前定义与信任状态；`node scripts/test-codex-package.mjs <插件根目录>` 使用真实 CMD 启动方式测试八个事件，测试数据与用户桌宠隔离。仅命令测试通过不能代表实际宿主已信任和派发事件。

- SessionStart/SessionEnd：待机/离线。
- UserPromptSubmit：处理中。
- PreToolUse：执行工具，支持识别 request_user_input 等待输入。
- PermissionRequest：等待批准，不返回允许或拒绝决策。
- PostToolUse：尚有并行工具则继续执行，否则处理中。工具失败不等于整轮失败。
- Stop：本轮结束动作；Interrupt：中断。

Hook 只发送白名单内的会话、回合、工具调用 ID 和状态，不发送聊天正文、路径、参数或工具输出。保留其他插件、用户 Hooks 与批准策略。并行调用和重复事件去重，不重放完成动作。

官方 Hooks 没有独立的整轮失败事件，本实现不从回答正文猜测失败，也不把单个工具的非零退出误报为整轮错误。Stop 表示回合已结束，其他 Stop Hook 可继续任务，此时新回合事件会恢复处理中。仅本地执行环境能连接本机桌宠；云端或远程环境不会自动连接 Windows 的本机服务。

官方接口：https://learn.chatgpt.com/docs/hooks 。CLI 与桌面版对 Hooks 的版本支持需要分别验证，安装成功不等于已经收到真实会话事件。

