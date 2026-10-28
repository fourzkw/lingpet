/**
 * 灵伴 LingPet 视觉改版 · 方向 C「纸感手账 PAPER JOURNAL」设计板
 *
 * node design/proposals/03-paper-journal/board.mjs
 *
 * 设计意图：桌面是一本摊开的手账，桌宠是页边的贴纸，状态用便签/印章/荧光笔/胶带表达。
 * 这是四个方向里唯一以浅色为主的方案，同时给出「夜读灯下」深色变体。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../lib/svgkit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'board.png');

/* =========================================================================
 * 0. Token：浅色主版（暖纸底 + 墨色 + 朱砂 / 竹青）
 * ========================================================================= */
const F = {
  display: "'Noto Serif SC', 'SimSun', serif",
  ui: "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  mono: "Consolas, 'Cascadia Mono', monospace",
  hand: "'STKaiti', 'KaiTi', 'Noto Serif SC', serif",
};

const L = {
  board: '#EFE6D4',
  paper: '#F7F1E4', // 画板纸
  surface: '#FCF7EC', // 卡片纸（比纸底更白，浮起）
  surfaceAlt: '#F2E9D8',
  inset: '#EDE3CF',
  line: '#DCCFB6',
  lineStrong: '#C6B597',
  ink: '#2B241C',
  muted: '#6F6353',
  faint: '#9B8D78',
  accent: '#B4472F', // 朱砂
  accentDeep: '#8C3320',
  accentSoft: '#F3DCD2',
  secondary: '#4F6E4B', // 竹青
  secondarySoft: '#E0E7D8',
  sticky: '#F6D27A', // 便签黄
  stickySoft: '#FBF0CE',
  tape: '#E7D3AE', // 和纸胶带
  highlight: '#F4E07E', // 荧光笔
  white: '#FFFDF7',
};

const DK = {
  board: '#191410',
  paper: '#211B15',
  surface: '#282119',
  surfaceAlt: '#312820',
  inset: '#241E17',
  line: '#403528',
  lineStrong: '#5A4A37',
  ink: '#F1E7D7',
  muted: '#B4A48D',
  faint: '#867A66',
  accent: '#DE7A5B',
  accentDeep: '#B4472F',
  accentSoft: '#4A2C22',
  secondary: '#9CB88F',
  secondarySoft: '#2C3628',
  sticky: '#E8C46F',
  stickySoft: '#4A3B22',
  tape: '#6B5537',
  highlight: '#8A7A36',
  white: '#FFFDF7',
};

/** 状态色：浅色底上全部 ≥4.5:1（对比度已核算，见 notes.md） */
const ST = {
  idle: { c: '#6E655A', zh: '空闲', en: 'IDLE' },
  thinking: { c: '#4F6B8C', zh: '思考中', en: 'THINKING' },
  working: { c: '#B4472F', zh: '执行工具', en: 'WORKING' },
  input: { c: '#376E6C', zh: '等待输入', en: 'WAIT INPUT' },
  approval: { c: '#8A5F16', zh: '等待确认', en: 'APPROVAL' },
  done: { c: '#4F6E4B', zh: '完成', en: 'DONE' },
  error: { c: '#8E2B3E', zh: '错误', en: 'ERROR' },
  sleep: { c: '#6E6B7C', zh: '休眠', en: 'SLEEP' },
};

/* =========================================================================
 * 1. defs：纸纹 / 点阵 / 横线 / 阴影 / 模糊
 * ========================================================================= */
const DEFS = `
<linearGradient id="boardBg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#F2EADA"/>
  <stop offset="1" stop-color="#E7DAC4"/>
</linearGradient>
<pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse">
  <rect x="1.2" y="2.1" width="1.1" height="1.1" fill="#6B5733" opacity="0.07"/>
  <rect x="4.9" y="5.3" width="1" height="1" fill="#6B5733" opacity="0.045"/>
  <rect x="3.2" y="6.1" width="0.9" height="0.9" fill="#FFFDF6" opacity="0.5"/>
</pattern>
<pattern id="dotgrid" width="26" height="26" patternUnits="userSpaceOnUse">
  <circle cx="1.3" cy="1.3" r="0.85" fill="#7A6647" opacity="0.10"/>
</pattern>
<pattern id="rules" width="10" height="28" patternUnits="userSpaceOnUse">
  <rect x="0" y="27" width="10" height="1" fill="#D9CCB3"/>
</pattern>
<pattern id="grainS" width="6" height="6" patternUnits="userSpaceOnUse">
  <rect x="0.8" y="1.4" width="1.3" height="1.3" fill="#6B5733" opacity="0.24"/>
  <rect x="3.7" y="4.1" width="1.1" height="1.1" fill="#6B5733" opacity="0.14"/>
  <rect x="2.4" y="5.1" width="1" height="1" fill="#FFFDF6" opacity="0.6"/>
</pattern>
<pattern id="dotS" width="18" height="18" patternUnits="userSpaceOnUse">
  <circle cx="1.5" cy="1.5" r="1.35" fill="#7A6647" opacity="0.30"/>
</pattern>
<pattern id="stripe" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect x="0" y="0" width="2.6" height="7" fill="#B9964E" opacity="0.10"/>
</pattern>
<pattern id="washi" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
  <rect x="0" y="0" width="4" height="10" fill="#C9A86F" opacity="0.35"/>
</pattern>
<linearGradient id="desk" x1="0" y1="0" x2="0.8" y2="1">
  <stop offset="0" stop-color="#EBDCC0"/>
  <stop offset="0.5" stop-color="#D2BB94"/>
  <stop offset="1" stop-color="#AE9168"/>
</linearGradient>
<linearGradient id="fadeDown" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="1"/>
</linearGradient>
<linearGradient id="deskDark" x1="0" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#332B23"/>
  <stop offset="0.55" stop-color="#241E18"/>
  <stop offset="1" stop-color="#15110E"/>
</linearGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0.55" y2="1">
  <stop offset="0" stop-color="#FFF7E4" stop-opacity="0.62"/>
  <stop offset="1" stop-color="#FFF7E4" stop-opacity="0"/>
</linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.46" r="0.72">
  <stop offset="0.55" stop-color="#3A2A18" stop-opacity="0"/>
  <stop offset="1" stop-color="#3A2A18" stop-opacity="0.20"/>
</radialGradient>
<filter id="shCard" x="-30%" y="-30%" width="160%" height="180%">
  <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#5C4626" flood-opacity="0.16"/>
  <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#5C4626" flood-opacity="0.10"/>
</filter>
<filter id="shFloat" x="-40%" y="-40%" width="180%" height="200%">
  <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#4A3721" flood-opacity="0.18"/>
  <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#4A3721" flood-opacity="0.13"/>
</filter>
<filter id="sticker" x="-40%" y="-40%" width="180%" height="180%">
  <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#3A2B18" flood-opacity="0.28"/>
</filter>
<filter id="blur12" x="-30%" y="-30%" width="160%" height="160%">
  <feGaussianBlur stdDeviation="12"/>
</filter>
<filter id="blur6" x="-25%" y="-25%" width="150%" height="150%">
  <feGaussianBlur stdDeviation="6"/>
</filter>
<filter id="blur4" x="-40%" y="-40%" width="180%" height="180%">
  <feGaussianBlur stdDeviation="4"/>
</filter>
`;

/* =========================================================================
 * 2. 基础工具（本板专用）
 * ========================================================================= */
const put = (s) => sh.raw(s, 0);
const rot = (a, cx, cy, content) => `<g transform="rotate(${a} ${cx} ${cy})">${content}</g>`;
const g = (attrs, content) => K.el('g', attrs, content);

const U = (s, x, y, o = {}) => K.text({ s, x, y, size: 13, family: F.ui, fill: L.ink, ...o });
const S = (s, x, y, o = {}) => K.text({ s, x, y, size: 15, family: F.display, fill: L.ink, ...o });
const M = (s, x, y, o = {}) => K.text({ s, x, y, size: 10, family: F.mono, fill: L.muted, ...o });
const HD = (s, x, y, o = {}) => K.text({ s, x, y, size: 15, family: F.hand, fill: L.accent, ...o });

/** 纸张卡：多层投影 + 1px 内高光 */
function paper(x, y, w, h, o = {}) {
  const r = o.r ?? 4;
  const fill = o.fill ?? L.surface;
  const stroke = o.stroke ?? L.line;
  const inner = o.inner ?? '#FFFFFF';
  const parts = [];
  parts.push(K.rect({ x, y, w, h, r, fill, stroke, sw: o.sw ?? 1, filter: o.filter ?? 'url(#shCard)', opacity: o.opacity, dash: o.dash }));
  if (o.grainy) parts.push(K.rect({ x, y, w, h, r, fill: 'url(#grain)' }));
  if (o.inner !== false) {
    parts.push(K.rect({ x: x + 0.7, y: y + 0.7, w: w - 1.4, h: h - 1.4, r: Math.max(0, r - 0.5), fill: 'none', stroke: inner, strokeOpacity: o.innerOpacity ?? 0.5, sw: 0.8 }));
  }
  return parts.join('');
}

/** 便签：白纸片 + 左缘状态色 */
function sticky(x, y, w, h, color, o = {}) {
  const r = o.r ?? 2;
  return [
    K.rect({ x, y, w, h, r, fill: o.fill ?? L.white, stroke: o.stroke ?? L.line, sw: 1, filter: o.filter ?? 'url(#shCard)' }),
    K.rect({ x, y, w: 3, h, r: 1, fill: color, opacity: 0.9 }),
  ].join('');
}

/** 和纸胶带 */
function tape(x, y, w, h, angle = -2, o = {}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fill = o.fill ?? L.tape;
  return rot(angle, cx, cy, [
    K.rect({ x, y, w, h, r: 1, fill, opacity: o.opacity ?? 0.62 }),
    K.rect({ x, y, w, h, r: 1, fill: 'none', stroke: '#FFFDF6', strokeOpacity: 0.5, sw: 0.8 }),
    K.line(x, y + 1.4, x + w, y + 1.4, { stroke: '#FFFDF6', sw: 0.9, strokeOpacity: 0.35 }),
  ].join(''));
}

/** 印章：圆环描边 + 中文两字 */
function stamp(cx, cy, r, label, color = L.accent, angle = -8, o = {}) {
  const chars = Array.from(label);
  const size = o.size ?? Math.round(r * 0.78);
  const parts = [
    K.circle({ cx, cy, r, fill: o.fill ?? 'none', stroke: color, sw: o.sw ?? 2.2, strokeOpacity: o.opacity ?? 0.9 }),
    K.circle({ cx, cy, r: r - 3.2, fill: 'none', stroke: color, sw: 0.8, strokeOpacity: (o.opacity ?? 0.9) * 0.45 }),
  ];
  const n = chars.length;
  const step = size * 0.98;
  const startX = cx - ((n - 1) * step) / 2;
  chars.forEach((ch, i) => {
    parts.push(S(ch, startX + i * step, cy + size * 0.34, { size, weight: 700, fill: color, anchor: 'middle', opacity: o.opacity ?? 0.9 }));
  });
  return rot(angle, cx, cy, parts.join(''));
}

/** 荧光笔色块 */
function highlight(x, y, w, color = L.highlight, angle = -0.5, op = 0.5, h = 28) {
  return rot(angle, x + w / 2, y + h / 2, K.rect({ x, y, w, h, r: 1, fill: color, opacity: op }));
}

/** 剖面说明行：小色块 + 名 + hex */
function swatchRow(x, y, color, label, o = {}) {
  return [
    K.rect({ x, y: y - 9, w: 10, h: 10, r: 2, fill: color }),
    M(label, x + 16, y, { size: 9.5, fill: o.color ?? L.muted, ls: 0.4 }),
  ].join('');
}

/** 微型桌面场景（状态小样用） */
function miniDesk(x, y, w, h) {
  const id = `md${Math.round(x)}_${Math.round(y)}`;
  return [
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`,
    g({ 'clip-path': `url(#${id})` }, [
      K.rect({ x, y, w, h, fill: 'url(#desk)' }),
      `<path d="M ${x} ${y} L ${x + w * 0.55} ${y} L ${x + w * 0.3} ${y + h} L ${x} ${y + h} Z" fill="url(#sun)"/>`,
      g({ filter: 'url(#blur6)' }, [
        K.rect({ x: x + 10, y: y + 12, w: w * 0.44, h: h * 0.3, r: 4, fill: '#1F242B', opacity: 0.5 }),
        K.rect({ x: x + 12, y: y + 14, w: w * 0.42, h: 7, r: 3, fill: '#4A5361', opacity: 0.55 }),
      ].join('')),
      K.rect({ x, y: y + h - 16, w, h: 16, fill: '#F6EEDF', opacity: 0.62 }),
      K.line(x, y + h - 16, x + w, y + h - 16, { stroke: '#FFFDF6', sw: 0.8, strokeOpacity: 0.6 }),
      [0, 1, 2, 3].map((i) => K.rect({ x: x + 8 + i * 13, y: y + h - 12, w: 8, h: 8, r: 1.5, fill: '#9A8A70', opacity: 0.45 })).join(''),
    ].join('')),
  ].join('');
}

/* =========================================================================
 * 3. 画板
 * ========================================================================= */
const sh = K.createSheet({
  width: 1600,
  pad: 64,
  bg: 'url(#boardBg)',
  defs: DEFS,
  theme: { fonts: F },
});

/* 整板纸纹 + 点阵（垫在所有内容之下） */
put(K.rect({ x: 0, y: 0, w: 1600, h: 6000, fill: 'url(#grain)' }));
put(K.rect({ x: 0, y: 0, w: 1600, h: 6000, fill: 'url(#dotgrid)' }));

/* 左侧装订孔 + 页边线（手账本暗示） */
for (let hy = 96; hy < 6000; hy += 92) {
  put(K.circle({ cx: 30, cy: hy, r: 4.5, fill: '#E7DCC7', stroke: L.lineStrong, sw: 1, strokeOpacity: 0.5 }));
  put(K.circle({ cx: 30, cy: hy + 1.5, r: 2.2, fill: '#D6C7AC', opacity: 0.65 }));
}
put(K.line(46, 64, 46, 6000, { stroke: L.accent, sw: 1, strokeOpacity: 0.16 }));

/* ---------------------------- 板头 ---------------------------- */
function header() {
  const y = 64;
  put(K.text({ x: 64, y: y + 20, s: 'LINGPET / 灵伴 · 方案 C', size: 11, family: F.mono, fill: L.accent, ls: 3 }));
  put(K.text({ x: 1536, y: y + 20, s: '2026.10 · 视觉改版提案', size: 10, family: F.mono, fill: L.faint, anchor: 'end', ls: 1.5 }));

  const title = '纸感手账';
  const tw = K.measure(title, 74);
  // 荧光笔：只划过「手账」二字的下半截
  put(highlight(64 + tw * 0.5 - 6, y + 118, tw * 0.5 + 8, L.highlight, -0.4, 0.45, 30));
  put(S(title, 64, y + 140, { size: 74, weight: 700, fill: L.ink }));
  put(K.text({ x: 64 + tw + 24, y: y + 138, s: 'PAPER JOURNAL', size: 14, family: F.mono, fill: L.muted, ls: 7 }));

  put(U('桌面是一本摊开的手账，桌宠是页边的贴纸，状态是便签、印章与荧光笔。', 64, y + 188, { size: 17, fill: L.muted }));
  put(U('四个方向里唯一的浅色主推：白天也好看；同时给出「夜读灯下」深色变体（§06）。', 64, y + 218, { size: 17, fill: L.muted }));
  put(HD('一页一页，陪你把活干完。', 1536, y + 286, { size: 19, fill: L.accent, anchor: 'end', opacity: 0.9 }));

  // 关键词标签
  let tx = 64;
  ['暖纸底', '朱砂印', '便签状态', '胶带与和纸', '浅色优先'].forEach((k) => {
    const w = K.measure(k, 11.5) + 22;
    put(K.rect({ x: tx, y: y + 266, w, h: 26, r: 2, fill: 'none', stroke: L.lineStrong, sw: 1 }));
    put(U(k, tx + 11, y + 283, { size: 11.5, fill: L.muted }));
    tx += w + 9;
  });

  // 色板小样
  const pals = [
    [L.paper, '#F7F1E4', '纸底'],
    [L.ink, '#2B241C', '墨'],
    [L.accent, '#B4472F', '朱砂'],
    [L.secondary, '#4F6E4B', '竹青'],
    [L.sticky, '#F6D27A', '便签黄'],
    [DK.surface, '#282119', '夜色'],
  ];
  let px = 1536 - pals.length * 88 - (pals.length - 1) * 8;
  pals.forEach(([c, hx, name]) => {
    put(K.text({ x: px, y: y + 88, s: name, size: 9, family: F.ui, fill: L.muted }));
    put(K.rect({ x: px, y: y + 94, w: 88, h: 52, r: 3, fill: c, stroke: L.lineStrong, sw: 0.8 }));
    put(K.text({ x: px, y: y + 160, s: hx, size: 9, family: F.mono, fill: L.faint }));
    px += 96;
  });

  // 页脚线
  put(K.line(64, y + 312, 1536, y + 312, { stroke: L.lineStrong, sw: 1, dash: '2 5' }));
  put(K.text({ x: 64, y: y + 334, s: 'PAPER JOURNAL / 纸感手账 · 方向 C', size: 9.5, family: F.mono, fill: L.faint, ls: 1.6 }));
  put(K.text({ x: 1536, y: y + 334, s: 'DESIGN BOARD 1600×N · 6 SECTIONS', size: 9.5, family: F.mono, fill: L.faint, anchor: 'end', ls: 1.6 }));
  sh.y = y + 372;
}

/** 分节头：朱砂方章编号 + 宋体标题 + 右侧等宽小注 */
function sectionHead(index, title, note) {
  const y = sh.y;
  put(K.line(64, y, 1536, y, { stroke: L.lineStrong, sw: 1, dash: '1 4' }));
  put(K.rect({ x: 64, y: y + 14, w: 30, h: 30, r: 2, fill: 'none', stroke: L.accent, sw: 1.4 }));
  put(K.text({ x: 79, y: y + 34, s: String(index).padStart(2, '0'), size: 11, family: F.mono, fill: L.accent, anchor: 'middle', ls: 0.5 }));
  put(S(title, 110, y + 37, { size: 24, weight: 700, fill: L.ink }));
  put(K.text({ x: 1536, y: y + 36, s: note, size: 10.5, family: F.mono, fill: L.faint, anchor: 'end', ls: 0.8 }));
  sh.y = y + 68;
}

/** 桌面：壁纸 + 窗口 + 桌面杂物（浅色 / 深色） */
function deskScene(x, y, w, h, o = {}) {
  const dark = o.dark;
  const parts = [];
  parts.push(K.rect({ x, y, w, h, fill: dark ? 'url(#deskDark)' : 'url(#desk)' }));
  if (!dark) parts.push(`<path d="M ${x} ${y} L ${x + w * 0.62} ${y} L ${x + w * 0.34} ${y + h} L ${x} ${y + h} Z" fill="url(#sun)"/>`);
  else parts.push(`<path d="M ${x + w * 0.3} ${y} L ${x + w * 0.72} ${y} L ${x + w * 0.5} ${y + h} L ${x + w * 0.1} ${y + h} Z" fill="#FFF1D6" opacity="0.05"/>`);
  // 模糊窗口
  const win = (wx, wy, ww, wh, blur, col, op) => g({ filter: `url(#${blur})` }, [
    K.rect({ x: wx, y: wy, w: ww, h: wh, r: 8, fill: col, opacity: op }),
    K.rect({ x: wx + 2, y: wy + 2, w: ww - 4, h: 24, r: 7, fill: dark ? '#6E6355' : '#5A6572', opacity: Math.min(1, op * 1.15) }),
    [0, 1, 2].map((k) => K.circle({ cx: wx + 16 + k * 12, cy: wy + 14, r: 3.4, fill: dark ? '#C9B99F' : '#DCE3EC', opacity: op * 0.9 })).join(''),
    [0, 1, 2, 3, 4, 5].map((i) => K.rect({
      x: wx + 22, y: wy + 46 + i * 20, w: ww * (0.34 + ((i * 13) % 5) / 12), h: 8, r: 4,
      fill: dark ? '#B4AC9C' : '#AEBFDA', opacity: Math.min(1, op * 0.75),
    })).join(''),
  ].join(''));
  parts.push(win(x + 30, y + 36, 348, 224, 'blur12', dark ? '#3E4149' : '#1F242B', dark ? 0.5 : 0.6));
  if (o.windows !== 'none') parts.push(win(x + 46, y + 300, 246, 168, 'blur6', dark ? '#4A4238' : '#2B2620', dark ? 0.42 : 0.4));
  return parts.join('');
}

/* =========================================================================
 * 4. §01 桌面浮层
 * ========================================================================= */
function sec01() {
  sectionHead(1, '桌面浮层', '512 × 512 透明窗口 · 状态便签 · 四角真透明');
  const y0 = sh.y;
  const SX = 64;
  const SW = 1000;
  const SH = 540;
  const cid = 'clip01';

  const scene = [];
  scene.push(`<clipPath id="${cid}"><rect x="${SX}" y="${y0}" width="${SW}" height="${SH}" rx="6"/></clipPath>`);
  const inner = [];
  inner.push(deskScene(SX, y0, SW, SH, { windows: 'none' }));
  // 景深：虚焦窗口做背景层（左上一扇 + 左下一扇小窗）
  const blurWin = (wx, wy, ww, wh, op) => g({ filter: 'url(#blur12)' }, [
    K.rect({ x: wx, y: wy, w: ww, h: wh, r: 8, fill: '#1F242B', opacity: op }),
    K.rect({ x: wx + 2, y: wy + 2, w: ww - 4, h: 24, r: 7, fill: '#5A6572', opacity: Math.min(1, op * 1.2) }),
    [0, 1, 2].map((k) => K.circle({ cx: wx + 16 + k * 12, cy: wy + 14, r: 3.4, fill: '#DCE3EC', opacity: op * 0.9 })).join(''),
    [0, 1, 2, 3].map((i) => K.rect({ x: wx + 22, y: wy + 46 + i * 22, w: ww * (0.42 + ((i * 17) % 4) / 14), h: 8, r: 4, fill: '#AEBFDA', opacity: op * 0.7 })).join(''),
  ].join(''));
  inner.push(blurWin(SX + 18, y0 + 16, 300, 184, 0.5));
  inner.push(blurWin(SX + 492, y0 + 152, 200, 146, 0.33));
  // 中间：可读的纸感编辑窗（标题栏 + 两行正文 + 竖线光标 + 一行小字）
  const ex = SX + 96;
  const ey = y0 + 200;
  const ew = 372;
  const eh = 210;
  inner.push(g({ filter: 'url(#shCard)' }, [K.rect({ x: ex, y: ey, w: ew, h: eh, r: 5, fill: L.surface, stroke: L.line, sw: 1 })].join('')));
  inner.push(K.rect({ x: ex + 1, y: ey + 1, w: ew - 2, h: eh - 2, fill: 'url(#rules)', opacity: 0.45 }));
  inner.push(K.rect({ x: ex, y: ey, w: ew, h: 28, r: 5, fill: L.surfaceAlt }));
  inner.push(K.rect({ x: ex, y: ey + 20, w: ew, h: 8, fill: L.surfaceAlt }));
  inner.push(K.line(ex, ey + 28, ex + ew, ey + 28, { stroke: L.line, sw: 1 }));
  inner.push([0, 1, 2].map((k) => K.circle({ cx: ex + 15 + k * 11, cy: ey + 14, r: 3.1, fill: ['#D98F7C', '#DFBA74', '#9DBA8B'][k] })).join(''));
  inner.push(M('手账 · 草稿.md', ex + 50, ey + 18, { size: 8.8, fill: L.muted }));
  inner.push(S('桌面是一本摊开的手账，', ex + 22, ey + 74, { size: 15.5, weight: 500, fill: L.ink }));
  const ed2 = '桌宠是贴在页边的小贴纸。';
  inner.push(S(ed2, ex + 22, ey + 100, { size: 15.5, weight: 500, fill: L.ink }));
  inner.push(K.rect({ x: ex + 25 + K.measure(ed2, 15.5), y: ey + 84, w: 1.7, h: 20, fill: L.accent }));
  inner.push(M('cursor-task · 12s · 3 处改动', ex + 22, ey + 134, { size: 8.5, fill: L.faint }));
  inner.push(K.line(ex + 22, ey + 152, ex + ew - 22, ey + 152, { stroke: L.line, sw: 1, dash: '2 3' }));
  inner.push(U('回车继续 · Esc 收起', ex + 22, ey + 174, { size: 9.5, fill: L.faint }));
  inner.push(M('auto-save', ex + ew - 22, ey + 174, { size: 8, fill: L.faint, anchor: 'end' }));
  // 桌面杂物：便签叠（贴在编辑窗右上角）、马克杯、咖啡环
  inner.push(rot(-6, SX + 422, y0 + 200, K.rect({ x: SX + 392, y: y0 + 170, w: 62, h: 62, r: 2, fill: '#F3DE9E', stroke: '#D9BE74', sw: 0.8 })));
  inner.push(rot(2, SX + 428, y0 + 206, K.rect({ x: SX + 396, y: y0 + 174, w: 62, h: 62, r: 2, fill: L.sticky, stroke: '#D9BE74', sw: 0.8 })));
  inner.push(K.line(SX + 408, y0 + 192, SX + 444, y0 + 192, { stroke: '#B08F4A', sw: 1.2, strokeOpacity: 0.5 }));
  inner.push(K.line(SX + 408, y0 + 204, SX + 436, y0 + 204, { stroke: '#B08F4A', sw: 1.2, strokeOpacity: 0.5 }));
  // 马克杯
  inner.push(`<ellipse cx="${SX + 346}" cy="${y0 + 490}" rx="38" ry="8" fill="#3A2B18" opacity="0.18" filter="url(#blur4)"/>`);
  inner.push(K.rect({ x: SX + 312, y: y0 + 424, w: 58, h: 66, r: 6, fill: '#E6D7BF', stroke: '#C7B295', sw: 1 }));
  inner.push(K.circle({ cx: SX + 378, cy: y0 + 454, r: 13, fill: 'none', stroke: '#CBB89C', sw: 5 }));
  inner.push(`<ellipse cx="${SX + 341}" cy="${y0 + 426}" rx="26" ry="6.5" fill="#6B4A32"/>`);
  inner.push(`<ellipse cx="${SX + 341}" cy="${y0 + 426}" rx="26" ry="6.5" fill="none" stroke="#C7B295" stroke-width="1"/>`);
  // 咖啡环
  inner.push(K.circle({ cx: SX + 240, cy: y0 + 474, r: 32, fill: 'none', stroke: '#8A5C33', sw: 5, strokeOpacity: 0.12 }));
  inner.push(K.circle({ cx: SX + 240, cy: y0 + 474, r: 26, fill: 'none', stroke: '#8A5C33', sw: 1.2, strokeOpacity: 0.1 }));
  // 暗角 + 内描边
  inner.push(K.rect({ x: SX, y: y0, w: SW, h: SH, fill: 'url(#vig)' }));
  // 任务栏
  inner.push(K.rect({ x: SX, y: y0 + SH - 42, w: SW, h: 42, fill: '#F6EEDF', opacity: 0.6 }));
  inner.push(K.line(SX, y0 + SH - 42, SX + SW, y0 + SH - 42, { stroke: '#FFFDF6', sw: 1, strokeOpacity: 0.7 }));
  inner.push([0, 1, 2, 3, 4].map((i) => K.rect({ x: SX + 22 + i * 31, y: y0 + SH - 31, w: 19, h: 19, r: 2.5, fill: '#9A8A70', opacity: 0.42 })).join(''));
  inner.push(K.text({ x: SX + SW - 24, y: y0 + SH - 15, s: '20:41  ·  周一', size: 10, family: F.mono, fill: L.muted, anchor: 'end', opacity: 0.85 }));
  inner.push(K.text({ x: SX + 16, y: y0 + SH - 52, s: '模拟桌面：壁纸 + 一扇可读的纸感编辑窗 + 两扇虚焦窗口 + 任务栏', size: 8.5, family: F.mono, fill: '#6F6353', opacity: 0.9 }));
  inner.push(K.rect({ x: SX + 0.5, y: y0 + 0.5, w: SW - 1, h: SH - 1, r: 6, fill: 'none', stroke: '#FFFDF6', strokeOpacity: 0.4, sw: 1 }));
  scene.push(g({ 'clip-path': `url(#${cid})` }, inner.join('')));
  put(scene.join(''));

  // ------- 桌宠浮层（无矩形底） -------
  const PX = SX + 464;
  const PY = y0 + 8;
  const overlay = [];
  // 四角括号：示意 512 窗口边界，不是 UI
  const bk = 22;
  const bracket = (ax, ay, sx, sy) =>
    `<path d="M ${ax} ${ay + sy * bk} L ${ax} ${ay} L ${ax + sx * bk} ${ay}" fill="none" stroke="#FFFDF6" stroke-width="1.4" stroke-opacity="0.75"/>`;
  overlay.push(bracket(PX, PY, 1, 1), bracket(PX + 512, PY, -1, 1), bracket(PX, PY + 512, 1, -1), bracket(PX + 512, PY + 512, -1, -1));
  // 接触阴影 + 角色贴纸
  overlay.push(`<ellipse cx="${PX + 256}" cy="${PY + 440}" rx="116" ry="16" fill="#4A3A24" opacity="0.26" filter="url(#blur4)"/>`);
  overlay.push(K.sprite({ name: 'deepseek-done', x: PX + 132, y: PY + 96, w: 248, h: 330, filter: 'url(#sticker)' }));
  // 互动气泡（纸片 + 手绘尾巴）
  const bx = PX + 16;
  const by = PY + 8;
  const bw = 246;
  const bh = 66;
  overlay.push(g({ filter: 'url(#shFloat)' }, [
    K.rect({ x: bx, y: by, w: bw, h: bh, r: 3, fill: L.white, stroke: L.line, sw: 1 }),
    `<path d="M ${bx + 148} ${by + bh - 3} L ${bx + 180} ${by + bh + 26} L ${bx + 212} ${by + bh - 3} Z" fill="${L.white}" stroke="${L.line}" stroke-width="1"/>`,
    K.rect({ x: bx + 1, y: by + bh - 5, w: 210, h: 5, fill: L.white }),
  ].join('')));
  overlay.push(S('改完了，要看看吗？', bx + 18, by + 32, { size: 16, weight: 500, fill: L.ink }));
  overlay.push(M('deepseek · 用时 42s', bx + 18, by + 51, { size: 9, fill: L.faint }));
  // 状态便签
  const chx = PX + 18;
  const chy = PY + 452;
  overlay.push(sticky(chx, chy, 190, 42, ST.done.c, { fill: L.white, filter: 'url(#shFloat)' }));
  overlay.push(K.circle({ cx: chx + 18, cy: chy + 15, r: 3, fill: ST.done.c }));
  overlay.push(U('完成', chx + 28, chy + 19, { size: 12.5, weight: 700, fill: L.ink }));
  overlay.push(M('3 处改动', chx + 28, chy + 33, { size: 9, fill: L.faint }));
  overlay.push(M('42s', chx + 172, chy + 26, { size: 9.5, fill: L.faint, anchor: 'end' }));
  // hover 悬浮操作条
  const hx = PX + 338;
  const hy = PY + 452;
  const hw = 158;
  const hh = 42;
  overlay.push(paper(hx, hy, hw, hh, { r: 3, fill: L.white, filter: 'url(#shFloat)' }));
  const cells = [['工作台', 'gear'], ['换角色', 'swap'], ['隐藏', 'minus']];
  cells.forEach(([label, icon], i) => {
    const cx0 = hx + 8 + i * 50;
    const cy0 = hy + hh / 2;
    if (i > 0) overlay.push(K.line(hx + i * 50 - 1, hy + 9, hx + i * 50 - 1, hy + hh - 9, { stroke: L.line, sw: 0.8, dash: '1 2' }));
    const ic = L.muted;
    if (icon === 'gear') {
      overlay.push(K.circle({ cx: cx0 + 9, cy: cy0, r: 3.6, fill: 'none', stroke: ic, sw: 1.3 }));
      overlay.push(K.circle({ cx: cx0 + 9, cy: cy0, r: 1.1, fill: ic }));
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        overlay.push(K.line(cx0 + 9 + Math.cos(a) * 4.8, cy0 + Math.sin(a) * 4.8, cx0 + 9 + Math.cos(a) * 6.4, cy0 + Math.sin(a) * 6.4, { stroke: ic, sw: 1.3 }));
      }
    } else if (icon === 'swap') {
      overlay.push(K.line(cx0 + 2, cy0 - 3, cx0 + 14, cy0 - 3, { stroke: ic, sw: 1.3 }));
      overlay.push(`<path d="M ${cx0 + 14} ${cy0 - 5.5} L ${cx0 + 17} ${cy0 - 3} L ${cx0 + 14} ${cy0 - 0.5}" fill="none" stroke="${ic}" stroke-width="1.3"/>`);
      overlay.push(K.line(cx0 + 17, cy0 + 3, cx0 + 5, cy0 + 3, { stroke: ic, sw: 1.3 }));
      overlay.push(`<path d="M ${cx0 + 5} ${cy0 + 0.5} L ${cx0 + 2} ${cy0 + 3} L ${cx0 + 5} ${cy0 + 5.5}" fill="none" stroke="${ic}" stroke-width="1.3"/>`);
    } else {
      overlay.push(K.circle({ cx: cx0 + 9, cy: cy0, r: 6, fill: 'none', stroke: ic, sw: 1.3 }));
      overlay.push(K.line(cx0 + 6, cy0, cx0 + 12, cy0, { stroke: ic, sw: 1.3 }));
    }
    overlay.push(U(label, cx0 + 20, cy0 + 3.5, { size: 9.5, fill: L.muted }));
  });
  put(overlay.join(''));

  // ------- 右侧：透明窗口的 4 条纪律 -------
  const RX = 1088;
  const RW = 448;
  let cy = y0;
  const notes = [
    {
      k: '01', t: '透明边界',
      body: '窗口里只出现贴纸、便签与控件；四角真透明，不铺任何底色，投影只跟着贴图走。',
      draw: (x, yy) => [
        K.rect({ x, y: yy, w: 128, h: 70, r: 3, fill: 'none', stroke: L.faint, sw: 1, dash: '3 3' }),
        K.sprite({ name: 'deepseek-idle', x: x + 50, y: yy + 8, w: 36, h: 48 }),
        K.rect({ x: x + 14, y: yy + 42, w: 34, h: 15, r: 2, fill: L.white, stroke: L.line, sw: 0.8 }),
        K.rect({ x: x + 14, y: yy + 42, w: 2.4, h: 15, fill: ST.idle.c }),
        K.text({ x: x + 24, y: yy + 53, s: '空闲', size: 7.5, family: F.ui, fill: L.muted }),
      ].join(''),
    },
    {
      k: '02', t: '状态便签',
      body: '状态 = 白纸片 + 左缘一条状态色 + 等宽耗时；不靠 6px 圆点换色，颜色与文字同时表达。',
      draw: (x, yy) => [
        K.rect({ x, y: yy, w: 138, h: 40, r: 2, fill: L.white, stroke: L.line, sw: 0.8 }),
        K.rect({ x, y: yy, w: 3, h: 40, r: 1, fill: ST.done.c }),
        K.circle({ cx: x + 16, cy: yy + 15, r: 2.6, fill: ST.done.c }),
        K.text({ x: x + 24, y: yy + 19, s: '完成', size: 10, family: F.ui, fill: L.ink, weight: 700 }),
        K.text({ x: x + 24, y: yy + 33, s: '3 处改动', size: 7.5, family: F.mono, fill: L.faint }),
        K.text({ x: x + 126, y: yy + 23, s: '42s', size: 7.5, family: F.mono, fill: L.faint, anchor: 'end' }),
      ].join(''),
    },
    {
      k: '03', t: '互动气泡',
      body: '纸片 + 手绘小尾巴，正文用宋体、落款用等宽；4.2s 后收进状态便签，不挡住角色。',
      draw: (x, yy) => [
        K.rect({ x, y: yy, w: 132, h: 36, r: 2, fill: L.white, stroke: L.line, sw: 0.8 }),
        `<path d="M ${x + 66} ${yy + 35} L ${x + 78} ${yy + 50} L ${x + 90} ${yy + 35} Z" fill="${L.white}" stroke="${L.line}" stroke-width="0.8"/>`,
        K.text({ x: x + 12, y: yy + 15, s: '改完了', size: 9, family: F.display, fill: L.ink }),
        K.text({ x: x + 12, y: yy + 28, s: '要看看吗？', size: 9, family: F.display, fill: L.ink }),
      ].join(''),
    },
    {
      k: '04', t: '接触阴影',
      body: '角色脚下垫一枚椭圆柔影（112×15 + 4px blur），贴图本身不裁边；窗口整体移动时不带底。',
      draw: (x, yy) => [
        K.sprite({ name: 'deepseek-idle', x: x + 16, y: yy + 4, w: 32, h: 43 }),
        `<ellipse cx="${x + 32}" cy="${yy + 52}" rx="30" ry="7" fill="#4A3A24" opacity="0.26" filter="url(#blur4)"/>`,
        K.line(x + 4, yy + 64, x + 60, yy + 64, { stroke: L.accent, sw: 0.8, dash: '2 2', strokeOpacity: 0.5 }),
        K.line(x + 4, yy + 61, x + 4, yy + 67, { stroke: L.accent, sw: 0.8, strokeOpacity: 0.5 }),
        K.line(x + 60, yy + 61, x + 60, yy + 67, { stroke: L.accent, sw: 0.8, strokeOpacity: 0.5 }),
        K.text({ x: x + 74, y: yy + 34, s: '112 × 15', size: 8, family: F.mono, fill: L.faint }),
        K.text({ x: x + 74, y: yy + 48, s: 'blur 4px', size: 8, family: F.mono, fill: L.faint }),
        K.text({ x: x + 74, y: yy + 62, s: 'opacity .26', size: 8, family: F.mono, fill: L.faint }),
      ].join(''),
    },
  ];
  notes.forEach((n) => {
    const h = 118;
    put(paper(RX, cy, RW, h, { r: 4, fill: L.surface, grainy: true }));
    put(K.text({ x: RX + 14, y: cy + 21, s: n.k, size: 9, family: F.mono, fill: L.accent, ls: 1 }));
    put(S(n.t, RX + 34, cy + 22, { size: 14, weight: 600, fill: L.ink }));
    const wrapped = K.wrap(n.body, 11, 258);
    put(K.lines({ x: RX + 14, y: cy + 44, lines: wrapped.slice(0, 3), size: 11, lineHeight: 16.5, family: F.ui, fill: L.muted }));
    put(n.draw(RX + RW - 150, cy + 34));
    cy += h + 10;
  });
  put(HD('窗口透明，纸片不透明。', RX + 4, cy + 14, { size: 16, fill: L.accent, opacity: 0.9 }));
  put(M('reduced-motion：便签 / 印章 / 轻摆直接落位', RX + RW, cy + 14, { size: 9, fill: L.faint, anchor: 'end' }));

  // ------- 三个状态小样 -------
  const sy = y0 + SH + 20;
  const samples = [
    { key: 'thinking', device: 'dots', quote: null },
    { key: 'approval', device: 'stamp', quote: '需要你确认一下' },
    { key: 'error', device: 'fold', quote: '卡住了，看看日志？' },
  ];
  const sw = 474;
  samples.forEach((sp, i) => {
    const x = 64 + i * (sw + 24);
    const st = ST[sp.key];
    put(paper(x, sy, sw, 236, { r: 4, fill: L.surface, grainy: true }));
    put(K.text({ x: x + 16, y: sy + 22, s: sp.key.toUpperCase(), size: 8.5, family: F.mono, fill: st.c, ls: 1.6 }));
    put(S(st.zh, x + 16, sy + 40, { size: 17, weight: 600, fill: L.ink }));
    put(K.line(x + 16, sy + 50, x + sw - 16, sy + 50, { stroke: L.line, sw: 1, dash: '2 3' }));

    const mx = x + 16;
    const my = sy + 58;
    const mw = 186;
    const mh = 160;
    put(miniDesk(mx, my, mw, mh));
    put(K.sprite({ name: `deepseek-${sp.key}`, x: mx + 58, y: my + 38, w: 78, h: 104, filter: 'url(#sticker)' }));
    put(`<ellipse cx="${mx + 96}" cy="${my + 144}" rx="40" ry="8" fill="#3A2B18" opacity="0.22" filter="url(#blur4)"/>`);
    if (sp.device === 'dots') {
      put(`<circle cx="${mx + 142}" cy="${my + 30}" r="21" fill="none" stroke="${st.c}" stroke-width="1" stroke-dasharray="2 4" opacity="0.8"/>`);
      put([0, 1, 2].map((k) => K.circle({ cx: mx + 130 + k * 12, cy: my + 30, r: 2.4, fill: st.c, opacity: 0.5 + k * 0.2 })).join(''));
      put(K.text({ x: mx + 142, y: my + 60, s: '思考 12s', size: 8, family: F.mono, fill: st.c, anchor: 'middle' }));
    } else if (sp.device === 'stamp') {
      put(stamp(mx + 148, my + 32, 23, '确认', st.c, -10));
    } else {
      put(rot(6, mx + 152, my + 34, [
        K.rect({ x: mx + 130, y: my + 18, w: 46, h: 34, r: 2, fill: L.white, stroke: L.line, sw: 0.8 }),
        `<path d="M ${mx + 164} ${my + 18} L ${mx + 176} ${my + 30} L ${mx + 164} ${my + 30} Z" fill="#EDE3CF" stroke="${L.line}" stroke-width="0.8"/>`,
        K.text({ x: mx + 138, y: my + 39, s: '错', size: 13, family: F.ui, fill: st.c, weight: 700 }),
      ].join('')));
    }
    // 便签（压住角色左下角，像贴在屏幕上）
    put(sticky(mx + 4, my + 120, 126, 32, st.c, { fill: L.white }));
    put(K.text({ x: mx + 14, y: my + 134, s: st.zh, size: 11, family: F.ui, fill: L.ink, weight: 700 }));
    put(K.text({ x: mx + 14, y: my + 146, s: { thinking: '12s', approval: '2 项', error: '16:04' }[sp.key], size: 8, family: F.mono, fill: L.faint }));

    // 右侧规范说明
    const ax = x + 214;
    const ay = sy + 74;
    const lh = 19;
    put(swatchRow(ax, ay, st.c, `${st.zh}  ${st.c.toUpperCase()}`));
    put(U('形', ax, ay + lh, { size: 10, fill: L.faint }));
    put(U({ thinking: '虚线思考圈 + 铅笔点阵；便签无印章', approval: '双线便签框 + 压角方章「确认」', error: '折角纸片 + 红笔波浪线 + 左倾 6°' }[sp.key], ax + 22, ay + lh, { size: 11, fill: L.muted }));
    put(U('动', ax, ay + lh * 2, { size: 10, fill: L.faint }));
    put(U({ thinking: '便签轻摆 ±1.5° · 3.2s 循环', approval: '印章落下 1.3→1 · 320ms', error: '纸片抖 2 次 · 180ms 后停' }[sp.key], ax + 22, ay + lh * 2, { size: 11, fill: L.muted }));
    put(U('附', ax, ay + lh * 3, { size: 10, fill: L.faint }));
    put(U({ thinking: '会话名 + 已思考秒数', approval: '待确认项数 + 操作提示', error: '出错时间 + 日志入口' }[sp.key], ax + 22, ay + lh * 3, { size: 11, fill: L.muted }));
    if (sp.quote) put(HD(`「${sp.quote}」`, ax, ay + lh * 3 + 30, { size: 15, fill: st.c }));
    put(K.text({ x: x + sw - 16, y: sy + 224, s: '状态小样 · 同一套纸片语言', size: 8.5, family: F.mono, fill: L.faint, anchor: 'end' }));
  });

  // ------- 纸片边界实证：白壁纸对照 + 夜读灯下 -------
  const ny = sy + 236 + 22;
  const nh = 356;
  {
    // A. 白壁纸对照（Lead 要求的实证小条 300×88）
    const x = 64;
    const w = 700;
    put(paper(x, ny, w, nh, { r: 4, fill: L.surface, grainy: true }));
    put(K.text({ x: x + 18, y: ny + 22, s: 'EDGE TEST · 白壁纸', size: 8.5, family: F.mono, fill: L.accent, ls: 1.6 }));
    put(S('纸片边界对照', x + 18, ny + 44, { size: 16, weight: 600, fill: L.ink }));
    const sx0 = x + 18;
    const sy0 = ny + 58;
    put(K.rect({ x: sx0, y: sy0, w: 300, h: 88, r: 3, fill: '#F7F1E4', stroke: '#DCCFB6', sw: 0.8 }));
    put(K.rect({ x: sx0 + 16, y: sy0 + 14, w: 118, h: 44, r: 3, fill: '#FCF7EC', stroke: '#DCCFB6', sw: 1 }));
    put(K.rect({ x: sx0 + 166, y: sy0 + 14, w: 118, h: 44, r: 3, fill: '#FCF7EC', stroke: '#DCCFB6', sw: 1, filter: 'url(#shCard)' }));
    put(K.rect({ x: sx0 + 166.6, y: sy0 + 14.6, w: 116.8, h: 42.8, r: 2.6, fill: 'none', stroke: '#FFFDF7', sw: 1 }));
    put(M('A  仅 1px 描边', sx0 + 16, sy0 + 76, { size: 8, fill: L.faint }));
    put(M('B  描边 + 内高光 + 投影', sx0 + 166, sy0 + 76, { size: 8, fill: L.faint }));
    const ax0 = x + 340;
    put(U('壁纸 #F7F1E4：比纸片还白一档。', ax0, ny + 78, { size: 11, fill: L.muted }));
    put(U('A 只用 1px #DCCFB6 描边 —— 边缘发虚，形状读不清。', ax0, ny + 100, { size: 11, fill: L.muted }));
    put(U('B 加 inset 高光 #FFFDF7 + 卡片影 —— 边界立住。', ax0, ny + 122, { size: 11, fill: L.muted }));
    put(HD('结论：B 是浮层纸片的默认配方。', ax0, ny + 158, { size: 15, fill: L.accent }));
    put(M('inset 高光 = 纸边受光面；投影 = 纸片离开桌面。', ax0, ny + 178, { size: 8, fill: L.faint }));
    put(K.line(x + 18, ny + 214, x + w - 18, ny + 214, { stroke: L.line, sw: 1, dash: '2 3' }));
    put(U('同一配方用于：互动气泡 · 状态便签 · 快捷控制弹层 · DSH 面板卡片。', x + 18, ny + 240, { size: 10.5, fill: L.muted }));
    put(M('唯一例外：贴纸本体不加内描边 —— 会破坏像素画的边缘。', x + 18, ny + 262, { size: 8.5, fill: L.faint }));
    put(M('纸片影：0 1px 2px rgba(43,36,28,.10), 0 8px 20px rgba(43,36,28,.10)', x + 18, ny + 284, { size: 8, fill: L.faint }));
    put(U('遇到 #FFFFFF 级别的纯白壁纸：描边加到 1.2px，内高光不变。', x + 18, ny + 308, { size: 10.5, fill: L.muted }));
  }
  {
    // B. 夜读灯下：深桌 + 同一张暖白纸片 + 朱砂印章
    const x = 788;
    const w = 748;
    put(`<clipPath id="clip01b"><rect x="${x + 18}" y="${ny + 58}" width="300" height="200" rx="3"/></clipPath>`);
    put(paper(x, ny, w, nh, { r: 4, fill: L.surface, grainy: true }));
    put(K.text({ x: x + 18, y: ny + 22, s: 'NIGHT DESK · 夜读灯下', size: 8.5, family: F.mono, fill: DK.accent, ls: 1.6 }));
    put(S('同一张纸片，暗桌面', x + 18, ny + 44, { size: 16, weight: 600, fill: L.ink }));
    const dx0 = x + 18;
    const dy0 = ny + 58;
    const darkBits = [];
    darkBits.push(K.rect({ x: dx0, y: dy0, w: 300, h: 200, fill: 'url(#deskDark)' }));
    darkBits.push(`<path d="M ${dx0 + 150} ${dy0} L ${dx0 + 240} ${dy0} L ${dx0 + 186} ${dy0 + 200} L ${dx0 + 96} ${dy0 + 200} Z" fill="#FFF1D6" opacity="0.05"/>`);
    darkBits.push(rot(-4, dx0 + 148, dy0 + 96, [
      K.rect({ x: dx0 + 64, y: dy0 + 70, w: 168, h: 52, r: 2, fill: '#FCF7EC', stroke: '#DCCFB6', sw: 1, filter: 'url(#shFloat)' }),
      K.rect({ x: dx0 + 64.7, y: dy0 + 70.7, w: 166.6, h: 50.6, r: 1.6, fill: 'none', stroke: '#FFFDF7', sw: 1 }),
      K.rect({ x: dx0 + 64, y: dy0 + 70, w: 3, h: 52, fill: '#4F6E4B' }),
    ].join('')));
    darkBits.push(K.text({ x: dx0 + 78, y: dy0 + 92, s: '完成', size: 12.5, family: F.ui, weight: 700, fill: '#2B241C' }));
    darkBits.push(K.text({ x: dx0 + 78, y: dy0 + 108, s: '3 处改动', size: 8, family: F.mono, fill: '#9B8D78' }));
    darkBits.push(K.text({ x: dx0 + 218, y: dy0 + 100, s: '42s', size: 8.5, family: F.mono, fill: '#9B8D78', anchor: 'end' }));
    darkBits.push(stamp(dx0 + 234, dy0 + 156, 22, '夜读', '#DE7A5B', -10, { size: 13, opacity: 0.85 }));
    darkBits.push(K.rect({ x: dx0, y: dy0, w: 300, h: 200, fill: 'url(#vig)' }));
    darkBits.push(K.rect({ x: dx0 + 0.5, y: dy0 + 0.5, w: 299, h: 199, r: 3, fill: 'none', stroke: '#FFFDF6', strokeOpacity: 0.28, sw: 1 }));
    put(g({ 'clip-path': 'url(#clip01b)' }, darkBits.join('')));
    put(M('深色桌面 #191410 · 纸片 #FCF7EC · 印章 #DE7A5B', x + 18, ny + 278, { size: 8, fill: L.faint }));
    const ax0 = x + 340;
    put(U('桌宠浮层落在深色桌面上。', ax0, ny + 82, { size: 11, fill: L.muted }));
    put(U('纸片仍是 #FCF7EC、不透明度 1：只让桌面变暗，不让纸跟着降亮。', ax0, ny + 104, { size: 11, fill: L.muted }));
    put(U('分层只靠 1px 暖白内描边 + 两层纸影，不用发光、不用玻璃。', ax0, ny + 126, { size: 11, fill: L.muted }));
    put(HD('纸就是纸 —— 夜里也亮着。', ax0, ny + 162, { size: 15, fill: L.accent }));
    put(K.line(x + 18, ny + 296, x + w - 18, ny + 296, { stroke: L.line, sw: 1, dash: '2 3' }));
    put(U('深色变体 = 换桌面，不换纸；主色改用更亮的 #DE7A5B。', x + 18, ny + 322, { size: 10.5, fill: L.muted }));
    put(M('已同步 tokens.json → colors.dark / variants.dark', x + 18, ny + 344, { size: 8.5, fill: L.faint }));
  }

  sh.y = ny + nh + 46;
}

/* =========================================================================
 * 5. §02 快捷控制
 * ========================================================================= */
function quickPopover(ox, oy, scale = 1, angle = 0) {
  const W = 360;
  const H = 600;
  const parts = [];
  const cx = ox + (W * scale) / 2;
  const cyM = oy + (H * scale) / 2;
  // 背面的一摞纸（手账里夹着的上一页）
  parts.push(rot(-1.6, cx, cyM, K.rect({ x: ox - 4, y: oy + 5, w: W * scale + 8, h: H * scale - 4, r: 4, fill: '#EADCC2' })));
  parts.push(paper(ox, oy, W * scale, H * scale, { r: 4, fill: L.white, stroke: L.lineStrong, filter: 'url(#shFloat)' }));

  const inner = [];
  inner.push(tape(118, -9, 124, 24, -2));
  inner.push(K.text({ x: 22, y: 22, s: 'LINGPET / 灵伴', size: 8.5, family: F.mono, fill: L.faint, ls: 2 }));
  inner.push(S('快捷控制', 22, 46, { size: 17, weight: 700, fill: L.ink }));
  inner.push(HD('右键呼出', 338, 44, { size: 13, fill: L.faint, anchor: 'end' }));
  inner.push(K.line(22, 60, 338, 60, { stroke: L.line, sw: 1, dash: '2 3' }));

  const pets = [
    ['DSH 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['Cursor 桌宠', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
    ['Codex 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['固定会话', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
  ];
  pets.forEach(([name, meta, sprite], i) => {
    const y = 70 + i * 62;
    const sel = i === 1;
    inner.push(K.rect({ x: 14, y, w: 332, h: 56, r: 3, fill: sel ? '#FFF7E7' : 'none', stroke: sel ? '#E9D5B4' : 'none', sw: 1 }));
    if (sel) inner.push(K.rect({ x: 14, y, w: 3, h: 56, r: 1.5, fill: L.accent }));
    inner.push(K.rect({ x: 26, y: y + 8, w: 38, h: 40, r: 2, fill: L.surfaceAlt, stroke: L.line, sw: 0.8 }));
    inner.push(K.sprite({ name: sprite, x: 31, y: y + 11, w: 28, h: 34, preserveAspectRatio: 'xMidYMax meet' }));
    inner.push(U(name, 74, y + 24, { size: 12.5, weight: 600, fill: L.ink }));
    inner.push(U(meta, 74, y + 41, { size: 10, fill: L.faint }));
    if (sel) {
      inner.push(K.text({ x: 316, y: y + 21, s: '当前', size: 9, family: F.ui, fill: L.accent, anchor: 'end', weight: 600 }));
      inner.push(K.circle({ cx: 312, cy: y + 40, r: 8.5, fill: 'none', stroke: L.accent, sw: 1.2 }));
      inner.push(`<path d="M ${308} ${y + 40} L ${311} ${y + 43.5} L ${317} ${y + 36.5}" fill="none" stroke="${L.accent}" stroke-width="1.5" stroke-linecap="round"/>`);
    }
  });
  // 滚动轨
  inner.push(K.rect({ x: 350, y: 70, w: 3, h: 248, r: 1.5, fill: L.inset }));
  inner.push(K.rect({ x: 350, y: 70, w: 3, h: 74, r: 1.5, fill: L.lineStrong }));

  // 开关 + 滑杆
  const onSwitch = (x, y, on) => [
    K.rect({ x, y, w: 42, h: 24, r: 12, fill: on ? L.accent : L.inset, stroke: on ? L.accentDeep : L.lineStrong, sw: 0.8 }),
    K.circle({ cx: on ? x + 30 : x + 12, cy: y + 12, r: 9, fill: on ? L.white : L.surface }),
  ].join('');
  const label = (t, y, sub) => [
    U(t, 22, y, { size: 12.5, weight: 600, fill: L.ink }),
    M(sub, 22, y + 15, { size: 9, fill: L.faint }),
  ].join('');

  inner.push(K.line(22, 338, 338, 338, { stroke: L.line, sw: 1, dash: '2 3' }));
  inner.push(label('显示桌宠', 364, '关闭后角色从桌面收起'));
  inner.push(onSwitch(296, 354, true));
  inner.push(label('大小', 404, '角色在 512 窗口里的占比'));
  inner.push(M('192 px', 338, 404, { size: 9, fill: L.faint, anchor: 'end' }));
  const trX = 22;
  const trW = 280;
  inner.push(K.rect({ x: trX, y: 437, w: trW, h: 2, r: 1, fill: L.lineStrong }));
  [0, 1, 2].forEach((k) => {
    const tx = trX + (trW / 2) * k;
    const act = k === 1;
    inner.push(K.circle({ cx: tx, cy: 438, r: act ? 7 : 3.2, fill: act ? L.white : L.lineStrong, stroke: act ? L.accent : 'none', sw: 1.8 }));
    if (act) inner.push(K.circle({ cx: tx, cy: 438, r: 2.2, fill: L.accent }));
    inner.push(U(['小', '中', '大'][k], tx, 461, { size: 9, fill: act ? L.accent : L.faint, anchor: k === 0 ? 'start' : k === 1 ? 'middle' : 'end' }));
  });
  inner.push(label('会话跟随', 486, 'Cursor / Codex / DSH'));
  inner.push(onSwitch(296, 476, true));
  inner.push(K.line(22, 516, 338, 516, { stroke: L.line, sw: 1, dash: '2 3' }));
  inner.push(K.rect({ x: 22, y: 524, w: 316, h: 40, r: 3, fill: L.accent, stroke: L.accentDeep, sw: 1 }));
  inner.push(K.rect({ x: 22.7, y: 524.7, w: 314.6, h: 38.6, r: 2.5, fill: 'none', stroke: '#FFF6EC', strokeOpacity: 0.35, sw: 0.8 }));
  inner.push(U('进入工作台', 180, 549, { size: 13, weight: 600, fill: '#FFF6EC', anchor: 'middle' }));
  inner.push(M('修改后自动保存 · 仅本机', 22, 582, { size: 8.5, fill: L.faint }));
  inner.push(M('Esc 关闭', 338, 582, { size: 8.5, fill: L.faint, anchor: 'end' }));

  parts.push(g({ transform: `translate(${ox} ${oy}) scale(${scale})` }, inner.join('')));
  return parts.join('');
}

function dragBar(x, y) {
  return [
    paper(x, y, 300, 64, { r: 3, fill: L.white, filter: 'url(#shFloat)' }),
    [0, 1, 2].map((r) => [0, 1].map((c) => K.circle({ cx: x + 18 + c * 6, cy: y + 24 + r * 8, r: 1.5, fill: L.faint })).join('')).join(''),
    K.circle({ cx: x + 46, cy: y + 26, r: 3.5, fill: ST.working.c }),
    U('执行工具', x + 56, y + 30, { size: 12, weight: 600, fill: L.ink }),
    M('cursor-task · 12s', x + 56, y + 45, { size: 8.5, fill: L.faint }),
    K.line(x + 252, y + 12, x + 252, y + 52, { stroke: L.line, sw: 0.8, dash: '1 2' }),
    K.circle({ cx: x + 274, cy: y + 32, r: 10, fill: 'none', stroke: L.lineStrong, sw: 1 }),
    K.line(x + 270, y + 32, x + 278, y + 32, { stroke: L.muted, sw: 1.3 }),
  ].join('');
}

function cursorArrow(x, y, scale = 1) {
  return g({ transform: `translate(${x} ${y}) scale(${scale})` }, [
    `<path d="M0 0 L0 26 L7 19.5 L11 28 L15.5 26 L11.5 17.5 L20 17.5 Z" fill="#FFFDF7" stroke="#2B241C" stroke-width="1.4" stroke-linejoin="round"/>`,
  ].join(''));
}

function sec02() {
  sectionHead(2, '快捷控制', '右键弹层 360 × 600 · 一屏一焦点 · 深色桌面也能读');
  const y0 = sh.y;

  // ------- 左：浅色桌面场景 -------
  const SX = 64;
  const SW = 760;
  const SH = 560;
  const cid = 'clip02';
  const scene = [];
  scene.push(`<clipPath id="${cid}"><rect x="${SX}" y="${y0}" width="${SW}" height="${SH}" rx="6"/></clipPath>`);
  const inner = [];
  inner.push(deskScene(SX, y0, SW, SH));
  // 便签叠（只放一件手作物）
  inner.push(rot(-6, SX + 372, y0 + 330, K.rect({ x: SX + 344, y: y0 + 300, w: 58, h: 58, r: 2, fill: '#F3DE9E', stroke: '#D9BE74', sw: 0.8 })));
  inner.push(rot(2, SX + 376, y0 + 336, K.rect({ x: SX + 348, y: y0 + 304, w: 58, h: 58, r: 2, fill: L.sticky, stroke: '#D9BE74', sw: 0.8 })));
  inner.push(K.line(SX + 358, y0 + 322, SX + 394, y0 + 322, { stroke: '#B08F4A', sw: 1.2, strokeOpacity: 0.5 }));
  inner.push(K.line(SX + 358, y0 + 334, SX + 386, y0 + 334, { stroke: '#B08F4A', sw: 1.2, strokeOpacity: 0.5 }));
  inner.push(K.rect({ x: SX, y: y0 + SH - 40, w: SW, h: 40, fill: '#F6EEDF', opacity: 0.55 }));
  inner.push(K.line(SX, y0 + SH - 40, SX + SW, y0 + SH - 40, { stroke: '#FFFDF6', sw: 1, strokeOpacity: 0.7 }));
  inner.push([0, 1, 2, 3].map((i) => K.rect({ x: SX + 20 + i * 30, y: y0 + SH - 29, w: 18, h: 18, r: 2.5, fill: '#9A8A70', opacity: 0.42 })).join(''));
  inner.push(K.text({ x: SX + SW - 22, y: y0 + SH - 14, s: '20:41', size: 10, family: F.mono, fill: L.muted, anchor: 'end', opacity: 0.85 }));
  inner.push(K.rect({ x: SX + 0.5, y: y0 + 0.5, w: SW - 1, h: SH - 1, r: 6, fill: 'none', stroke: '#FFFDF6', strokeOpacity: 0.4, sw: 1 }));
  scene.push(g({ 'clip-path': `url(#${cid})` }, inner.join('')));
  put(scene.join(''));

  // 角色 + 右键光标
  put(`<ellipse cx="${SX + 624}" cy="${y0 + 506}" rx="64" ry="12" fill="#3A2B18" opacity="0.22" filter="url(#blur4)"/>`);
  put(K.sprite({ name: 'deepseek-idle', x: SX + 548, y: y0 + 298, w: 152, h: 202, filter: 'url(#sticker)' }));
  put(paper(SX + 448, y0 + 376, 96, 26, { r: 2, fill: L.white, filter: 'url(#shCard)' }));
  put(U('右键桌宠', SX + 460, y0 + 393, { size: 10, fill: L.muted }));
  put(`<path d="M ${SX + 520} ${y0 + 402} L ${SX + 528} ${y0 + 420}" stroke="${L.muted}" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"/>`);
  put(cursorArrow(SX + 520, y0 + 418, 1));
  // 弹层（0.88 缩放）
  put(quickPopover(SX + 26, y0 + 14, 0.88));
  put(K.text({ x: SX, y: y0 + 584, s: '浅色桌面上 · 弹层靠纸片投影与 1px 内高光分层，不使用 backdrop-filter；弹层内容高 ≤ 屏高 - 80，超出可滚动', size: 9, family: F.mono, fill: L.muted }));

  // ------- 右列 -------
  const RX = 848;
  const dY = y0;
  const dH = 296;
  put(`<clipPath id="clip02d"><rect x="${RX}" y="${dY}" width="688" height="${dH}" rx="6"/></clipPath>`);
  put(g({ 'clip-path': 'url(#clip02d)' }, [
    K.rect({ x: RX, y: dY, w: 688, h: dH, fill: 'url(#deskDark)' }),
    g({ filter: 'url(#blur12)' }, [
      K.rect({ x: RX + 70, y: dY + 30, w: 300, h: 200, r: 8, fill: '#3E4149', opacity: 0.45 }),
      K.rect({ x: RX + 380, y: dY + 60, w: 250, h: 180, r: 8, fill: '#4A3F32', opacity: 0.3 }),
    ].join('')),
    K.rect({ x: RX, y: dY + dH - 30, w: 688, h: 30, fill: '#0E0B08', opacity: 0.45 }),
    [0, 1, 2, 3, 4].map((i) => K.rect({ x: RX + 20 + i * 28, y: dY + dH - 22, w: 17, h: 17, r: 2.5, fill: '#8A7A64', opacity: 0.28 })).join(''),
  ].join('')));
  // 同一弹层（裁切上半段）
  put(`<g clip-path="url(#clip02d)">${quickPopover(RX + 36, dY + 14, 1, -0.8)}</g>`);
  // 暗底说明（右侧留白区）
  put(S('夜读灯下', RX + 424, dY + 60, { size: 17, weight: 600, fill: DK.ink }));
  put(K.lines({
    x: RX + 424, y: dY + 86, lines: ['纸片仍是暖白 #FCF7EC，不透明；', '投影两层负责分层，强调色提亮一档。'], size: 9.5, lineHeight: 15,
    family: F.ui, fill: '#C7B8A1',
  }));
  // 纸片样品：胶带 + 1px 暖白内描边
  put(g({ filter: 'url(#shFloat)' }, K.rect({ x: RX + 430, y: dY + 126, w: 132, h: 56, r: 3, fill: L.white })));
  put(K.rect({ x: RX + 430.7, y: dY + 126.7, w: 130.6, h: 54.6, r: 2.5, fill: 'none', stroke: '#FFFFFF', strokeOpacity: 0.9, sw: 0.8 }));
  put(tape(RX + 468, dY + 116, 56, 18, -4));
  put(K.text({ x: RX + 442, y: dY + 158, s: 'paper #FCF7EC', size: 7.5, family: F.mono, fill: L.faint }));
  put(M('1px 暖白内描边 · 不跟随宿主暗色', RX + 430, dY + 198, { size: 8, fill: '#9C8D77' }));
  [['#FCF7EC', '纸'], ['#F1E7D7', '墨'], ['#DE7A5B', '朱砂']].forEach(([c, n], i) => {
    put(K.rect({ x: RX + 430 + i * 78, y: dY + 214, w: 18, h: 18, r: 2, fill: c, opacity: 0.95 }));
    put(K.text({ x: RX + 454 + i * 78, y: dY + 227, s: n, size: 8, family: F.ui, fill: '#BFB09A' }));
  });
  put(stamp(RX + 622, dY + 90, 26, '夜读', '#E4C894', -11, { size: 10.5, sw: 1.8 }));

  put(M('深色桌面：弹层不跟随暗色，暖白纸片做对比定锚；投影是唯一的分层手段', RX, dY + dH + 16, { size: 9, fill: L.muted }));

  // 拖拽控制条
  const ty = y0 + 336;
  put(dragBar(RX, ty));
  put(M('拖拽控制条 · 贴桌宠 8px · 只显示状态与隐藏', RX, ty + 84, { size: 8.5, fill: L.faint }));

  // 拖拽交互的规矩（填满左下留白）
  put(paper(RX, y0 + 432, 300, 112, { r: 4, fill: L.surface, grainy: true }));
  put(S('拖拽与吸附', RX + 14, y0 + 454, { size: 13, weight: 600, fill: L.ink }));
  ['角色跟随光标 1:1，无惯性、不旋转', '距屏幕边缘 12px 吸附，不越界', '松手记忆位置，写进本地配置'].forEach((t, i) => {
    put(K.circle({ cx: RX + 19, cy: y0 + 470 + i * 18, r: 1.6, fill: L.accent, opacity: 0.8 }));
    put(U(t, RX + 28, y0 + 474 + i * 18, { size: 10, fill: L.muted }));
  });

  // 说明卡
  const nx = RX + 332;
  put(paper(nx, ty - 8, 356, 232, { r: 4, fill: L.surface, grainy: true }));
  put(S('弹层四条纪律', nx + 16, ty + 20, { size: 14, weight: 600, fill: L.ink }));
  const rules = [
    '一屏一焦点：4 只桌宠列表优先，开关退让。',
    '高度 ≤ 屏高 - 80，超出走右侧细滚动轨。',
    '弹层 = 一摞纸：投影 2 层 + 1px 暖白内描边。',
    '深色桌面：纸片仍暖白，不跟随暗色。',
  ];
  rules.forEach((r, i) => {
    put(K.text({ x: nx + 16, y: ty + 50 + i * 36, s: `0${i + 1}`, size: 9, family: F.mono, fill: L.accent }));
    put(K.lines({ x: nx + 36, y: ty + 50 + i * 36, lines: K.wrap(r, 11, 296), size: 11, lineHeight: 16, family: F.ui, fill: L.muted }));
  });
  put(HD('一屏只放一件手作物。', nx + 16, ty + 204, { size: 14, fill: L.accent }));

  sh.y = y0 + 600;
}

/* =========================================================================
 * 6. 控件小件
 * ========================================================================= */
function switchCtl(x, y, on, o = {}) {
  const w = o.w ?? 34;
  const h = o.h ?? 20;
  const r = h / 2;
  return [
    K.rect({ x, y, w, h, r, fill: on ? (o.color ?? L.accent) : L.inset, stroke: on ? (o.deep ?? L.accentDeep) : L.lineStrong, sw: 0.8 }),
    K.circle({ cx: on ? x + w - r : x + r, cy: y + h / 2, r: r - 3.2, fill: on ? L.white : L.surface }),
  ].join('');
}

function checkbox(x, y, checked, label, sub, color = L.accent) {
  const parts = [];
  if (checked) {
    parts.push(K.rect({ x, y, w: 15, h: 15, r: 2, fill: color }));
    parts.push(`<path d="M ${x + 3.4} ${y + 7.6} L ${x + 6.4} ${y + 10.8} L ${x + 11.8} ${y + 4.2}" fill="none" stroke="#FFFDF7" stroke-width="1.7" stroke-linecap="round"/>`);
  } else {
    parts.push(K.rect({ x, y, w: 15, h: 15, r: 2, fill: '#FFFDF7', stroke: L.lineStrong, sw: 1 }));
  }
  parts.push(U(label, x + 24, y + 12, { size: 12, fill: L.ink }));
  if (sub) parts.push(U(sub, x + 24, y + 29, { size: 10, fill: L.faint }));
  return parts.join('');
}

/** 三段式分段控件（原图 / 像素） */
function seg(x, y, w, h, items, active, o = {}) {
  const n = items.length;
  const iw = w / n;
  const parts = [K.rect({ x, y, w, h, r: 2, fill: o.track ?? L.inset, stroke: L.line, sw: 0.8 })];
  items.forEach((it, i) => {
    if (i === active) parts.push(K.rect({ x: x + 2 + i * iw, y: y + 2, w: iw - 4, h: h - 4, r: 1.5, fill: o.activeFill ?? L.white, stroke: L.line, sw: 0.8 }));
    parts.push(U(it, x + iw * i + iw / 2, y + h / 2 + 4, { size: 9.5, fill: i === active ? L.ink : L.faint, anchor: 'middle', weight: i === active ? 600 : 400 }));
  });
  return parts.join('');
}

/** 细描边标签 */
function tag(x, y, label, color = L.muted, o = {}) {
  const w = K.measure(label, o.size ?? 9.5) + 14;
  return [
    K.rect({ x, y, w, h: 20, r: 2, fill: o.fill ?? 'none', stroke: o.stroke ?? L.lineStrong, sw: 0.8 }),
    U(label, x + 7, y + 14, { size: o.size ?? 9.5, fill: color }),
  ].join('');
}

/** 骨架屏：三条闪动的占位 */
function skeleton(x, y, w, color = L.line) {
  return [0, 1, 2].map((i) => K.rect({ x, y: y + i * 11, w: i === 2 ? w * 0.55 : w, h: 6, r: 3, fill: color, opacity: 0.55 - i * 0.1 })).join('');
}

/* =========================================================================
 * 7. §03 工作台
 * ========================================================================= */
function sec03() {
  sectionHead(3, '工作台', '整窗 1440 × 900 · 一比一信息架构 · 不横向溢出');
  const y0 = sh.y;
  const X = 64;
  const Y = y0;
  const W = 1440;
  const H = 900;
  const SB = 268; // 边栏

  // 窗口
  put(g({ filter: 'url(#shFloat)' }, K.rect({ x: X, y: Y, w: W, h: H, r: 6, fill: '#FBF5E8' })));
  put(K.rect({ x: X + 0.7, y: Y + 0.7, w: W - 1.4, h: H - 1.4, r: 5.5, fill: 'none', stroke: '#FFFDF7', strokeOpacity: 0.75, sw: 1 }));
  // 标题栏
  put(K.rect({ x: X, y: Y, w: W, h: 42, r: 6, fill: '#F2E8D6' }));
  put(K.rect({ x: X, y: Y + 30, w: W, h: 12, fill: '#F2E8D6' }));
  put(K.line(X, Y + 42, X + W, Y + 42, { stroke: L.line, sw: 1 }));
  put(K.rect({ x: X + 18, y: Y + 11, w: 20, h: 20, r: 3, fill: L.accent }));
  put(S('灵', X + 28, Y + 26, { size: 12.5, weight: 700, fill: '#FFF6EC', anchor: 'middle' }));
  put(U('灵伴', X + 46, Y + 26, { size: 12.5, weight: 700, fill: L.ink }));
  put(M('LINGPET', X + 84, Y + 26, { size: 8, fill: L.faint, ls: 2 }));
  put(M('桌宠工作台', X + W / 2, Y + 26, { size: 9, fill: L.faint, anchor: 'middle', ls: 1 }));
  [['—', 0], ['□', 1], ['×', 2]].forEach(([c, i]) => {
    put(U(c, X + W - 66 + i * 26, Y + 27, { size: 10, fill: L.muted, anchor: 'middle' }));
  });

  // 边栏
  put(K.rect({ x: X, y: Y + 42, w: SB, h: H - 42, fill: '#F7F0E2' }));
  put(K.line(X + SB, Y + 42, X + SB, Y + H, { stroke: L.line, sw: 1 }));
  put(M('导航', X + 24, Y + 76, { size: 8, fill: L.faint, ls: 2 }));
  const nav = [['桌宠工作台', true, 'grid'], ['桌宠市场', false, 'shop']];
  nav.forEach(([label, active], i) => {
    const ny = Y + 88 + i * 40;
    if (active) {
      put(K.rect({ x: X + 12, y: ny, w: SB - 24, h: 34, r: 2, fill: L.white, stroke: L.line, sw: 0.8 }));
      put(K.rect({ x: X + 12, y: ny, w: 2.6, h: 34, fill: L.accent }));
    }
    const ix = X + 26;
    const iy = ny + 17;
    if (i === 0) {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) put(K.rect({ x: ix + c * 6, y: iy - 6 + r * 6, w: 4.5, h: 4.5, r: 1, fill: active ? L.accent : L.faint }));
    } else {
      put(`<path d="M ${ix} ${iy + 5} L ${ix} ${iy - 1} L ${ix + 5} ${iy - 5} L ${ix + 10} ${iy - 1} L ${ix + 10} ${iy + 5} Z" fill="none" stroke="${active ? L.accent : L.faint}" stroke-width="1.2"/>`);
    }
    put(U(label, ix + 20, iy + 4, { size: 12, fill: active ? L.ink : L.muted, weight: active ? 600 : 400 }));
  });

  put(K.line(X + 24, Y + 176, X + SB - 24, Y + 176, { stroke: L.line, sw: 1, dash: '2 3' }));
  put(U('我的桌宠', X + 24, Y + 196, { size: 9.5, fill: L.faint, weight: 600 }));
  put(K.rect({ x: X + 84, y: Y + 184, w: 16, h: 15, r: 2, fill: L.inset, stroke: L.line, sw: 0.8 }));
  put(M('4', X + 92, Y + 195, { size: 8, fill: L.muted, anchor: 'middle' }));

  const mine = [
    ['DSH 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['Cursor 桌宠', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
    ['Codex 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['固定会话', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
  ];
  mine.forEach(([name, meta, sp], i) => {
    const my = Y + 210 + i * 58;
    const active = i === 1;
    if (active) put(K.rect({ x: X + 12, y: my, w: SB - 24, h: 52, r: 2, fill: '#FDF9F0', stroke: L.line, sw: 0.8 }));
    put(K.rect({ x: X + 24, y: my + 7, w: 38, h: 38, r: 2, fill: active ? L.white : L.surfaceAlt, stroke: L.line, sw: 0.8 }));
    put(K.sprite({ name: sp, x: X + 29, y: my + 10, w: 28, h: 32, preserveAspectRatio: 'xMidYMax meet' }));
    put(U(name, X + 72, my + 23, { size: 12, weight: active ? 600 : 400, fill: L.ink }));
    put(U(meta, X + 72, my + 39, { size: 9.5, fill: L.faint }));
    put(U('删除', X + SB - 26, my + 23, { size: 9, fill: L.faint, anchor: 'end' }));
  });

  // 底部新增
  put(K.rect({ x: X + 16, y: Y + H - 132, w: SB - 32, h: 34, r: 2, fill: 'none', stroke: L.lineStrong, sw: 1, dash: '3 3' }));
  put(U('＋  新增桌宠', X + 16 + (SB - 32) / 2, Y + H - 111, { size: 11.5, fill: L.muted, anchor: 'middle' }));
  put(M('拖动桌宠可移动位置', X + 24, Y + H - 78, { size: 8.5, fill: L.faint }));
  put(M('右键桌宠可打开快捷控制', X + 24, Y + H - 64, { size: 8.5, fill: L.faint }));

  // 主区
  const MX = X + SB + 28;
  const MR = X + W - 28;
  put(K.text({ x: MX, y: Y + 78, s: '灵伴 / 桌宠管理', size: 9, family: F.mono, fill: L.accent, ls: 2 }));
  put(S('桌宠工作台', MX, Y + 116, { size: 28, weight: 700, fill: L.ink }));
  put(U('选择一位伙伴，设置它的外观和跟随方式。', MX, Y + 140, { size: 12.5, fill: L.muted }));
  // 连接胶囊
  const cpW = 218;
  put(K.rect({ x: MR - cpW, y: Y + 92, w: cpW, h: 30, r: 15, fill: '#F3EBD9', stroke: L.lineStrong, sw: 1 }));
  put(K.circle({ cx: MR - cpW + 16, cy: Y + 107, r: 4, fill: ST.done.c }));
  put(U('Codex / Cursor / DSH 已连接 · 3', MR - cpW + 28, Y + 111, { size: 10.5, fill: L.ink }));

  // 左：实时预览
  const PX = MX;
  const PY = Y + 160;
  const PW = 520;
  const PH = 690;
  put(paper(PX, PY, PW, PH, { r: 4, fill: L.surface, grainy: true }));
  put(tape(PX + PW - 132, PY - 8, 104, 20, 3));
  put(S('实时预览', PX + 22, PY + 30, { size: 15, weight: 600, fill: L.ink }));
  put(M('鲸鱼娘 · PIXEL 192', PX + PW - 22, PY + 30, { size: 9, fill: L.faint, anchor: 'end' }));
  // 舞台
  const SX3 = PX + 22;
  const SY3 = PY + 48;
  const SW3 = PW - 44;
  const SH3 = 380;
  put(K.rect({ x: SX3, y: SY3, w: SW3, h: SH3, r: 3, fill: '#F8F0DF', stroke: L.line, sw: 0.8 }));
  put(K.rect({ x: SX3, y: SY3, w: SW3, h: SH3, r: 3, fill: 'url(#dotgrid)', opacity: 0.7 }));
  // 四角括号
  [[SX3, SY3, 1, 1], [SX3 + SW3, SY3, -1, 1], [SX3, SY3 + SH3, 1, -1], [SX3 + SW3, SY3 + SH3, -1, -1]].forEach(([ax, ay, sx, sy]) => {
    put(`<path d="M ${ax} ${ay + sy * 14} L ${ax} ${ay} L ${ax + sx * 14} ${ay}" fill="none" stroke="${L.lineStrong}" stroke-width="1.2"/>`);
  });
  put(`<ellipse cx="${SX3 + SW3 / 2}" cy="${SY3 + SH3 - 44}" rx="86" ry="13" fill="#4A3A24" opacity="0.14" filter="url(#blur4)"/>`);
  put(K.sprite({ name: 'deepseek-hd', x: SX3 + SW3 / 2 - 118, y: SY3 + 34, w: 236, h: 236, filter: 'url(#sticker)' }));
  // 状态便签
  put(sticky(SX3 + 16, SY3 + SH3 - 96, 186, 46, ST.working.c, { fill: L.white, filter: 'url(#shFloat)' }));
  put(K.circle({ cx: SX3 + 32, cy: SY3 + SH3 - 80, r: 3.2, fill: ST.working.c }));
  put(U('执行工具', SX3 + 42, SY3 + SH3 - 76, { size: 12.5, weight: 700, fill: L.ink }));
  put(M('cursor-task · 12s', SX3 + 42, SY3 + SH3 - 60, { size: 9, fill: L.faint }));
  put(stamp(SX3 + SW3 - 62, SY3 + 56, 26, '实时', L.accentDeep, -9, { size: 10, sw: 1.6, opacity: 0.75 }));
  // 会话信息
  put(M('Cursor · 会话 cursor-task', SX3, SY3 + SH3 + 26, { size: 10, fill: L.muted }));
  put(K.circle({ cx: SX3 + SW3 - 66, cy: SY3 + SH3 + 22, r: 3, fill: ST.done.c }));
  put(U('已连接', SX3 + SW3 - 56, SY3 + SH3 + 26, { size: 10, fill: L.muted }));
  // 主操作
  const bY = SY3 + SH3 + 42;
  put(K.rect({ x: SX3, y: bY, w: SW3, h: 44, r: 3, fill: L.surface, stroke: L.accent, sw: 1.4 }));
  put(K.rect({ x: SX3 + 0.7, y: bY + 0.7, w: SW3 - 1.4, h: 42.6, r: 2.5, fill: 'none', stroke: '#FFFDF7', strokeOpacity: 0.8, sw: 0.8 }));
  put(U('隐藏桌宠', SX3 + SW3 / 2, bY + 28, { size: 13, weight: 600, fill: L.accent, anchor: 'middle' }));
  put(M('拖动桌宠可移动位置 · 右键打开快捷控制', SX3, bY + 68, { size: 9, fill: L.faint }));
  put(M('修改后自动保存', SX3 + SW3, bY + 68, { size: 9, fill: L.faint, anchor: 'end' }));
  // 最近活动
  put(K.line(SX3, PY + 566, SX3 + SW3, PY + 566, { stroke: L.line, sw: 1, dash: '2 3' }));
  put(U('最近活动', SX3, PY + 594, { size: 11.5, weight: 600, fill: L.ink }));
  put(M('最近 3 条 · 仅本机', SX3 + SW3, PY + 594, { size: 8.5, fill: L.faint, anchor: 'end' }));
  [['done', '完成', '三处改动已应用到 Cursor 会话', '2 分钟前'],
    ['thinking', '思考中', '正在读取 desktop/main.js', '41 秒前'],
    ['working', '执行工具', 'cursor-task · 12s', '刚刚']].forEach(([k, state, detail, t], i) => {
    const ry = PY + 616 + i * 22;
    put(K.circle({ cx: SX3 + 3, cy: ry - 3, r: 3, fill: ST[k].c }));
    put(U(state, SX3 + 13, ry, { size: 10, weight: 600, fill: L.ink }));
    put(M(detail, SX3 + 64, ry, { size: 8.5, fill: L.faint }));
    put(M(t, SX3 + SW3, ry, { size: 8.5, fill: L.faint, anchor: 'end' }));
  });

  // 右列
  const CX = MR - 572;
  const CY = PY;
  const CW = 572;
  // tabs
  const tabs = ['外观与显示', '会话跟随'];
  tabs.forEach((t, i) => {
    const tw2 = CW / 2;
    const tx = CX + i * tw2;
    if (i === 0) {
      put(K.rect({ x: tx, y: CY, w: tw2, h: 38, r: 3, fill: L.white, stroke: L.line, sw: 0.8 }));
      put(K.rect({ x: tx, y: CY + 35, w: tw2, h: 3, fill: L.accent }));
    }
    put(U(t, tx + tw2 / 2, CY + 24, { size: 12, fill: i === 0 ? L.ink : L.faint, anchor: 'middle', weight: i === 0 ? 600 : 400 }));
  });
  // 选择角色
  const c1 = CY + 52;
  put(paper(CX, c1, CW, 150, { r: 4, fill: L.surface, grainy: true }));
  put(S('选择角色', CX + 22, c1 + 30, { size: 14, weight: 600, fill: L.ink }));
  put(M('点击切换', CX + CW - 22, c1 + 30, { size: 9, fill: L.faint, anchor: 'end' }));
  [['Claude', '1 个形象', false], ['DeepSeek', '1 个形象', true], ['ChatGPT', '2 个形象', false]].forEach(([name, meta, sel], i) => {
    const rx = CX + 20 + i * 178;
    const ry = c1 + 46;
    put(K.rect({ x: rx, y: ry, w: 170, h: 88, r: 3, fill: sel ? '#FFF8E9' : L.white, stroke: sel ? L.accent : L.line, sw: sel ? 1.4 : 0.9 }));
    put(U(name, rx + 14, ry + 28, { size: 13, weight: 600, fill: L.ink }));
    put(M(meta, rx + 14, ry + 48, { size: 9.5, fill: L.faint }));
    if (sel) put(`<path d="M ${rx + 142} ${ry + 22} L ${rx + 147} ${ry + 27} L ${rx + 156} ${ry + 15}" fill="none" stroke="${L.accent}" stroke-width="1.8" stroke-linecap="round"/>`);
    put(K.rect({ x: rx + 14, y: ry + 62, w: 40, h: 2, r: 1, fill: sel ? L.accent : L.line, opacity: sel ? 0.9 : 0.7 }));
  });
  // 选择形象
  const c2 = c1 + 150 + 16;
  put(paper(CX, c2, CW, 226, { r: 4, fill: L.surface, grainy: true }));
  put(S('选择形象', CX + 22, c2 + 30, { size: 14, weight: 600, fill: L.ink }));
  put(M('1 个已保留', CX + CW - 22, c2 + 30, { size: 9, fill: L.faint, anchor: 'end' }));
  // 已保存形象卡
  const fcX = CX + 20;
  const fcY = c2 + 46;
  put(K.rect({ x: fcX, y: fcY, w: 240, h: 156, r: 3, fill: L.white, stroke: L.accent, sw: 1.2 }));
  put(K.rect({ x: fcX + 12, y: fcY + 12, w: 216, h: 92, r: 2, fill: '#F4EBDA' }));
  put(K.sprite({ name: 'deepseek-idle', x: fcX + 76, y: fcY + 18, w: 68, h: 90, preserveAspectRatio: 'xMidYMax meet' }));
  put(K.rect({ x: fcX + 12, y: fcY + 12, w: 46, h: 19, r: 2, fill: L.accent }));
  put(U('已保存', fcX + 35, fcY + 25, { size: 9, fill: '#FFF6EC', anchor: 'middle' }));
  put(U('鲸鱼娘', fcX + 14, fcY + 124, { size: 12.5, weight: 600, fill: L.ink }));
  put(seg(fcX + 14, fcY + 132, 92, 18, ['原图', '像素'], 1));
  // 空态 + 加载态暗示
  put(K.rect({ x: fcX + 256, y: fcY, w: 132, h: 156, r: 3, fill: 'none', stroke: L.lineStrong, sw: 1, dash: '3 3' }));
  put(U('＋', fcX + 322, fcY + 66, { size: 20, fill: L.faint, anchor: 'middle' }));
  put(U('添加形象', fcX + 322, fcY + 90, { size: 10.5, fill: L.muted, anchor: 'middle' }));
  put(M('拖入 PNG', fcX + 322, fcY + 106, { size: 8.5, fill: L.faint, anchor: 'middle' }));
  put(K.rect({ x: fcX + 404, y: fcY, w: 128, h: 156, r: 3, fill: L.surfaceAlt, stroke: L.line, sw: 0.8 }));
  put(K.rect({ x: fcX + 416, y: fcY + 14, w: 104, h: 56, r: 2, fill: L.inset }));
  put(K.sprite({ name: 'claude-idle', x: fcX + 438, y: fcY + 24, w: 60, h: 40, opacity: 0.55 }));
  put(skeleton(fcX + 416, fcY + 84, 104));
  put(M('读取中…', fcX + 416, fcY + 140, { size: 8.5, fill: L.faint }));
  // 显示与大小
  const c3 = c2 + 226 + 16;
  put(paper(CX, c3, CW, 214, { r: 4, fill: L.surface, grainy: true }));
  put(S('显示与大小', CX + 22, c3 + 30, { size: 14, weight: 600, fill: L.ink }));
  put(U('大小', CX + 22, c3 + 60, { size: 12, fill: L.ink }));
  put(M('192 px', CX + CW - 22, c3 + 60, { size: 9, fill: L.faint, anchor: 'end' }));
  const trX = CX + 22;
  const trW = CW - 44;
  put(K.rect({ x: trX, y: c3 + 78, w: trW, h: 2, r: 1, fill: L.lineStrong }));
  [0, 1, 2].forEach((k) => {
    const tx = trX + (trW / 2) * k;
    const act = k === 1;
    put(K.circle({ cx: tx, cy: c3 + 79, r: act ? 7 : 3.4, fill: act ? L.white : L.lineStrong, stroke: act ? L.accent : 'none', sw: 1.8 }));
    if (act) put(K.circle({ cx: tx, cy: c3 + 79, r: 2.2, fill: L.accent }));
    put(U(['小', '中', '大'][k], tx, c3 + 100, { size: 9, fill: act ? L.accent : L.faint, anchor: k === 0 ? 'start' : k === 1 ? 'middle' : 'end' }));
  });
  put(K.line(CX + 22, c3 + 116, CX + CW - 22, c3 + 116, { stroke: L.line, sw: 1, dash: '2 3' }));
  put(U('显示桌宠', CX + 22, c3 + 140, { size: 12, fill: L.ink }));
  put(M('关闭后角色从桌面收起', CX + 22, c3 + 155, { size: 9, fill: L.faint }));
  put(switchCtl(CX + CW - 56, c3 + 128, true, { w: 34, h: 20 }));
  put(U('始终置顶', CX + 22, c3 + 184, { size: 12, fill: L.ink }));
  put(M('工作台之上也保持可见', CX + 22, c3 + 199, { size: 9, fill: L.faint }));
  put(switchCtl(CX + CW - 56, c3 + 172, false, { w: 34, h: 20 }));

  sh.y = Y + H + 46;
}

/* =========================================================================
 * 8. §04 市场
 * ========================================================================= */
function marketCard(x, y, w, h, o) {
  const parts = [];
  parts.push(paper(x, y, w, h, { r: 4, fill: L.surface, grainy: true }));
  parts.push(K.rect({ x: x + 12, y: y + 12, w: w - 24, h: 166, r: 3, fill: o.cover }));
  parts.push(tape(x + 22, y + 8, 62, 16, -6));
  const spH = o.spriteH ?? 138;
  parts.push(K.sprite({ name: o.sprite, x: x + w / 2 - o.spriteW / 2, y: y + 12 + (166 - spH) / 2, w: o.spriteW, h: spH, filter: 'url(#sticker)' }));
  if (o.badge) {
    parts.push(K.rect({ x: x + w - 74, y: y + 24, w: 50, h: 19, r: 2, fill: L.accent }));
    parts.push(U(o.badge, x + w - 49, y + 37, { size: 9, fill: '#FFF6EC', anchor: 'middle' }));
  }
  parts.push(U(o.name, x + 16, y + 204, { size: 14, weight: 600, fill: L.ink }));
  parts.push(U(o.author, x + 16, y + 222, { size: 10, fill: L.muted }));
  parts.push(M(o.dl, x + w - 16, y + 222, { size: 9, fill: L.faint, anchor: 'end' }));
  parts.push(K.line(x + 16, y + 238, x + w - 16, y + 238, { stroke: L.line, sw: 1, dash: '2 3' }));
  const by = y + 252;
  if (o.installed) {
    parts.push(K.rect({ x: x + 16, y: by, w: w - 32, h: 34, r: 3, fill: 'none', stroke: L.lineStrong, sw: 1 }));
    parts.push(U('已安装', x + w / 2, by + 22, { size: 11.5, fill: L.muted, anchor: 'middle' }));
  } else {
    parts.push(K.rect({ x: x + 16, y: by, w: w - 32, h: 34, r: 3, fill: L.accent, stroke: L.accentDeep, sw: 1 }));
    parts.push(U('安装', x + w / 2, by + 22, { size: 11.5, fill: '#FFF6EC', anchor: 'middle', weight: 600 }));
  }
  return parts.join('');
}

function sec04() {
  sectionHead(4, '市场', '作品卡是主角 · 与 DSH 面板共用 token · 4 列不溢出');
  const y0 = sh.y;
  // 标题
  put(S('桌宠市场', 64, y0 + 38, { size: 28, weight: 700, fill: L.ink }));
  put(U('挑一只贴到桌面上，也可以投稿自己的手作。', 64, y0 + 62, { size: 12, fill: L.muted }));
  // 右侧控件
  put(K.rect({ x: 1158, y: y0 + 22, w: 108, h: 34, r: 3, fill: L.white, stroke: L.lineStrong, sw: 1 }));
  put(U('导入本地包', 1212, y0 + 44, { size: 11, fill: L.muted, anchor: 'middle' }));
  put(K.rect({ x: 1280, y: y0 + 22, w: 192, h: 34, r: 3, fill: L.white, stroke: L.lineStrong, sw: 1 }));
  put(K.text({ x: 1294, y: y0 + 43, s: '安装方式', size: 9, family: F.mono, fill: L.faint }));
  put(U('当前：默认桌宠', 1382, y0 + 44, { size: 10.5, fill: L.ink }));
  put(K.text({ x: 1458, y: y0 + 44, s: '▾', size: 9, family: F.mono, fill: L.muted }));

  // tabs
  const tabs = ['发现桌宠', '投稿作品', '查询投稿'];
  let tx = 64;
  tabs.forEach((t, i) => {
    const tw = K.measure(t, 12.5) + 8;
    put(U(t, tx, y0 + 100, { size: 12.5, fill: i === 0 ? L.ink : L.faint, weight: i === 0 ? 600 : 400 }));
    if (i === 0) {
      put(K.rect({ x: tx - 2, y: y0 + 108, w: tw, h: 2.5, r: 1, fill: L.accent }));
      put(K.line(tx - 2, y0 + 111, tx + tw + 2, y0 + 111, { stroke: L.highlight, sw: 6, strokeOpacity: 0.5 }));
    }
    tx += tw + 30;
  });
  // 搜索
  const searchW = 420;
  put(K.rect({ x: 64, y: y0 + 128, w: searchW, h: 38, r: 3, fill: L.white, stroke: L.line, sw: 1 }));
  put(K.circle({ cx: 82, cy: y0 + 147, r: 5.5, fill: 'none', stroke: L.muted, sw: 1.3 }));
  put(K.line(86, y0 + 152, 90, y0 + 156, { stroke: L.muted, sw: 1.3 }));
  put(U('搜索桌宠', 100, y0 + 152, { size: 11.5, fill: L.faint }));
  put(M('作者或介绍', 64 + searchW - 96, y0 + 152, { size: 9, fill: L.faint }));
  put(M('共 12 只 · 按最近更新排序', 1536, y0 + 152, { size: 9, fill: L.faint, anchor: 'end' }));

  // 作品卡
  const cards = [
    { name: '鲸鱼娘', author: '蓝鲸社', dl: '12.4 万下载', sprite: 'deepseek-hd', spriteW: 148, spriteH: 148, cover: '#E7E1F0', badge: '热门' },
    { name: '青墨龙灵', author: '墨者', dl: '8.6 万下载', sprite: 'white-dragon-hd', spriteW: 148, spriteH: 148, cover: '#DCE6D8' },
    { name: '夜航鲸', author: '夜航', dl: '5.2 万下载', sprite: 'deepseek-thinking', spriteW: 108, spriteH: 144, cover: '#F5E6D2', installed: true },
    { name: '纸箱猫', author: '拾荒者', dl: '3.1 万下载', sprite: 'claude-idle', spriteW: 132, spriteH: 116, cover: '#EFE3CC' },
  ];
  cards.forEach((c, i) => {
    put(marketCard(64 + i * 372, y0 + 186, 348, 300, c));
  });

  put(M('封面 4:3 · 角色图 148px 上限 · 安装按钮统一 34px 高', 64, y0 + 518, { size: 9, fill: L.faint }));
  put(M('市场与 DSH 面板共用 tokens.json；暗色宿主下自动切换深色档', 1536, y0 + 518, { size: 9, fill: L.faint, anchor: 'end' }));
  sh.y = y0 + 546;
}

/* =========================================================================
 * 9. §05 周边表面
 * ========================================================================= */
function dshPanel(x, y, w, h, dark) {
  const T = dark ? DK : L;
  const parts = [];
  parts.push(K.rect({ x, y, w, h, r: 5, fill: T.paper, stroke: dark ? '#3A3025' : L.line, sw: 1 }));
  parts.push(K.text({ x: x + 24, y: y + 26, s: 'LINGPET / 灵伴', size: 8, family: F.mono, fill: dark ? '#8C7C66' : L.faint, ls: 2 }));
  parts.push(S('你的会话伙伴', x + 24, y + 54, { size: 21, weight: 700, fill: T.ink }));
  parts.push(U('让桌宠陪伴每一次思考与创作。', x + 24, y + 74, { size: 10, fill: dark ? '#B4A48D' : L.muted }));
  // 状态卡
  const c1y = y + 88;
  parts.push(K.rect({ x: x + 16, y: c1y, w: w - 32, h: 110, r: 4, fill: T.surface, stroke: dark ? '#3A3025' : L.line, sw: 1 }));
  parts.push(K.circle({ cx: x + 34, cy: c1y + 24, r: 4.2, fill: '#7FA86F' }));
  parts.push(U('桌宠运行状态', x + 46, c1y + 28, { size: 12, weight: 600, fill: T.ink }));
  parts.push(U('桌宠正在运行，随时打开工作台调整形象。', x + 34, c1y + 48, { size: 9.5, fill: dark ? '#A89A84' : L.muted }));
  const btn = (bx, bw, label, primary) => (primary
    ? [K.rect({ x: bx, y: c1y + 66, w: bw, h: 28, r: 3, fill: T.accent }),
      U(label, bx + bw / 2, c1y + 85, { size: 10, fill: dark ? '#241610' : '#FFF6EC', anchor: 'middle', weight: 600 })].join('')
    : [K.rect({ x: bx, y: c1y + 66, w: bw, h: 28, r: 3, fill: 'none', stroke: dark ? '#4A3E30' : L.lineStrong, sw: 1 }),
      U(label, bx + bw / 2, c1y + 85, { size: 10, fill: dark ? '#B4A48D' : L.muted, anchor: 'middle' })].join(''));
  parts.push(btn(x + 34, 70, '启动桌宠', false));
  parts.push(btn(x + 112, 70, '关闭全部', false));
  parts.push(btn(x + 190, 86, '打开工作台', true));
  // 偏好卡
  const c2y = c1y + 122;
  parts.push(K.rect({ x: x + 16, y: c2y, w: w - 32, h: 124, r: 4, fill: T.surface, stroke: dark ? '#3A3025' : L.line, sw: 1 }));
  parts.push(U('会话偏好', x + 34, c2y + 24, { size: 12, weight: 600, fill: T.ink }));
  parts.push(K.rect({ x: x + w - 32 - 106, y: c2y + 9, w: 96, h: 24, r: 3, fill: 'none', stroke: dark ? '#4A3E30' : L.lineStrong, sw: 1 }));
  parts.push(U('恢复继承配置', x + w - 32 - 58, c2y + 25, { size: 9, fill: dark ? '#B4A48D' : L.muted, anchor: 'middle' }));
  const cb = (cy, checked, label, sub) => [
    checked
      ? [K.rect({ x: x + 34, y: cy, w: 15, h: 15, r: 2, fill: T.accent }), `<path d="M ${x + 37.4} ${cy + 7.6} L ${x + 40.4} ${cy + 10.8} L ${x + 45.8} ${cy + 4.2}" fill="none" stroke="${dark ? '#241610' : '#FFFDF7'}" stroke-width="1.7" stroke-linecap="round"/>`].join('')
      : K.rect({ x: x + 34, y: cy, w: 15, h: 15, r: 2, fill: dark ? '#241E17' : '#FFFDF7', stroke: dark ? '#5A4A37' : L.lineStrong, sw: 1 }),
    U(label, x + 58, cy + 12, { size: 11.5, fill: T.ink }),
    U(sub, x + 58, cy + 27, { size: 9, fill: dark ? '#9C8D77' : L.faint }),
  ].join('');
  parts.push(cb(c2y + 42, true, '自动启动桌宠', 'DSH 运行时自动唤起桌宠'));
  parts.push(cb(c2y + 82, false, '显示子 Agent', '将子 Agent 的会话状态交给桌宠监控'));
  parts.push(K.text({ x: x + 24, y: y + h - 22, s: '右键桌宠可打开快捷控制 · 更多形象在工作台调整', size: 7.6, family: F.mono, fill: dark ? '#8C7C66' : L.faint }));
  return parts.join('');
}

function sec05() {
  sectionHead(5, '周边表面', 'DSH 注入面板（跟随宿主深浅）· 市场站点 · 同一套 token');
  const y0 = sh.y;
  // 左：DSH 深色面板 460
  put(dshPanel(64, y0, 460, 366, true));
  put(M('DSH 设置页 · 宿主深色', 64, y0 + 386, { size: 9, fill: L.faint }));
  // 浅色变体 300
  const lx = 548;
  put(paper(lx, y0, 300, 366, { r: 5, fill: L.surface, grainy: true }));
  put(K.text({ x: lx + 20, y: y0 + 28, s: 'LINGPET / 灵伴', size: 7.5, family: F.mono, fill: L.faint, ls: 2 }));
  put(S('你的会话伙伴', lx + 20, y0 + 56, { size: 19, weight: 700, fill: L.ink }));
  put(K.lines({ x: lx + 20, y: y0 + 78, lines: ['让桌宠陪伴每一次思考与创作。'], size: 9.5, lineHeight: 14, family: F.ui, fill: L.muted }));
  put(K.rect({ x: lx + 14, y: y0 + 100, w: 272, h: 116, r: 4, fill: L.paper, stroke: L.line, sw: 1 }));
  put(K.circle({ cx: lx + 32, cy: y0 + 124, r: 4, fill: '#7FA86F' }));
  put(U('桌宠运行状态', lx + 44, y0 + 128, { size: 11.5, weight: 600, fill: L.ink }));
  put(U('桌宠正在运行。', lx + 32, y0 + 150, { size: 9.5, fill: L.muted }));
  put(K.rect({ x: lx + 32, y: y0 + 168, w: 90, h: 28, r: 3, fill: L.accent, stroke: L.accentDeep, sw: 1 }));
  put(U('打开工作台', lx + 77, y0 + 187, { size: 10, fill: '#FFF6EC', anchor: 'middle', weight: 600 }));
  put(K.rect({ x: lx + 14, y: y0 + 228, w: 272, h: 94, r: 4, fill: L.paper, stroke: L.line, sw: 1 }));
  put(U('会话偏好', lx + 32, y0 + 252, { size: 11.5, weight: 600, fill: L.ink }));
  put(checkbox(lx + 32, y0 + 266, true, '自动启动桌宠', null));
  put(checkbox(lx + 32, y0 + 292, false, '显示子 Agent', null));
  put(K.line(lx + 20, y0 + 332, lx + 280, y0 + 332, { stroke: L.line, sw: 1, dash: '2 3' }));
  put(M('底色 = color-mix(in srgb, currentColor 6–12%, transparent)', lx + 20, y0 + 346, { size: 7.4, fill: L.faint }));
  put(M('强调色回退 --lp-accent · 不写死纸色', lx + 20, y0 + 358, { size: 7.4, fill: L.faint }));
  put(M('浅色宿主变体', lx, y0 + 386, { size: 9, fill: L.faint }));

  // 右：市场网站 640
  const bx = 872;
  put(g({ filter: 'url(#shFloat)' }, K.rect({ x: bx, y: y0, w: 640, h: 366, r: 5, fill: '#FFFDF8' })));
  put(K.rect({ x: bx + 0.7, y: y0 + 0.7, w: 638.6, h: 364.6, r: 4.5, fill: 'none', stroke: '#FFFFFF', sw: 1 }));
  // 浏览器 chrome
  put(K.rect({ x: bx, y: y0, w: 640, h: 34, r: 5, fill: '#EFE7D7' }));
  put(K.rect({ x: bx, y: y0 + 22, w: 640, h: 12, fill: '#EFE7D7' }));
  [['#D98A7F', 0], ['#E0BB74', 1], ['#9DBA8B', 2]].forEach(([c, i]) => put(K.circle({ cx: bx + 18 + i * 15, cy: y0 + 17, r: 4, fill: c })));
  put(K.rect({ x: bx + 70, y: y0 + 8, w: 300, h: 18, r: 9, fill: '#FBF6EA', stroke: L.line, sw: 0.8 }));
  put(M('lingpet.market / 桌宠市场', bx + 84, y0 + 21, { size: 8, fill: L.faint }));
  put(K.line(bx, y0 + 34, bx + 640, y0 + 34, { stroke: L.line, sw: 1 }));
  // 站点导航
  put(K.rect({ x: bx + 16, y: y0 + 48, w: 18, h: 18, r: 3, fill: L.accent }));
  put(S('灵', bx + 25, y0 + 61, { size: 11, weight: 700, fill: '#FFF6EC', anchor: 'middle' }));
  put(U('灵伴', bx + 40, y0 + 62, { size: 12, weight: 700, fill: L.ink }));
  let lx2 = bx + 84;
  ['桌宠市场', '投稿作品', '文档'].forEach((t, i) => {
    put(U(t, lx2, y0 + 62, { size: 10, fill: i === 0 ? L.ink : L.faint }));
    lx2 += K.measure(t, 10) + 20;
  });
  put(K.rect({ x: bx + 520, y: y0 + 48, w: 104, h: 26, r: 3, fill: L.accent, stroke: L.accentDeep, sw: 1 }));
  put(U('下载应用', bx + 572, y0 + 65, { size: 10, fill: '#FFF6EC', anchor: 'middle', weight: 600 }));
  // hero
  put(K.line(bx + 16, y0 + 86, bx + 624, y0 + 86, { stroke: L.line, sw: 1, dash: '2 3' }));
  put(S('把桌宠贴到桌面上', bx + 24, y0 + 128, { size: 26, weight: 700, fill: L.ink }));
  put(K.lines({ x: bx + 24, y: y0 + 152, lines: ['不给桌面加一个后台，而是贴上一只小生命。', '八种状态、四种引擎，一个窗口就够。'], size: 10, lineHeight: 16, family: F.ui, fill: L.muted }));
  put(K.rect({ x: bx + 24, y: y0 + 186, w: 92, h: 30, r: 3, fill: L.accent, stroke: L.accentDeep, sw: 1 }));
  put(U('浏览桌宠', bx + 70, y0 + 205, { size: 10.5, fill: '#FFF6EC', anchor: 'middle', weight: 600 }));
  put(K.rect({ x: bx + 124, y: y0 + 186, w: 84, h: 30, r: 3, fill: 'none', stroke: L.lineStrong, sw: 1 }));
  put(U('投稿作品', bx + 166, y0 + 205, { size: 10.5, fill: L.muted, anchor: 'middle' }));
  // hero 插画
  put(K.rect({ x: bx + 430, y: y0 + 96, w: 180, h: 128, r: 3, fill: '#F4EBDA', stroke: L.line, sw: 0.8, filter: 'url(#shCard)' }));
  put(K.sprite({ name: 'deepseek-idle', x: bx + 486, y: y0 + 108, w: 68, h: 90, preserveAspectRatio: 'xMidYMax meet' }));
  put(tape(bx + 470, y0 + 90, 56, 16, -4));
  // 三张卡
  const mini = [['鲸鱼娘', '12.4 万'], ['青墨龙灵', '8.6 万'], ['纸箱猫', '3.1 万']];
  mini.forEach(([name, dl], i) => {
    const mx = bx + 24 + i * 196;
    put(K.rect({ x: mx, y: y0 + 248, w: 180, h: 96, r: 3, fill: '#FFFDF8', stroke: L.line, sw: 0.9 }));
    put(K.rect({ x: mx + 8, y: y0 + 256, w: 54, h: 80, r: 2, fill: '#F4EBDA' }));
    put(K.sprite({ name: i === 0 ? 'deepseek-idle' : i === 1 ? 'white-dragon-hd' : 'claude-idle', x: mx + 12, y: y0 + 262, w: 46, h: 68, preserveAspectRatio: 'xMidYMax meet' }));
    put(U(name, mx + 70, y0 + 276, { size: 10.5, weight: 600, fill: L.ink }));
    put(M(dl + '下载', mx + 70, y0 + 292, { size: 8, fill: L.faint }));
    put(K.rect({ x: mx + 70, y: y0 + 302, w: 40, h: 20, r: 2, fill: L.accentSoft, stroke: 'none' }));
    put(U('安装', mx + 90, y0 + 316, { size: 9, fill: L.accentDeep, anchor: 'middle' }));
  });
  put(M('共 12 只桌宠 · 本周新增 3 只 · 查看全部 →', bx + 24, y0 + 358, { size: 8, fill: L.faint }));
  put(M('浏览器窗口 640 宽 · 站点与桌面端共用同一套 token 与作品卡组件', bx, y0 + 386, { size: 9, fill: L.faint }));

  // 底部说明
  put(HD('同一套纸，换一张书桌。', 64, y0 + 424, { size: 17, fill: L.accent }));
  put(M('DSH 面板注入宿主页面：不写死背景色，所有底色 = color-mix(in srgb, currentColor 6~12%, transparent)；强调色回退 --lp-accent', 1536, y0 + 422, { size: 9, fill: L.muted, anchor: 'end' }));
  sh.y = y0 + 452;
}

/* =========================================================================
 * 10. §06 设计语言
 * ========================================================================= */
function paletteChip(x, y, color, name, hex, o = {}) {
  return [
    K.rect({ x, y, w: 78, h: 42, r: 3, fill: color, stroke: L.lineStrong, sw: 0.7 }),
    o.inner ? K.rect({ x: x + 0.5, y: y + 0.5, w: 77, h: 41, r: 2.6, fill: 'none', stroke: '#FFFFFF', strokeOpacity: 0.35, sw: 0.7 }) : '',
    U(name, x, y + 56, { size: 9.5, fill: L.muted }),
    K.text({ x, y: y + 68, s: hex, size: 7.5, family: F.mono, fill: L.faint }),
  ].join('');
}

function sec06() {
  sectionHead(6, '设计语言', '色 / 字 / 形 / 影 / 动 · 全部落到 CSS 变量');
  const y0 = sh.y;

  // ------- 色彩 -------
  put(M('色彩 COLORS · 浅色主版', 64, y0 + 12, { size: 9, fill: L.faint, ls: 1.5 }));
  put(M('深色变体：底 #191410 · 纸 #211B15 · 卡 #282119 · 墨 #F1E7D7 · 朱砂 #DE7A5B（见 §02 夜间对照）', 1536, y0 + 12, { size: 9, fill: L.faint, anchor: 'end' }));
  const mainCols = [
    [L.board, '纸底', '#EFE6D4'], [L.paper, '版面', '#F7F1E4'], [L.surface, '卡片', '#FCF7EC'], [L.ink, '墨', '#2B241C'],
    [L.muted, '次级墨', '#6F6353'], [L.accent, '朱砂', '#B4472F'], [L.accentSoft, '朱砂淡', '#F3DCD2'], [L.secondary, '竹青', '#4F6E4B'],
    [L.sticky, '便签黄', '#F6D27A'], [L.tape, '和纸', '#E7D3AE'],
  ];
  mainCols.forEach(([c, n, h], i) => put(paletteChip(64 + i * 88, y0 + 24, c, n, h, { inner: i < 3 || i === 5 })));
  put(M('状态色 STATUS', 64, y0 + 118, { size: 9, fill: L.faint, ls: 1.5 }));
  Object.entries(ST).forEach(([, st], i) => {
    put(paletteChip(64 + i * 92, y0 + 130, st.c, st.zh, st.c.toUpperCase(), { inner: true }));
  });
  put(M('每个状态 ≥ 两维差异：颜色 + 形状/动效/附属信息（见 §01 三态小样）', 1536, y0 + 118, { size: 9, fill: L.faint, anchor: 'end' }));

  // ------- 字阶 -------
  const ty = y0 + 224;
  put(paper(64, ty, 780, 262, { r: 4, fill: L.surface, grainy: true }));
  put(S('字阶 TYPE', 84, ty + 26, { size: 13, weight: 600, fill: L.ink }));
  put(M('字族：思源宋体（标题）/ 微软雅黑（正文）/ Consolas（数字）· 楷体只做批注', 824, ty + 26, { size: 8, fill: L.faint, anchor: 'end' }));
  const typeRows = [
    ['纸感手账', 'display', '400 40 / 1.1', { size: 40, weight: 700, family: F.display }],
    ['桌宠工作台', 'h1', '700 28 / 1.25', { size: 26, weight: 700, family: F.display }],
    ['选择一位伙伴', 'h2', '600 18 / 1.4', { size: 17, weight: 600, family: F.ui }],
    ['设置它的外观和跟随方式。', 'body', '400 13 / 1.7', { size: 12.5, family: F.ui }],
    ['Cursor · 会话 cursor-task', 'meta', '400 11 / 1.5', { size: 10, family: F.ui, fill: L.muted }],
    ['192 px · 12s · v0.9.3', 'mono', '400 10 / 1.6', { size: 9.5, family: F.mono, fill: L.muted }],
    ['DESIGN BOARD · 6 SECTIONS', 'micro', '400 8.5 / 1.4', { size: 8, family: F.mono, fill: L.faint, ls: 1.5 }],
  ];
  const rowH = [42, 34, 30, 28, 26, 25, 25];
  let ry = ty + 44;
  typeRows.forEach(([sample, label, spec, style], i) => {
    const base = ry + rowH[i] - 9;
    put(K.text({ x: 84, y: base, s: sample, family: F.ui, size: 11, fill: L.ink, ...style }));
    put(K.text({ x: 556, y: base, s: label, size: 8, family: F.mono, fill: L.faint, ls: 1 }));
    put(M(spec, 824, base, { size: 8, fill: L.faint, anchor: 'end' }));
    if (i < typeRows.length - 1) put(K.line(84, ry + rowH[i] - 1, 824, ry + rowH[i] - 1, { stroke: L.line, sw: 0.6, strokeOpacity: 0.6 }));
    ry += rowH[i];
  });

  // ------- 形状 -------
  const sx = 868;
  put(paper(sx, ty, 668, 262, { r: 4, fill: L.surface, grainy: true }));
  put(S('形状 SHAPE', sx + 20, ty + 26, { size: 13, weight: 600, fill: L.ink }));
  put(M('圆角 2~6px，最大不超过 6px；没有大圆角胶囊', sx + 648, ty + 26, { size: 8.5, fill: L.faint, anchor: 'end' }));
  [2, 3, 4, 6, 14].forEach((r, i) => {
    const rx = sx + 20 + i * 118;
    put(K.rect({ x: rx, y: ty + 44, w: 96, h: 54, r, fill: L.white, stroke: L.lineStrong, sw: 1 }));
    put(M(`${r === 14 ? 'pill' : `r=${r}`}`, rx, ty + 114, { size: 8, fill: L.faint }));
  });
  put(M('圆角档位：note 2 / control 3 / card 4 / window 6 / pill 999（只用于开关与胶囊）', sx + 20, ty + 132, { size: 8, fill: L.faint }));
  // 描边
  [1, 1.5, 2].forEach((w2, i) => {
    const rx = sx + 20 + i * 150;
    put(K.rect({ x: rx, y: ty + 148, w: 128, h: 44, r: 3, fill: 'none', stroke: L.lineStrong, sw: w2 }));
    put(M(`border ${w2}`, rx, ty + 206, { size: 8, fill: L.faint }));
  });
  put(K.line(sx + 470, ty + 148, sx + 648, ty + 148, { stroke: L.line, sw: 1, dash: '2 4' }));
  put(K.line(sx + 470, ty + 168, sx + 648, ty + 168, { stroke: L.lineStrong, sw: 1 }));
  put(M('分隔线：实线 1px #C6B597 / 虚线 2-4 手账线', sx + 470, ty + 206, { size: 8, fill: L.faint }));
  put(M('内高光：1px #FFFFFF 40~50% 描在卡片内侧', sx + 20, ty + 224, { size: 8, fill: L.faint }));

  // ------- 效果与纹理 -------
  const ey = y0 + 500;
  put(paper(64, ey, 780, 264, { r: 4, fill: L.surface, grainy: true }));
  put(S('光影与纹理 EFFECT', 84, ey + 26, { size: 13, weight: 600, fill: L.ink }));
  put(M('投影只用三层以内：贴纸影 / 卡片影 / 浮层影', 824, ey + 26, { size: 8.5, fill: L.faint, anchor: 'end' }));
  const shadows = [
    ['贴纸', '0 3 7 / 28%', 'url(#sticker)'],
    ['卡片', '0 1 1 + 0 5 14 / 16%', 'url(#shCard)'],
    ['浮层', '0 2 4 + 0 12 40 / 18%', 'url(#shFloat)'],
  ];
  shadows.forEach(([n, spec, f], i) => {
    const rx = 84 + i * 176;
    put(K.rect({ x: rx, y: ey + 46, w: 140, h: 84, r: 3, fill: L.white, filter: f, stroke: L.line, sw: 0.6 }));
    put(U(n, rx + 70, ey + 152, { size: 10, fill: L.ink, anchor: 'middle' }));
    put(M(spec, rx + 70, ey + 166, { size: 7, fill: L.faint, anchor: 'middle' }));
  });
  const textures = [
    ['纸纹', 'url(#grainS)', '#F3E9D6'],
    ['点阵', 'url(#dotS)', '#F7F1E4'],
    ['横线', 'url(#rules)', '#F7F1E4'],
    ['胶带斜纹', 'url(#washi)', '#EFE3CC'],
  ];
  textures.forEach(([n, pat, bg], i) => {
    const rx = 84 + i * 176;
    put(K.rect({ x: rx, y: ey + 190, w: 140, h: 44, r: 3, fill: bg, stroke: L.line, sw: 0.8 }));
    put(K.rect({ x: rx, y: ey + 190, w: 140, h: 44, r: 3, fill: pat }));
    put(M(n, rx, ey + 250, { size: 8, fill: L.faint }));
  });

  // ------- 动效 -------
  put(paper(868, ey, 668, 264, { r: 4, fill: L.surface, grainy: true }));
  put(S('动效 MOTION', 888, ey + 26, { size: 13, weight: 600, fill: L.ink }));
  put(M('easing: cubic-bezier(.2,.7,.2,1)', 1516, ey + 26, { size: 8.5, fill: L.faint, anchor: 'end' }));
  const motions = [
    ['便签滑入', '220ms · ease-out · 状态切换', 'translateY 8→0 · opacity 0→1', 0.18],
    ['印章落下', '320ms · cubic-bezier · 完成/确认', 'scale 1.3→1 · opacity 0→.9', 0.28],
    ['纸片轻摆', '3.2s · ease-in-out · 循环（仅 thinking）', 'rotate −1.5°→1.5°', 0.62],
    ['光晕呼吸', '2.4s · ease-in-out · working 光环', 'opacity .35→.7', 0.48],
  ];
  motions.forEach(([name, spec, keys, ratio], i) => {
    const my = ey + 52 + i * 50;
    put(U(name, 888, my + 10, { size: 11.5, weight: 600, fill: L.ink }));
    put(M(spec, 888, my + 28, { size: 8, fill: L.faint }));
    // 时间轴：总长 280 / 填充比例 = duration 占比
    const t0 = 1080;
    const tw = 280;
    put(K.line(t0, my + 12, t0 + tw, my + 12, { stroke: L.line, sw: 1 }));
    put(K.line(t0, my + 6, t0, my + 18, { stroke: L.lineStrong, sw: 1 }));
    put(K.line(t0 + tw, my + 6, t0 + tw, my + 18, { stroke: L.lineStrong, sw: 1 }));
    put(K.rect({ x: t0, y: my + 10.6, w: tw * ratio, h: 2.8, r: 1.4, fill: L.accent }));
    put(K.circle({ cx: t0, cy: my + 12, r: 2.2, fill: L.ink, fillOpacity: 0.45 }));
    put(K.circle({ cx: t0 + tw * ratio, cy: my + 12, r: 3.2, fill: L.accent }));
    put(M(keys, 1516, my + 15, { size: 7.6, fill: L.muted, anchor: 'end' }));
  });
  put(M('reduced-motion：所有位移/旋转/缩放改为 opacity 直切，时长 1ms', 888, ey + 250, { size: 8, fill: L.accent }));

  // ------- 图标语言 + 映射 -------
  const iy = y0 + 786;
  put(paper(64, iy, 1472, 196, { r: 4, fill: L.surface, grainy: true }));
  put(S('图标与图形 IQONS', 84, iy + 26, { size: 13, weight: 600, fill: L.ink }));
  put(M('状态图形只做六种：点 / 虚线圈 / 波浪 / 方章 / 折角 / 对勾；不引入第三方图标库', 1516, iy + 26, { size: 8.5, fill: L.faint, anchor: 'end' }));
  const icons = [
    ['idle', '圆点', (cx, cy) => K.circle({ cx, cy, r: 5, fill: ST.idle.c })],
    ['thinking', '虚线圈', (cx, cy) => K.circle({ cx, cy, r: 9, fill: 'none', stroke: ST.thinking.c, sw: 1.4, dash: '2 3' })],
    ['working', '波浪', (cx, cy) => `<path d="M ${cx - 12} ${cy} q 6 -8 12 0 q 6 8 12 0" fill="none" stroke="${ST.working.c}" stroke-width="1.6"/>`],
    ['approval', '方章', (cx, cy) => [K.rect({ x: cx - 9, y: cy - 9, w: 18, h: 18, r: 2, fill: 'none', stroke: ST.approval.c, sw: 1.6 }), K.text({ x: cx, y: cy + 4, s: '确', size: 9, family: F.ui, fill: ST.approval.c, anchor: 'middle', weight: 700 })].join('')],
    ['error', '折角', (cx, cy) => [K.rect({ x: cx - 9, y: cy - 9, w: 18, h: 18, r: 2, fill: 'none', stroke: ST.error.c, sw: 1.6 }), `<path d="M ${cx + 1} ${cy - 9} L ${cx + 9} ${cy - 1} L ${cx + 1} ${cy - 1}" fill="none" stroke="${ST.error.c}" stroke-width="1.4"/>`].join('')],
    ['done', '对勾', (cx, cy) => `<path d="M ${cx - 8} ${cy} L ${cx - 2} ${cy + 6} L ${cx + 9} ${cy - 7}" fill="none" stroke="${ST.done.c}" stroke-width="2" stroke-linecap="round"/>`],
  ];
  icons.forEach(([key, name, draw], i) => {
    const cx = 110 + i * 116;
    const cy = iy + 70;
    put(K.rect({ x: cx - 26, y: cy - 26, w: 52, h: 52, r: 3, fill: L.white, stroke: L.line, sw: 0.8 }));
    put(draw(cx, cy));
    put(K.text({ x: cx, y: iy + 110, s: ST[key].zh, size: 9, family: F.ui, fill: L.muted, anchor: 'middle' }));
    put(M(name, cx, iy + 122, { size: 7.5, fill: L.faint, anchor: 'middle' }));
  });
  // 手绘强调元素
  put(K.rect({ x: 820, y: iy + 44, w: 300, h: 46, r: 3, fill: L.white, stroke: L.line, sw: 0.8 }));
  put(K.text({ x: 834, y: iy + 62, s: '手绘元素只用一处：', size: 9, family: F.ui, fill: L.faint }));
  put(HD('荧光笔 / 胶带 / 印章', 834, iy + 82, { size: 14, fill: L.accent }));
  put(highlight(1034, iy + 64, 78, L.highlight, -0.6, 0.5, 18));
  put(K.text({ x: 1030, y: iy + 82, s: '最多 1 处', size: 9, family: F.ui, fill: L.muted }));
  // 图标 → 状态映射
  put(M('映射：空闲 / 休眠 = 点（休眠空心）· 思考中 / 等待输入 = 虚线圈 · 执行工具 = 波浪 · 等待确认 = 方章 · 完成 = 对勾 · 错误 = 折角', 84, iy + 142, { size: 8, fill: L.faint }));
  // 映射行
  put(M('design tokens → CSS 变量（示例）', 84, iy + 166, { size: 8.5, fill: L.faint, ls: 1.2 }));
  const maps = [
    '--lp-bg: #F7F1E4;  --lp-surface: #FCF7EC;  --lp-surface-alt: #F3EBD9;  --lp-ink: #2B241C;  --lp-accent: #B4472F;',
    '--lp-radius-card: 4px;  --lp-radius-note: 2px;  --lp-border-soft: 1px solid #DCCFB6;  --lp-shadow-card: 0 1px 1px rgba(92,70,38,.16), 0 5px 14px rgba(92,70,38,.10);',
    '--lp-motion-base: 220ms cubic-bezier(.2,.7,.2,1);  --lp-type-display: 700 40px/1.1 "Noto Serif SC", serif;  --lp-state-thinking: #4F6B8C;',
  ];
  maps.forEach((m, i) => put(M(m, 84, iy + 184 + i * 13, { size: 8.5, fill: L.muted })));

  // 板尾
  const fy = iy + 216 + 46;
  put(K.line(64, fy, 1536, fy, { stroke: L.lineStrong, sw: 1, dash: '2 4' }));
  put(S('纸感手账 · PAPER JOURNAL', 64, fy + 32, { size: 15, weight: 700, fill: L.ink }));
  put(HD('—— 一页一页，陪你把手头的活干完。', 470, fy + 32, { size: 13, fill: L.accent }));
  put(M('方向 C · 6 sections · 2026.10 · 交付：board.png / tokens.json / notes.md', 1536, fy + 30, { size: 8.5, fill: L.faint, anchor: 'end' }));
  sh.y = fy + 58;
}

/* =========================================================================
 * 11. 运行
 * ========================================================================= */
header();
sec01();
sec02();
sec03();
sec04();
sec05();
sec06();

const res = await sh.finish(OUT);
console.log(JSON.stringify({ file: res.file, width: res.width, height: res.height }));
