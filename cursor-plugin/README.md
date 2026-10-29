# 灵伴 · Cursor 桌宠插件

0.2.0 支持多桌宠与独立跟随，共享运行时会安装到数据目录 shared/releases，而不是从本插件目录长期运行。与 DSH 同装时不会创建第二套后台或覆盖更高版本。

Windows 本机 Cursor Agent Chat 接入。插件用官方 Hooks 观察事件，独立 Electron 桌宠与 DSH 共用同一进程，不需要安装 DSH，也不需要额外模型 API Key。需要 PATH 中可用的 Node.js 22.19 或更新版本。

## 安装

本目录是插件模板，需先在主项目执行 `npm ci` 和 `npm run build:cursor`。构建结果包含 `runtime/`、生产依赖、Electron 下载组件和 Claude 像素素材；默认不携带 Electron 二进制，首次启动联网下载并校验，之后复用用户缓存；不包含用户配置、令牌或会话数据。构建包仅适用于其 build.json 指明的平台与架构。

将构建结果的整个目录放到 `~/.cursor/plugins/local/board-pet`。主项目也提供安装命令：

```powershell
node scripts/install-cursor-plugin.mjs artifacts/cursor-board-pet-0.1.0
```

安装脚本只管理 `board-pet` 目录；已有同名插件会先备份到 `~/.cursor/plugins/board-pet-backups/`，不动其他插件。安装后重启 Cursor，创建新的本机 Agent 会话。插件首次收到事件后自动连接或启动桌宠。如果本地插件已加载但没有事件，在主项目执行 `node scripts/install-cursor-user-hooks.mjs` 配置用户级直接接入（保留其他 Hooks，修改前备份）。侧边栏扩展 0.1.1 会自动处理该兼容路径。

## 使用和诊断

在安装目录执行：

```powershell
node runtime/bin/board-pet.js settings
node runtime/bin/board-pet.js doctor
node runtime/bin/cursor-control.js status
node runtime/bin/cursor-control.js stop
```

`stop` 仅停止 Cursor 桥接进程；下一条 Cursor Hook 会重新启动桥接。完整停用请先在 Cursor 停用插件或移出本地插件目录，再执行 stop。桌宠保持运行，DSH 连接不受影响。用户通过托盘退出桌宠后，自动唤起仍暂停，显式执行 `board-pet.js start` 恢复。

## 事件范围

- `beforeSubmitPrompt`：思考。
- `preToolUse`：执行；按 tool_use_id 维护并行工具集合。
- `postToolUse` / `postToolUseFailure`：结束对应工具；仍有其他工具时继续执行，否则恢复思考。单个工具失败不会被当成整个回合失败。
- `stop` 的 completed / error / aborted：完成 / 出错 / 中断。
- `sessionEnd`：结束该会话跟随。

重复工具事件、已结束回合的迟到结果不会覆盖当前状态。断线后补发当前会话状态，已完成的庆祝不会因重连重新播放。独立桥接维护心跳，长任务不依赖新的 Hook 维持连接。Windows 连续两次检测不到 Cursor 进程后退出桥接；正常 sessionEnd 后所有会话结束也会清理桥接。

首版不推测批准、自然语言提问、Tab 补全、云端/WSL/SSH 会话状态。多个 Cursor 窗口由会话 ID 隔离，共用一个本机桥接。Cursor 异常退出但另一个 Cursor 窗口仍存活时，缺少 sessionEnd 的会话可能保留最后状态；首版不以超时把正常长任务误判为完成或断线。

## 数据与权限

Hook stdin 只在内存解析，转发前仅保留事件名、会话/回合/工具 ID 和终止状态。提示词、文件路径、工具参数/输出、回复、邮箱与 transcript 均不转发和落盘。HTTP 服务只绑定回环地址，使用随机令牌并拒绝浏览器 Origin。不要分享 `%LOCALAPPDATA%/BoardAiPet/endpoint.json` 或 `cursor/endpoint.json`。

监听脚本对 preToolUse 不输出决策（空 stdout）；当前 Cursor 3.24.12 对默认非 failClosed Hook 将空输出解释为无决策。beforeSubmitPrompt 返回 `continue: true`。不返回 allow/deny、更新后的工具输入、批准请求或自动续聊消息。仍需在实际 Cursor 会话中验证与现有审批策略、其他 Hooks 的组合行为；本插件不提供代替用户批准的功能。

参考：[Cursor Hooks](https://cursor.com/docs/hooks)、[Cursor Plugins](https://cursor.com/docs/plugins)、[插件格式](https://cursor.com/docs/reference/plugins)。真实 Cursor UI 的版本兼容性与事件覆盖需在安装环境验收，自动测试覆盖 Hook 子进程、桥接、本机服务和 Electron 状态渲染。
