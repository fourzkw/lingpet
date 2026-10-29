# 发布内容与精简规则

0.6.10 起，DSH、Cursor、Codex 使用同一份现用资源清单。0.6.13 起三个宿主的默认发布包均不携带 Electron 二进制。保留 Electron 包的下载代码、版本与 checksums.json；排除该包的 dist 和 path.txt，不排除其他依赖的 dist。首次启动下载并校验，用户目录按版本缓存并跨宿主复用。0.6.12 起安装包仅保留 Claude 像素形象，其他形象独立分发。

## 角色与素材

`scripts/release-content.mjs` 仅收录 Claude 的像素动作与互动资源，包含八种状态、点击与摸头。保留清单的 JSON 与 JS 文件、应用图标、托盘图标及 Claude 的回退图集。

源工程继续保留历史素材、参考图、生成记录和未发布形象；这些内容不进入安装包。工作台不再预加载已退出选择列表的旧 ChatGPT 图集，未启用的草稿也不请求素材文件。现用 PNG 逐字节复制，不重编码、不降低画质。

执行 `node scripts/prepare-release-assets.mjs` 会刷新 package.json 的精确 assets 文件列表；`npm pack` 在 prepack 阶段自动刷新。新增内置形象时须在 characters.js 注册并提供完整动作和互动清单，构建发现缺少文件会失败。

## 宿主依赖

Cursor/Codex 构建器沿实际 Node 依赖关系复制 Electron、MCP、PNG、ZIP 等依赖，并保留所需嵌套版本及当前平台的可选原生模块。不会直接复制整个 package-lock 中的生产依赖列表。DSH 专用 schema 适配依赖不进入这两个宿主的依赖目录；DSH 的 npm 包仍声明该依赖。

排除依赖的测试、文档目录、类型声明和源码映射文件；保留运行代码、package.json、原生二进制及 LICENSE 等许可文件。解析导出映射时验证 package.json 的 name，避免误将 dist/cjs 下仅含 type 的元数据当成包根目录。

## 验证

- `node --test test/release-content.test.js`：资源白名单、导出映射、嵌套依赖、原生文件与许可保留、缺失必需依赖时构建失败。
- `scripts/test-cursor-package.mjs` 和 `scripts/test-codex-package.mjs`：隔离环境中的真实 Hooks 与状态桥接。
- 使用打包后的 Electron 运行 `scripts/release-runtime-smoke.mjs <运行时绝对或相对路径>`：在独立数据目录中验证工作台启动、全部现用形象与状态、两种显示版本、互动和分享包导出，不更新用户安装。导出失败时与未精简的源码比较，差异视为回归，相同的已有问题单独记录。0.6.11 已修复云羽龙姬的小数帧时长导出：按累计时间边界取整，每帧边界误差不超过 0.5 毫秒，避免逐帧取整导致总时长漂移。导入包仍要求有效的整数帧时长。

三个发布包应保持相同的程序与素材内容，确保共享运行时可以跨宿主复用。构建比较时应比较各发布包之间的摘要；源码树保留了历史素材，其前端摘要与发布包不同。

## 独立形象包

运行 npm run build:appearances，在 artifacts/lingpet-appearances-版本号 下生成鲸鱼娘、白羽龙姬、云羽龙姬的独立 .petpack，以及预览、元数据和 SHA256。每包含八种状态、点击、摸头及原图／像素两版。源码保留完整资源；安装包内不含这些资源，工作台按实际可用资源显示。

升级前已在使用的旧形象会从用户目录的旧共享运行时缓存复制到用户形象库，保留设置；找不到旧素材时明确报错，不覆盖原配置。已有社区形象不受影响。

打包后验证可在 release-runtime-smoke.mjs 的运行时路径后追加独立形象包目录，同时检查干净安装仅有 Claude、三个包的导入及所有动作播放与再次导出。
