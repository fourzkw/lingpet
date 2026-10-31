# 灵伴 · LingPet

让 AI 的工作状态，变成桌面上看得见的陪伴。

灵伴是一款 Windows 桌宠应用，可接入 **Codex、Cursor 和 DSH**，跟随会话播放思考、工作、等待输入、等待批准、完成等动作。你可以同时养多只桌宠，为它们选择不同形象和跟随方式，也可以制作并分享自己的作品。

[下载安装](https://github.com/fourzkw/lingpet/releases/latest) · [官网](https://lingpet.fourzkw.top) · [桌宠市场](https://lingpet.fourzkw.top/market) · [反馈问题](https://github.com/fourzkw/lingpet/issues)

## 可以做什么

- **跟随 Agent 会话**：自动跟随所有来源、指定来源，或固定到某个会话。
- **管理多只桌宠**：分别设置形象、名称、位置、大小、置顶和显示状态。
- **点击与摸头互动**：支持的形象可播放专属互动动作，文字气泡与摸头灵敏度可以调整。
- **切换外观**：支持原图与像素版本，具体以形象包提供的内容为准；工作台提供四套界面主题。
- **发现和分享形象**：浏览桌宠市场，安装或导入 `.petpack`，保留已安装的不同版本，按需切换与回退。
- **通过 AI 创作桌宠**：在宿主中使用创作工具与技能，配置生图、视频服务或 ComfyUI，制作自己的形象与动作。

## 下载与开始使用

当前支持 **Windows x64 本机环境**。

1. 在 [官网](https://lingpet.fourzkw.top) 点击 **下载 Windows 版**，浏览器会直接开始下载 `LingPet-Setup-<版本号>.exe`；也可以到 [GitHub Releases](https://github.com/fourzkw/lingpet/releases/latest) 手动选择附件。
2. 打开灵伴工作台，在 **我的桌宠** 中选择伙伴，点击 **显示到桌面**。首次安装默认“不跟随会话”，可直接待机陪伴、点击和摸头。
3. 想跟随 AI 工作状态时，进入 **Agent 接入**，选择已安装的 Codex、Cursor 或 DSH，点击 **安装接入插件**。
4. 按完成提示重新打开宿主、启用插件或审核 Hooks；新建会话并发送一条消息，确认接入页收到真实事件，再检查桌宠的跟随来源。若正在动作试映，点击 **恢复实时动作**。

安装程序包含 Electron、私有 Node.js 与所需运行环境，普通用户无需自行安装 Node.js。当前统一使用桌面安装包，Agent 接入由应用内管理。

安装后会在后台自动检查新版本：发现更新时只在 **应用设置** 入口显示红点，不弹窗。打开「应用设置 → 维护 → 版本与诊断」可查看更新说明，点击 **下载并安装** 后在应用内下载、校验安装包并自动重启完成升级，配置、桌宠与形象都会保留。

安装包内置 Claude 像素形象，其他形象可通过市场安装或导入本地 `.petpack`。市场展示静态封面；安装后可在工作台展开 **动作试映** 查看动作，点击旁边的 **恢复实时动作** 回到会话状态。

### 各宿主接入提示

| 宿主 | 安装后的操作 |
| --- | --- |
| Codex | 完全退出并重新打开，确认插件启用并完成 Hooks 审核，再新建会话验证。 |
| Cursor | 重新加载窗口或重新打开，新建 Agent 会话验证。 |
| DSH | 确认接入的是正在使用的配置目录和 profile，重启 DSH 后发送消息验证。 |

本体与接入插件独立版本；启动时仅自动更新内容发生变化的已安装接入。宿主重载或 Hooks 审核仍需按提示完成。

接入页显示配置已安装，并不代表已经收到真实会话事件。使用多套宿主环境时，可展开高级选项指定相应位置。

第一次使用请看 [快速开始](docs/getting-started.md)；安装位置、数据迁移和接入维护见 [安装与 Agent 接入](docs/desktop-installation.md)。

## 桌宠市场与作品分享

在工作台的 **桌宠市场** 中搜索作品，并按更新时间、下载量、仓库 Star、名称或包体积排序；也可以筛选画面版本、互动能力和更新时间。

- 安装后的形象保存在本机，下载完成后可离线使用。
- 发现新版后，在 **已安装** 中检查并下载更新，再选择是否切换；不会自动替换正在使用的形象。
- 从工作台导出 `.petpack`，放入公开 GitHub 仓库的 Release，提交仓库链接即可进入校验队列。
- 一个仓库可以发布多个形象，每个形象独立校验、展示与管理版本。
- 作者可以手动提交更新；市场默认每天排队检查来源与新版本，校验通过后上架。

市场默认以仓库所有者作为作者展示，使用仓库中的介绍与宣传封面；安装后的资料以形象包为准。

分享格式与示例见 [多形象仓库协议](docs/market-multi-pet.md)，也可参考 [作者形象仓库](https://github.com/fourzkw/fourzkw_pets)。

## 创作自己的桌宠

灵伴提供供 Agent 调用的角色、创作项目、生成任务、动作导出和形象导入工具。可以从文字描述或参考图开始，逐步制作形象与动作。

在 **应用设置 → 创作服务** 中配置服务，并调整生图与视频的调用优先级。可用的生成能力取决于宿主工具及你配置的服务；使用外部生成服务时，按该服务要求提供密钥并承担相应费用。普通会话状态跟随无需配置模型 API 密钥。

- [ComfyUI 安装、模型下载与配置](docs/comfyui-setup.md)
- [生成服务配置](docs/generation-services.md)
- [桌宠创作技能](skills/board-pet-creator/SKILL.md)
- [创作工具参数](skills/board-pet-creator/references/tools.md)

## 常见问题

**桌宠没有跟随会话？**

先查看 Agent 接入页是否收到真实事件，再检查当前桌宠的跟随来源。完成插件安装、更新或 Hooks 审核后，按提示重新打开宿主并新建会话验证。动作试映期间，先点击 **恢复实时动作**。

**关闭工作台后，桌宠为什么还在？**

工作台和桌宠共用后台。关闭工作台窗口会保留桌宠；需要完全退出时，请使用系统托盘菜单。

**如何升级或保留数据？**

运行更高版本的安装程序进行升级。数据与内容目录可在应用设置中查看和迁移；卸载默认保留设置与形象数据。详情见 [安装与数据目录](docs/desktop-installation.md) 和 [卸载与重装](docs/uninstall-and-reinstall.md)。

**支持 macOS、Linux、WSL 或远程 Agent 吗？**

当前桌面安装与接入面向 Windows 本机；其他桌面平台及跨 WSL、容器、远程主机的会话连接尚未提供。Go 市场服务可独立部署到 Linux。

## 从源码运行

桌面开发需要 Windows、**Node.js ≥ 22.19** 和 npm。先安装依赖，再启动工作台：

```powershell
git clone https://github.com/fourzkw/lingpet.git
cd lingpet
npm ci
npm start
```

查看动作演示：

```powershell
npm run demo
```

检查代码与运行测试：

```powershell
npm run check
npm test
```

构建 Windows 安装程序：

```powershell
npm run build:desktop
```

产物位于 `artifacts/` 下新建的构建目录。构建还需要可用的 Electron 二进制与 Windows .NET Framework C# 编译器，具体见 [桌面安装与构建说明](docs/desktop-installation.md)。

市场服务使用 Go，所需版本见 [go.mod](market/go.mod)。在仓库根目录执行：

```powershell
npm run market:dev
npm run test:market
npm run build:market
```

开发配置与 Linux 部署步骤见 [市场服务说明](market/README.md) 和 [部署配置示例](market/deploy/market.env.example)。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `desktop/` | Electron 桌宠、工作台与设置界面 |
| `src/` | 会话状态、桌宠管理、接入与创作逻辑 |
| `adapters/` | Agent 接入适配 |
| `market/` | Go 市场服务、网页与管理后台 |
| `skills/` | 供 Agent 使用的桌宠创作技能 |
| `assets/` | 图标、形象与动作素材 |
| `scripts/` | 构建、素材处理与验证脚本 |
| `test/` | Node.js 自动化测试 |
| `docs/` | 使用、接入、协议与部署文档 |

## 参与贡献

欢迎通过 [Issues](https://github.com/fourzkw/lingpet/issues) 报告问题、讨论功能，或提交 Pull Request。

报告问题时，请附上应用版本、Windows 版本、接入宿主及版本、复现步骤和相关日志。提交前请移除 API 密钥、会话内容与其他个人信息。

提交代码时，请说明解决的问题、最终行为和验证方式；界面调整建议附截图，接入逻辑调整请注明验证过的宿主。修改功能时同步更新相关文档，并运行对应测试。

## 授权与素材

项目代码与文档采用 [MIT License](LICENSE) 开源，允许使用、修改、分发和商业使用。再分发时请保留版权声明与许可证全文。

角色形象、动作素材与第三方依赖的权利及许可分别归其权利人所有。社区作品以作者提供的授权声明为准，代码授权不自动覆盖角色素材。
