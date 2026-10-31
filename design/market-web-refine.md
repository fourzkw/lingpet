# 官网 / 集市 / 后台：排版与视觉细化（refine 层）

> 目标：不动任何 HTML 结构与 JS 钩子，只把 `market/web` 的**间距节奏、字号层级、栅格密度、交互反馈**重排一遍。
> 涉及页面：`/`（官网 index.html）、`/market`（集市 market.html）、`/admin`（管理后台 admin.html）。

## 1. 改版前的问题（对照真实 HTML 结构核过）

| 位置 | 现象 | 原因 |
| --- | --- | --- |
| 全站 | 标题节奏偏散 | `companion.css` 把 `--font-display` 覆盖成雅黑后，`h1` 仍沿用 `letter-spacing:-2px; line-height:1.5`（大字距 + 松行高互相打架） |
| 首屏 | 左右两栏高低不齐 | `.landing-hero` 是 `1fr 1fr`，右侧 `.companion-scene` 固定 490px，绝对定位的便签/贴纸在大约 780–1050px 之间容易互相压 |
| 首屏 | 场景元素在窄屏叠压 | 所有场景子元素都是 `position:absolute`，`480px` 档只改了外框尺寸，没有收起便签与贴纸 |
| 下载区 | 只有一张 640px 卡片，右侧大片空 | `style.css` 里 `.download-page #downloadCards{grid-template-columns:minmax(0,640px)}`，而 `home.js` 现在只注入一张卡 |
| 集市 | 桌面固定 3 列，中间档挤 | `.cards` 是 `repeat(auto-fill,minmax(240px,1fr))` 但在 `.public-site` 下被改成固定 3 列 |
| 集市 | 筛选器是一排松散的表单 | 三条 `.market-browse-filters{display:flex}` 规则写在 `style.css` 正文，没有视觉容器 |
| 后台 | 统计固定 4 列、tab 是下划线、表头松散 | `.stats-grid{repeat(4,…)}`、`nav:not(.site-nav)>button` 的下划线 tab、`th/td` padding 14/16 |
| 全站 | 页面滚动后没有导航上下文 | 没有吸顶页头，跳锚点会被页头挡住 |

## 2. 做法：加一层 `refine.css`，而不是改老文件

```
style.css
├── @import './site.css'        基础排版（保留）
├── @import './companion.css'   .public-site 命名空间的组件外观（保留）
├── @import './refine.css'      ★ 新增：本文件，最后加载
└── #admin-queue 两张宽表的最小宽度、#queueSummary / #queueUpdated 两条文案规则（保留）
```

* 只新增一个文件 + 改 `style.css` 的 import 链，HTML 与 JS 一行没动，类名/ID 全部兼容。
* `style.css` 里删掉了两条会**压住** refine 的规则：`.download-page #downloadCards{grid-template-columns:minmax(0,640px)}` 与三条 `.market-browse-filters{display:flex…}`（它们位于 import 之后，特异性还相同，会直接盖掉 refine）。下载区改用左右分栏 grid，筛选器改用托盘式 grid。
* 回滚方式：删掉 `style.css` 里 `@import url('./refine.css');` 这一行即可，其余文件不需要还原。

## 3. 改了些什么（按区块）

**令牌（只在 `.public-site` 上定义，不污染主题变量）**
`--page-max:1200px`、`--gutter:clamp(20px,4.4vw,48px)`、`--stack-1/2`、`--section-gap:clamp(52px,6.4vw,92px)`、`--lead-size:15px`、`--body-size:12.6px`；后台页没有 `.public-site`，用 `var(--page-max,1200px)` 兜底。

**页头**：吸顶 `sticky` + 半透明 `color-mix(in srgb,var(--bg) 78%,transparent)` + `backdrop-filter:blur(16px) saturate(1.5)`；brand 图标 43→32px、字 25→21px；导航 12.5px 带下划线动画；主题选择器变胶囊；右上「下载」按钮 38px 胶囊；`scroll-padding-top:92px` 保证锚点不被压。

**首屏**：`minmax(0,1.04fr) minmax(0,.96fr)` 略偏左栏；标题 `clamp(36px,4.4vw,58px)/1.24/-.02em`（负字距配紧行高才成立）；eyebrow 变成带 accent 描边的小胶囊；说明文字 15px/2.02、限宽 31em；场景高度 `clamp(400px,38vw,500px)`。

**工具条**：从一条上下分隔线升级为带边框、圆角 16px 的胶囊卡片（`justify-content:flex-start` + `.ribbon-end{margin-left:auto}`）。

**特性卡片**：`flex` 竖向排列，插图区 `margin-top:auto` 对齐到底部，卡片 hover 上浮 4px。

**双角色区**：`.92fr/1.08fr` 让角色图区略宽；卡通「照片」加纸片阴影 + hover 微旋转。

**下载区**：整段改成两列 grid——左列标题/说明，右列放卡片（`grid-column:2; grid-row:2/span 2`），一键安装卡内部再拆成 54px 图标 + 两行文字网格，右侧留白消失。

**安装步骤**：`<details>` 变为可点开的卡片，序号变成 26px 圆角数字块，展开时 accent 描边。

**结尾 / 页脚**：closing-note 加径向渐层；页脚两端对齐。

**集市**：hero 改 `minmax(0,1fr) minmax(0,372px)`；tab 变成胶囊分段控件（active 用 accent 实底）；筛选器变成 `repeat(auto-fit,minmax(146px,1fr))` 的外框托盘；卡片栅格改 `repeat(auto-fill,minmax(226px,1fr))`（桌面最多 4 列，随宽度自然收敛）；封面改 1:1 方形；卡片 CTA 变胶囊、hover 时前景反色；`.market-invite` 换成两端对齐的提示条。

**后台**：`nav.admin-nav>button` 改成胶囊 tab（必须用这个选择器才压得住 `nav:not(.site-nav)>button`）；`.stats-grid` 改 `auto-fit minmax(184px,1fr)`；表格收紧 padding、表头大写小字、隔行底色、外层 `.table-scroll` 圆角 + `max-height:540px`；登录面板 400px 居中。

**响应式（三档，全部在 refine.css 自己的媒体查询里重新声明）**
| 断点 | 主要变化 |
| --- | --- |
| `≤1080px` | 首屏 / 特性 / 双角色 / 集市 hero / 下载 / 安装 全部单列；场景 440px 居中；下载卡回落到左对齐 |
| `≤820px` | 页头收紧；首屏按钮纵向铺开；卡片 2 列；tab 撑满整行；筛选器托盘变窄（132px）；集市工具栏占满 |
| `≤560px` | gutter 20px；`h1 clamp(29px,8.4vw,36px)`；场景 360px，**隐藏便签/贴纸/顶线/涂鸦**并把猫咪图改成 `right:4%/bottom:92px/height:190px` 防叠压；卡片与筛选器单列 |

**动效与可访问性**：只在 hover/active 上做位移与透明度，全部 `transition` 走 120–260ms；`@media (prefers-reduced-motion:reduce)` 关掉所有动画与平滑滚动；`prefers-contrast:more` 加深描边；`:focus-visible` 统一 accent 光环。

## 4. 主题兼容

* 全文件 **0 个硬编码颜色**（审计脚本统计 `#hex` / `rgb()` / `hsl()` = 0），只用 `theme-tokens.css` 的 `--bg/--surface/--surface-soft/--line/--line-strong/--text/--muted/--accent/--accent-soft/--accent-text/--font-ui/--font-mono/--radius/--control-radius` 与 `color-mix()`。
* 因此四套主题（纸感手账 / 像素工坊 / 暖光夜桌 / 终端脉动）只要换 `data-theme` 就整体生效，两套深色主题不需要单独覆盖。
* `!important` 只出现在 `prefers-reduced-motion` 块里的 4 行（约定俗成的写法）。

## 5. 验证做了什么（本机无图形环境，靠静态核对）

1. **CSS 语法与 import 解析**：`npx --no-install esbuild market/web/style.css --bundle --outfile=tmp-shots/bundle.css --loader:.svg=file` → 77205 字节、0 warning、无残留 `@import`。
2. **级联模拟**：自建脚本把打包后的四层 CSS 按「媒体查询求值 + 特异性 + 声明顺序」跑了一遍，在 1440/1280/1200/1080/1000/900/820/780/720/560/480/390/320 十三个宽度上逐元素求最终值，确认：页头 `padding-block 13→11px`、首屏两栏→单栏、卡栅格 4→2→1 列、场景高度 500→440→400→360、tab 由 inline-flex 变整行、下载区两栏→一栏……都在预期断点生效（这层模拟的意义是抓「refine 的桌面规则意外压掉 companion 窄屏规则」这一类问题）。
3. **服务端真实伺服**：Go 测试 `go test .` 全绿；`market/brand_pages_test.go` 的资产 200 断言里新增了 `/refine.css`，另用临时测试确认 `/refine.css` 经 `//go:embed web/*` 正常返回且内容包含 `.public-site .landing-hero`、`--page-max`、`@media (max-width: 560px)`、`prefers-reduced-motion`，三个页面都引用了 `/style.css`。
4. **Node 侧**：`test/market-package`、`market-links`、`release-content`、`settings-page`、`ui-themes` 逐个直跑 38 个用例全通过（整套 `npm test` 在本沙箱下会因 runner 需要 spawn 子进程而 `EPERM`，与本改动无关）。

**没做到的**：本机 `Electron` / `Chrome` 均无法启动（沙箱禁止命名管道，`platform_channel.cc:112 Check failed: . : 拒绝访问。(0x5)`），所以没有像素级截图。视觉回归请在有图形环境的机器上跑一次截图脚本，重点看四个尺寸：1440（两栏比例）、1080（单栏切换点）、820（卡片 2 列 + tab 撑满）、390（场景元素收起后是否仍有叠压）。

## 6. 已知取舍

* 页头吸顶会让首屏内容整体下移约 30px，换来滚动时始终有导航与主题切换；如果更想要「极简首屏」，把 `.public-site header{position:sticky}` 改成 `position:relative` 即可。
* 集市卡片桌面最多 4 列（`minmax(226px,1fr)`），在 1240px 内容宽下每张约 285px，比原来的 3 列更密；若希望回到 3 列，把 minmax 改成 `280px`。
* 卡片封面由竖版（1.12）改为 1:1，`.pet-cover canvas` 的 `inset:12px` 已同步到 `5px 10px` 内边距，像素画不会被裁。

## 7. 独立静态审查后的修复（第二轮）

初版写完后做了一次「只读、不碰浏览器」的独立审查：把四层 CSS 解析成 740 条规则，逐条比对特异性、断点与旧层媒体规则，并按 WCAG 公式实算四套主题的对比度。结论是**有 1 条阻塞问题 + 4 类漏网**，已全部修掉：

| 级别 | 问题 | 修法 |
| --- | --- | --- |
| 🔴 阻塞 | ≤1080 单列后集市插画仍是 `position:absolute`（`companion.css` @480 的 `.market-hero-art` 定位没被复位），430 宽时 230×200 的插画会压住 h1 第二行与描述 | @1080 块里把 `.market-hero-art` 改回 `position:relative; inset:auto; width:100%; max-width:340px`，让它成为单列的第二行 |
| 🟠 | ≤780 触摸演示卡 `min-height` 被 refine 的 `min-height:auto/0` 压掉，插画 absolute 定位后被 `overflow:hidden` 裁切 | @820 补 `.touch-card{min-height:260px}` 并把 `.touch-illustration` 改回 `position:relative` |
| 🟠 a11y | 表单 `:focus` 规则把 `outline` 去掉，替代品只有 14% alpha 阴影（四主题实测 1.22–1.35:1，低于 3:1），`forced-colors` 下等于不可见 | 改成 `:focus:not(:focus-visible)` 才去 outline，另补 `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`；阴影提高到 22% |
| 🟡 | 旧 `@420` 档字号（导航 11px、主按钮 11px）被 refine 常驻值永久覆盖 | @560 补回 `.site-nav a{font-size:11px}`、`.hero-actions .button{font-size:11px;padding:11px 15px}`、`.brand{font-size:22px}` |
| 🟡 | 全局 `header,main,footer` 的 `padding-inline` 固定回退 48px，后台页在窄屏不再收边距 | 回退值改成 `clamp(20px, 4.4vw, 48px)`，与公共页同一节奏 |
| 🟡 | 561–820 区间标题恒 36px，与桌面 58px 断层 | @1080 补 `.landing-hero h1{font-size:clamp(38px,5.4vw,47px)}` |
| 🔵 | 纸感主题下 hero 注脚小字用 `muted 85%` 只有 3.84:1 | 改用 `var(--muted)`（5.20:1） |
| 🔵 | `color-mix` 无回退：不支持时页头底色、`dialog::backdrop` 整条失效 | 两处都先写一条 `var(--bg)` / `rgba(0,0,0,.42)` 的降级声明 |
| 🔵 | 430 宽页头折成两行后锚点被遮 | @560 把 `scroll-padding-top` 提到 108px |
| 🔵 | 后台统计在 780 宽排成 3+1 | @820 固定两列 |
| 🔵 | 集市邀请卡按钮没有 hover 反馈、`.record` 圆角两页不一致 | 补 hover（accent 86% + text）与统一 14px |

**审查给出的正面结论**：refine.css 硬编码颜色 0 处、无死选择器（80 class + 7 id 全部存在）、四主题正文/次要文字/accent 对比度全部 ≥AA、级联方向正确（窄屏不会被桌面规则反压）。

修复后复跑：esbuild 打包 78935 字节 0 warning、无残留 `@import`；专用检查脚本确认 11 项修复都落在预期的媒体块里（括号/引号平衡、`!important` 仍只有 reduced-motion 那 4 处、硬编码颜色仍为 0）；`go test . -count=1` 全绿（11.7s）；`node test/ui-themes.test.js`、`market-links`、`market-package` 共 32 个用例通过。

之后又按复核意见收了三处细节：把 `.touch-illustration` 的间距用三段式选择器写实（原来那条 `margin-top` 被 `.experience-card .touch-illustration{margin-top:auto}` 压成死声明）、把主题选择器的分隔线归零同时放进 `@820`（原来只在 `≤560` 生效，561–780 会多留 14px）、把 `.panel` 的圆角拆回 16px 只让 `.record` 统一到 14px；页头 `border-bottom` 也补了 `var(--line)` 实色回退。当前文件 1571 行 / 249 个规则块。
