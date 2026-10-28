/**
 * 灵伴 LingPet 视觉改版 · 方案规格（spec）
 *
 * 本文件是四个设计方向的共同契约：交付物结构、板图分节、画板内容、质量红线、工具库用法。
 * 四个方向并行推进时，任何人不得修改本文件与 design/lib/svgkit.mjs。
 */

# 灵伴 LingPet 视觉改版 · 方案规格

> 读者：负责某个设计方向的作者（人或 agent）。按顺序读完本文即可开工，不需要再问。

## 0. 产品一句话

灵伴 LingPet 是一个常驻桌面的像素角色伙伴：它是一扇**透明无边框的 Electron 小窗**，跟着 Cursor / Codex / DSH 的会话状态切换动作（思考、执行工具、等确认、出错、完成、休眠），右键可弹出快捷控制，双击/按钮进「桌宠工作台」换角色、调大小、管会话跟随；另有一个社区市场（客户端内页 + Go 静态站）和一块嵌进 DSH 设置页的「桌宠」面板。

现状结论（已审计，`design/audit/tokens.md`）：视觉是「通用深色 SaaS 后台 + 暖桃点缀」——7 个样式表 139 个不同色值、19 档圆角、28 档字号，全项目只有 1 个 keyframes；品牌只靠一个圆角方块里的「灵」字；状态语义只有一个 6px 圆点；桌宠窗口本身几乎没有氛围。**改版的中心任务：让界面的质感、节奏、动效都长在「像素小生命」这个产品事实上，而不是给后台换皮。**

## 1. 交付物

每个方向产出到 `design/proposals/<slug>/`，**只写自己目录**：

| 文件 | 内容 |
| --- | --- |
| `board.mjs` | 生成设计板的脚本（import `../../lib/svgkit.mjs`，`node design/proposals/<slug>/board.mjs` 可直接跑） |
| `board.png` | 全图设计板，宽 1600，高度按内容（≥3600） |
| `tokens.json` | 机器可读的设计 token（schema 见 §7），数值必须与板图一致 |
| `notes.md` | 方案说明（结构见 §8） |

可选的补充图（最多 2 张）：`detail-pet.png`、`detail-workbench.png`（从板图裁切放大，方便审阅）。

slug 约定：

| 方向 | slug | 代号 |
| --- | --- | --- |
| A 像素工坊 | `01-pixel-workshop` | PIXEL WORKSHOP |
| B 暖光夜桌 | `02-warm-night` | WARM NIGHT DESK |
| C 纸感手账 | `03-paper-journal` | PAPER JOURNAL |
| D 终端脉动 | `04-terminal-pulse` | TERMINAL PULSE |

## 2. 共同约束（硬性）

**技术**
- 运行环境：Electron 45（Chromium 142）+ Windows；桌宠窗口是 `transparent:true` 的 512×512 画布，周围必须真透明——不能拿整块渐变/暗色遮罩当背景。发光、暗角这类效果要能只跟着角色和控件出现。
- 只能用 CSS/JS 实现：不用 canvas 阴影、不加运行时依赖、不联网加载字体与图片。
- 工作台窗口约 1130×850，也允许被压到 ~900 宽；布局不能横向溢出。
- 快捷控制是贴着光标的弹层，内容高度受限（≤ 屏幕高 - 80），要能滚动。
- 市场客户端页与 DSH 面板共用同一套 token；DSH 面板是**注入到宿主设置页**的样式，宿主可能是深色也可能是浅色，面板里所有底色都必须 `color-mix(in srgb, currentColor …)` 派生，强调色要能被 `--lp-accent` 覆盖（不能写死主题色）。
- 动效一律提供 `prefers-reduced-motion: reduce` 降级；颜色提供 `prefers-contrast: more` 或至少保证文字对比 ≥ 4.5:1。

**字体**（本机已装，可以直接写进 font-family；不允许提 web font）
- 中文黑体：`Microsoft YaHei`（= 微软雅黑，首选）、`Noto Sans SC`
- 中文衬线：`Noto Serif SC`（思源宋体）、`SimSun`
- 中文手写：`KaiTi`、`STKaiti`（少量点缀，正文禁用）
- 等宽：`Consolas`、`Cascadia Mono`（若无则回退 `Consolas`）
- 英文 UI：`Segoe UI`
- **注意：没有像素中文字体。** 像素风只能靠「等宽英文 + 大字距 + 硬边几何 + 像素网格装饰」表达中文。

**素材**（`design/assets/`，已切好，直接 `sprite({name})`）
- `deepseek-idle|thinking|working|input|approval|done|error|sleep`（256×341，透明底）
- `claude-*` 同八态（256×224）
- `deepseek-hd`、`white-dragon-hd`（512×512，用于大图/封面）

**文案**：沿用产品现有中文，不得自造英文产品名。需要变换语气时只能在标题/副标题这类装饰性文案上做，功能文案（按钮、状态、说明）必须保持原义。

## 3. 设计板规格

画板宽 **1600**，`pad = 64`，背景由方向自定（深色/浅色皆可，但四张板横向对比时要看得出取向差异）。分 6 节，顺序固定，每节左侧有一个 `01…06` 编号 + 中文节名 + 右侧一句小注：

### 01 桌面浮层（重点，占 ~760px 高）
主图：模拟桌面场景（壁纸渐变 + 2~3 个模糊窗口/任务栏暗示），桌宠位于画面中偏右，展示：
- 桌宠本体（真实贴图，尺寸接近真实观感：512px 窗口里角色高约 300~340px）
- **状态胶囊/chip**：图标/点 + 状态词（如「执行工具」）+ 可选的次要信息（会话名、耗时）
- **互动气泡**：桌宠说话时的气泡（如「改完了，要看看吗？」），带小尾巴
- **悬浮操作条**：hover 时才出现（⚙ 工作台 / ⇄ 换角色 / − 隐藏），三个按钮
- 全局效果：投影/辉光/地面接触阴影——**必须处理透明边缘**，不能出现矩形边界

右侧或下方再放 3 个小样（每个 ~300×260），分别是 `thinking`、`approval`、`error` 三种状态下的桌宠 + 状态表达，证明「状态语言」不只是换颜色。

### 02 快捷控制面板（~560px）
- 右键弹层完整稿（宽 300~340）：列出 4 只桌宠（含缩略图 + 名称 + 引擎标签 + 当前/选中态），下面是「显示/隐藏」「大小（3 档滑杆）」「会话跟随」开关，底部「进入工作台」；要有滚动区暗示与分隔线。
- 旁边放「拖拽控制条」（宽度自适应的小条：拖动图标 + 状态文字 + 隐藏按钮）小样，~260×120。

### 03 工作台（~1000px，信息架构主战场）
一张完整窗口（1520×940 或等比），左边栏 + 主区：
- 左边栏：品牌区（logo/字标 + 方向性装饰）、导航（桌宠工作台 / 桌宠市场）、「我的桌宠」列表（4 项，含缩略图、名称、`Claude · 像素 · 已显示` 元信息、删除入口）、底部「+ 新增桌宠」与两行小字说明
- 主区：「桌宠工作台」标题 + 一句副标题 + 右上连接状态胶囊（`● Codex / Cursor / DSH 已连接 · 3`）
- 「实时预览」面板：舞台（角色大图 + 状态 + 会话信息 + 主操作「隐藏桌宠」）
- 右侧 tab（外观与显示 / 会话跟随）+ 「选择角色」（3 张卡：Claude / DeepSeek / ChatGPT，其中 DeepSeek 选中态）+ 「选择形象」（缩略图 + 「已保存」徽章 + 名称「鲸鱼娘」+ 「原图 / 像素」）
- 大小滑杆与开关组至少出现在一屏（可以放在预览面板下方，也可以并进 tab）
- 必须有空状态或加载态的暗示（例如市场未连接、预览加载中）

### 04 桌宠市场（~520px）
客户端内市场页：标题 + 三个 tab（发现桌宠 / 投稿作品 / 查询投稿）+ 搜索框 + 「导入本地包」+ 安装方式下拉 + 卡片网格（3~6 张作品卡：封面 = 角色图 + 名称 + 作者 + 下载数 + 「安装」按钮）。卡片是本节的视觉主角。

### 05 周边表面（~520px）
左：DSH 设置页「桌宠」面板（宽 ~460，深色卡 + 桃色主按钮 + checkbox 行，标题「你的会话伙伴」；必须体现「跟随宿主主题」的处理：可在旁边加一小块浅色变体）。
右：桌宠市场网站首页缩略（宽 ~640 的浏览器窗口示意：导航 + hero + 3 张卡片），表达品牌在网页端的延伸。

### 06 设计语言（~700px）
这是方案能否落地的关键，必须是「能直接抄成 CSS」的程度：
- **色板**：主色/次色/强调/语义状态色（idle/thinking/working/input/approval/done/error/sleep）+ 深色/浅色两套说明；每个色块标 hex
- **字阶**：7 档左右（display / h1 / h2 / body / meta / mono / micro），标字号/字重/行高
- **形状**：圆角档位、描边宽度、分隔线；画 3 个示意块
- **效果**：阴影 2~3 档、发光/描边高光、纹理（网格/扫描线/纸纹/点阵）各 1 个示意
- **动效**：3~4 条（状态切换、气泡出现、按钮 hover、光晕呼吸），标明 duration + easing + 触发；用静态图形示意（箭头 + 时间轴）
- **图标/图形语言**：状态图标 4~6 个（思考/工具/确认/错误/完成/休眠）的造型规则说明
- 底部一行：`design tokens → CSS 变量 映射（示例 3 行）`

## 4. 必须覆盖的真实文案（可微调语气，不可改义）

- 品牌：`灵伴` / `LINGPET`
- 工作台：`桌宠工作台`、副标题 `选择一位伙伴，设置它的外观和跟随方式。`、`实时预览`、`外观与显示`、`会话跟随`、`选择角色`、`选择形象`、`已保存`、`原图 / 像素`、`隐藏桌宠`、`新增桌宠`、`我的桌宠`
- 连接：`Codex / Cursor / DSH 已连接 · 3`
- 状态词：`空闲`/`思考中`/`执行工具`/`等待输入`/`等待确认`/`完成`/`错误`/`休眠`
- 市场：`桌宠市场`、`发现桌宠`、`投稿作品`、`查询投稿`、`搜索桌宠、作者或介绍`、`导入本地包`、`安装方式`、`当前：默认桌宠`
- 快捷控制：`显示桌宠`、`大小`、`会话跟随`、`进入工作台`
- DSH 面板：`你的会话伙伴`、`桌宠运行状态`、`打开工作台`、`会话偏好`、`恢复继承配置`
- 互动气泡示例：`改完了，要看看吗？` / `需要你确认一下` / `三处改动完成` / `卡住了，看看日志？`

## 5. 工具库 `design/lib/svgkit.mjs` 速查

```js
import * as K from '../../lib/svgkit.mjs';
import path from 'node:path';

const theme = {
  fonts: {
    display: "'Noto Serif SC', 'Microsoft YaHei', serif",
    ui: "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
    mono: "Consolas, monospace",
  },
};

const sh = K.createSheet({
  theme,
  bg: 'url(#bg)',                      // 画板底；也可给 '#12100f'
  defs: `
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171210"/><stop offset="1" stop-color="#0b0908"/>
    </linearGradient>
    <radialGradient id="lamp" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#ffb877" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ffb877" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000" flood-opacity="0.5"/>
    </filter>`,
});

sh.header({
  kicker: 'LINGPET / 灵伴 · 方案 B',
  title: '暖光夜桌',
  subtitle: '一句话主张……',
  keywords: ['夜间', '暖光', '玻璃'],
  palette: ['#f0a860', '#17130f', '#f6efe6', '#8fc8a5'],
  colors: { kicker:'#f0a860', title:'#f6efe6', subtitle:'#a89a8b',
            chipFill:'none', chipStroke:'#3a3128', chipText:'#d6c8b8' },
});

sh.section({ index: 1, title: '桌面浮层', note: '透明窗口 · 八态语言', color: '#f6efe6', noteColor: '#7d7166' });
sh.raw(K.rect({ x: 64, y: sh.y, w: 1472, h: 700, r: 20, fill: '#0d0b0a' }), 740);
// …… 继续用图元手绘

await sh.finish(path.join('design', 'proposals', '02-warm-night', 'board.png'));
```

图元：`rect(o)` `circle(o)` `line(x1,y1,x2,y2,o)` `text(o)` `lines(o)` `para(o)` `pill(o)`
`button(o)` `sprite(o)` `esc` `hexA(hex,a)` `shade(hex,amt)` `measure(str,size)` `wrap(str,size,w)` `el(name,attrs,children)`
`svgDoc({width,height,defs,body,bg})` `renderSvg(svg,out,{scale})` `cropPng(src,{x,y,w,h,scale},out)` `montage(files,out,{width})`
`SPRITES` `STATES` `spriteUri(name)` `getSharp()`

常用写法：
- 圆角 `rect({x,y,w,h,r:16,fill,stroke,sw:1,opacity,dash:'6 6',filter:'url(#soft)'})`
- 文字基线在 y，垂直居中给 `baseline:'middle'`；居中给 `anchor:'middle'`；字距 `ls:2`
- 多行 `lines({x,y,lines:['a','b'],size:13,lineHeight:22,fill})`，或 `para({x,y,w:420,s:'长文本…',size:13})` 自动换行
- 贴图 `sprite({name:'deepseek-working',x,y,w:150,h:200})`
- 只有 `sh.raw(svg, advance)` 需要自己算高度增量

**渲染**：`node design/proposals/<slug>/board.mjs` → 生成 PNG。PNG 出来后**必须自己 `read_image` 看一眼**，再决定是否迭代。想放大看局部就写个临时脚本调 `cropPng('.../board.png',{x,y,w,h,scale:2}, '.../tmp-crop.png')` 再看。

**测量提示**：`measure(str, size)` 估宽，`wrap` 折行；中文按 1em 宽估算。SD 字级别的对齐请用 `anchor`/`baseline`，不要靠目测偏移。

## 6. 质量红线（不达标就返工）

1. **像真实产品，不像线框图**：真实文案、真实缩略图、真实留白与层级；不要出现「Lorem」「卡片」「内容」这类占位词。
2. **一屏一焦点**：每屏有明确的视觉重心（桌宠 / 预览舞台 / 市场封面卡），其余元素退让。
3. **状态语言要有设计**：8 种状态在颜色、形状、动效、附属信息上至少两个维度有差异，不能只换圆点颜色。
4. **透明窗口友好**：桌宠浮层的视觉元素必须能只包住角色与控件；不要画满屏深色底造成实心矩形。
5. **四方向可横向对比**：信息架构与文案一致，差异来自造型语言/色彩/排版/动效，不是「把某个功能删了」。
6. **可落地**：notes.md 里的 token 与 CSS 映射要能直接复制进 `desktop/ui-theme.css` 和 `client/client.js`；不要写「使用玻璃拟态模糊背景」却不给可实现的替代（Chromium 透明窗口里大面积 backdrop-filter 代价高，需给降级）。
7. **数字自洽**：board.png 上标注的 hex 与 tokens.json 必须一致。

## 7. `tokens.json` schema

```json
{
  "codename": "WARM NIGHT DESK",
  "slug": "02-warm-night",
  "summary": "一句话主张",
  "colors": {
    "bg": "#0b0908", "surface": "#171210", "surfaceAlt": "#1f1915",
    "line": "#332b23", "lineStrong": "#4a3d31",
    "text": "#f6efe6", "textMuted": "#a89a8b", "textFaint": "#7d7166",
    "accent": "#f0a860", "accentSoft": "#3a2b1e", "accentText": "#231a12",
    "secondary": "#9c8bd4",
    "state": {
      "idle": "#c1c6cf", "thinking": "#f0a860", "working": "#f0c060",
      "input": "#e8c46a", "approval": "#e8c46a", "done": "#8fc8a5",
      "error": "#ed8185", "sleep": "#8a90a8"
    },
    "lightVariant": { "bg": "#f5efe6", "text": "#241d17", "accent": "#c4703a" }
  },
  "fonts": { "display": "...", "ui": "...", "mono": "..." },
  "type": { "display": {"size": 44, "weight": 700, "lineHeight": 52}, "h1": {}, "h2": {}, "body": {"size": 13, "lineHeight": 22}, "meta": {}, "mono": {}, "micro": {} },
  "radius": { "window": 20, "panel": 16, "card": 12, "control": 10, "pill": 999, "note": "0 = 像素硬边" },
  "border": { "width": 1, "soft": "#2a241d", "strong": "#4a3d31", "innerHighlight": "rgba(255,255,255,0.08)" },
  "shadow": { "panel": "0 20px 50px rgba(0,0,0,0.45)", "control": "0 8px 20px rgba(0,0,0,0.4)", "glow": "0 0 40px rgba(240,168,96,0.35)" },
  "motion": { "easing": "cubic-bezier(.2,.8,.2,1)", "fast": "150ms", "base": "240ms", "slow": "420ms", "breathe": "4s", "framed": false, "note": "framed=true 表示用 steps() 帧动画" },
  "notes": "落地时的注意事项"
}
```

## 8. `notes.md` 结构

```md
# 方案 X · 中文名（CODENAME）

## 一句话主张
## 关键词
## 为什么适合灵伴（3~5 条，结合产品事实：像素角色、透明窗口、常驻桌面、开发者用户、长时间陪伴）
## 视觉系统
### 色彩（含状态色语义）
### 字体与字阶
### 形状与描边
### 光影与纹理
### 动效语言
### 图标与图形
## 各表面设计要点（桌宠浮层 / 快捷控制 / 工作台 / 市场 / DSH 面板 / 网站）
## 状态与动效清单（8 态 × 视觉表现）
## 落地映射（改哪些文件、CSS 变量表、需要新增的类、性能注意）
## 取舍与风险
## 不适用场景
```

## 9. 禁止事项

- ❌ 不要改 `design/lib/svgkit.mjs`、本文件、别人的 `design/proposals/*` 目录、产品源码（`desktop/**`、`client/**`、`market/**`）
- ❌ 不要运行 `npm install`、不要联网下载任何东西
- ❌ 不要尝试启动 Chrome/Electron（沙箱会崩，纯浪费时间）
- ❌ 不要用 PowerShell 的 `Set-Content`/`Out-File` 改写含中文的 JS 文件（编码会被破坏，用 write 工具）
- ❌ 不要把设计写成「设计原则大词」堆砌，要落到可执行的数值与 CSS

## 10. 评审

做完把 `board.png` 路径 + 一句话说明发给 Lead。Lead 会看图给 1~2 轮反馈，改完即交付。
