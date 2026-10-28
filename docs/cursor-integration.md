# Cursor 接入实现

0.1.1 实机修复：Cursor 3.24.12 的本地插件被发现不等于 Hooks 已实际执行。侧边栏在注册 API 不可用时，合并用户级 hooks.json，直接使用本地插件脚本绝对路径；配置幂等，已有用户配置先备份，其他策略原样保留。Windows Cursor 的 PowerShell `$OutputEncoding = Encoding.UTF8` 管道会在 stdin 添加 BOM，Hook 入口需在 JSON.parse 前移除。测试使用同一 Windows PowerShell 管道重现，并已在真实 Cursor Agent 对话中确认 beforeSubmitPrompt、stop 到桥接与桌宠的链路。

入口为 `cursor-plugin/.cursor-plugin/plugin.json` 和 `hooks/hooks.json`，通过 `scripts/hook.cjs` 调用随包 runtime 内的 `bin/cursor-hook.js`。Hook 先归一化并剔除正文，再发给独立的本机桥接。首次连接有短时等待，正常事件只需一次本机请求；桥接准备 Electron 和下载运行时不会阻塞 Agent。

`src/cursor-service.js` 使用随机令牌的回环 HTTP 接收事件，复用现有 BridgeClient 发送心跳、断线重连和来源注销。原子文件锁阻止多窗口同时启动重复桥接，进程崩溃后的死锁会在下一次事件到来时回收。桥接服务不提供通用 Shell 或文件访问。

`src/cursor-observer.js` 按 conversation_id 隔离会话，generation_id 标识回合，tool_use_id 维护并行集合与完成墓碑。相同事件幂等，旧 generation 和已终止回合的结果被丢弃；终止事件才决定全回合完成、失败或中断。首版不实现子 Agent 独立展示、批准与提问推断。

统一协议增加来源白名单 dsh/cursor，缺失来源默认 dsh，兼容原 DSH 桥接。工作台显示来源并支持来源筛选。桌宠、设置、动画仍由原运行时统一管理。

构建：`node scripts/build-cursor-plugin.mjs artifacts/cursor-board-pet-0.1.0`。构建器复制运行时代码、素材和 package-lock 中已安装的生产依赖，包含当前平台 Electron。每次使用新的输出目录，不混入旧文件。安装：`node scripts/install-cursor-plugin.mjs <构建目录>`。插件依赖 PATH 中 Node.js >=22.19，首版仅面向 Windows 本机。

测试：`npm run test:cursor` 和 `npm test`。包括真实 Hook stdin/stdout 子进程、本机服务认证与来源隔离、并行工具/重复事件/旧回合、重连补发、心跳、停止桥接不关闭共享桌宠。真实 Cursor 会话须在已安装兼容版本中进一步验收；自动测试不调用模型、不发送任务到用户的 Cursor 会话。
