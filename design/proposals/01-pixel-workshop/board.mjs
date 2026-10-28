/**
 * 方案 A · 像素工坊 PIXEL WORKSHOP —— 设计板生成脚本
 *
 * 运行：node design/proposals/01-pixel-workshop/board.mjs
 * 输出：design/proposals/01-pixel-workshop/board.png（宽 1600，高 ~5000）
 *
 * 设计语言：8px 网格 / 0 圆角 / 2px 硬描边 / 4px 位移硬投影 / steps() 帧动画 / 像素点阵图标。
 * 本文件只写本目录，不改 design/lib/svgkit.mjs。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../lib/svgkit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'board.png');

const W = 1600;
const PAD = 64;
const RIGHT = W - PAD; // 1536
const INNER = W - PAD * 2; // 1472

/* =========================================================================
 * 1. 设计 token（数值必须与 tokens.json / board.png 标注一致）
 * ========================================================================= */
const C = {
  bg: '#0a0a10',
  surface: '#14141f',
  surfaceAlt: '#1b1b2a',
  surfaceRise: '#232336',
  line: '#2c2c42',
  lineStrong: '#464666',
  text: '#f2ead8',
  textMuted: '#a8a2ba',
  textFaint: '#6f6a88',
  accent: '#ffa63d',
  accentSoft: '#33230f',
  accentInk: '#16100a',
  accentShade: '#a05c12',
  secondary: '#59c9d6',
  secondarySoft: '#0e2f34',
  gold: '#ffd166',
  mint: '#7ee2a8',
  coral: '#ff8fa3',
  red: '#ff5f5f',
  ink: '#0b0b12',
  shadow: '#050509',
  light: {
    bg: '#f2ecdd',
    surface: '#faf6ea',
    line: '#d6cdb8',
    text: '#1b1b26',
    muted: '#5f5c70',
    accent: '#c2691c',
  },
};

const STATE = {
  idle: { cn: '空闲', color: '#8d93ab', icon: 'idle', en: 'IDLE' },
  thinking: { cn: '思考中', color: '#ffa63d', icon: 'thinking', en: 'THINKING' },
  working: { cn: '执行工具', color: '#ffd166', icon: 'working', en: 'WORKING' },
  input: { cn: '等待输入', color: '#59c9d6', icon: 'input', en: 'INPUT' },
  approval: { cn: '等待确认', color: '#ff8fa3', icon: 'approval', en: 'APPROVAL' },
  done: { cn: '完成', color: '#7ee2a8', icon: 'done', en: 'DONE' },
  error: { cn: '错误', color: '#ff5f5f', icon: 'error', en: 'ERROR' },
  sleep: { cn: '休眠', color: '#6f7391', icon: 'sleep', en: 'SLEEP' },
};

const F = {
  ui: "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  mono: "Consolas, 'Cascadia Mono', monospace",
};

/* =========================================================================
 * 2. 小工具（文字溢出守卫、像素路径、图标点阵、贴图）
 * ========================================================================= */
const warnings = [];
const warn = (s) => warnings.push(s);

function tx(x, y, s, o = {}) {
  const size = o.size ?? 13;
  const ls = o.ls ?? 0;
  const str = String(s);
  if (o.maxW) {
    const w = K.measure(str, size) + Math.max(0, str.length - 1) * ls;
    if (w > o.maxW) warn(`[溢出] ${o.tag || ''} "${str}" ${w.toFixed(0)} > ${o.maxW}`);
  }
  return K.text({
    x, y, s: str,
    size,
    weight: o.weight,
    fill: o.fill ?? C.text,
    family: o.mono ? F.mono : F.ui,
    anchor: o.anchor,
    baseline: o.baseline ?? 'middle',
    ls: ls || undefined,
    opacity: o.opacity,
    filter: o.filter,
  });
}

/** 多行段落：返回 SVG 字符串（调用方 add/追加） */
function par(x, y, s, o = {}) {
  const size = o.size ?? 11;
  const lh = o.lineHeight ?? Math.round(size * 1.65);
  const rows = K.wrap(s, size, o.w ?? 300);
  return rows.map((row, i) => tx(x, y + i * lh, row, { ...o, size, maxW: o.w })).join('');
}

/** 像素斜角矩形路径（c = 斜角像素尺寸） */
function pxPts(x, y, w, h, c = 8) {
  const s = c / 2;
  return [
    [x + c, y], [x + w - c, y],
    [x + w - c, y + s], [x + w - s, y + s], [x + w - s, y + c], [x + w, y + c],
    [x + w, y + h - c],
    [x + w - s, y + h - c], [x + w - s, y + h - s], [x + w - c, y + h - s], [x + w - c, y + h],
    [x + c, y + h],
    [x + c, y + h - s], [x + s, y + h - s], [x + s, y + h - c], [x, y + h - c],
    [x, y + c],
    [x + s, y + c], [x + s, y + s], [x + c, y + s],
  ];
}
const pxD = (x, y, w, h, c = 8) => pxPts(x, y, w, h, c).map(([a, b], i) => `${i ? 'L' : 'M'}${a} ${b}`).join(' ') + ' Z';

/** 硬投影 + 像素斜角盒子（焦点元素） */
function sticker(x, y, w, h, o = {}) {
  const c = o.c ?? 8;
  const shadow = o.shadow ?? 4;
  let s = '';
  if (shadow) s += K.el('path', { d: pxD(x + shadow, y + shadow, w, h, c), fill: o.shadowColor ?? C.shadow });
  s += K.el('path', {
    d: pxD(x, y, w, h, c),
    fill: o.fill ?? C.surface,
    stroke: o.stroke ?? C.lineStrong,
    'stroke-width': o.sw ?? 2,
    opacity: o.opacity,
  });
  return s;
}

/** 1px 细线面板（正文/信息区） */
function panel(x, y, w, h, o = {}) {
  let s = '';
  if (o.shadow) s += K.rect({ x: x + o.shadow, y: y + o.shadow, w, h, fill: o.shadowColor ?? C.shadow });
  s += K.rect({ x, y, w, h, fill: o.fill ?? C.surface, stroke: o.edge ?? C.line, sw: o.sw ?? 1 });
  if (o.brackets) s += brackets(x, y, w, h, { color: o.brackets, len: o.bLen ?? 16, sw: o.bSw ?? 2, inset: o.inset ?? 6 });
  return s;
}

/** 面板四角的像素 L 角标 */
function brackets(x, y, w, h, o = {}) {
  const l = x + (o.inset ?? 6), t = y + (o.inset ?? 6), r = x + w - (o.inset ?? 6), b = y + h - (o.inset ?? 6);
  const len = o.len ?? 16, sw = o.sw ?? 2, col = o.color ?? C.accent;
  const p = (a, b2, c2, d) => K.el('line', { x1: a, y1: b2, x2: c2, y2: d, stroke: col, 'stroke-width': sw });
  return [
    p(l, t, l + len, t), p(l, t, l, t + len),
    p(r - len, t, r, t), p(r, t, r, t + len),
    p(l, b - len, l, b), p(l, b, l + len, b),
    p(r - len, b, r, b), p(r, b - len, r, b),
  ].join('');
}

/** 内联 defs（clipPath） */
const clipDef = (id, d) => `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>`;
const clipUse = (id, body) => `<g clip-path="url(#${id})">${body}</g>`;

/* -------- 像素图标点阵（5×5 / 7×7） -------- */
const G = {
  idle: ['.....', '.###.', '#...#', '#...#', '.###.'],
  thinking: ['..#..', '.....', '.#.#.', '.....', '..#..'],
  working: ['....#', '..#.#', '..#.#', '#.#.#', '#.#.#'],
  input: ['..#..', '.....', '.....', '.....', '####.'],
  approval: ['..#..', '..#..', '..#..', '.....', '..#..'],
  done: ['.....', '...#.', '..#..', '#.#..', '.#...'],
  error: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  sleep: ['###..', '...#.', '..#..', '.#...', '###..'],
  close: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  plus: ['..#..', '..#..', '#####', '..#..', '..#..'],
  check: ['.....', '...#.', '..#..', '#.#..', '.#...'],
  search: ['.###.', '#...#', '#...#', '.###.', '....#'],
  down: ['..#..', '.###.', '#####', '..#..', '..#..'],
  monitor: ['#######', '#.....#', '#.#.#.#', '#.....#', '#######', '...#...', '..###..'],
  swap: ['..###..', '.#...#.', '#......', '#.....#', '#.....#', '.#...#.', '..###..'],
  hide: ['#......', '.#####.', '#..#..#', '.#####.', '......#', '....#..', '...#...'],
  gear: ['.#.#.', '#####', '.###.', '#####', '.#.#.'],
  dots: ['.....', '#.#.#', '.....', '#.#.#', '.....'],
  lock: ['.###.', '.#.#.', '#####', '#.#.#', '#####'],
  bag: ['..#..', '.###.', '#...#', '#...#', '#####'],
  star: ['..#..', '.###.', '#####', '.###.', '.#.#.'],
};

function glyph(name, x, y, unit = 3, color = C.text, opacity) {
  const rows = G[name] || G.idle;
  let s = '';
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') s += K.rect({ x: x + c * unit, y: y + r * unit, w: unit, h: unit, fill: color, opacity });
    });
  });
  return s;
}
const glyphW = (name, unit) => (G[name]?.[0]?.length ?? 5) * unit;

const BRAND = [
  '..####..',
  '.#....#.',
  '#.#..#.#',
  '#......#',
  '#..##..#',
  '.#....#.',
  '..#..#..',
  '...##...',
];
function brandGlyph(x, y, unit = 2, color = C.accent) {
  let s = '';
  BRAND.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') s += K.rect({ x: x + c * unit, y: y + r * unit, w: unit, h: unit, fill: color });
    });
  });
  return s;
}

/* -------- 角色贴图 -------- */
const RATIO = { deepseek: 341 / 256, claude: 224 / 256, hd: 1 };
function spr(name, x, y, o = {}) {
  const kind = name.includes('-hd') ? 'hd' : name.startsWith('claude') ? 'claude' : 'deepseek';
  const ratio = RATIO[kind];
  let w, h;
  if (o.w) { w = o.w; h = w * ratio; } else { h = o.h ?? 300; w = h / ratio; }
  return K.el('image', {
    href: K.spriteUri(name), x, y, width: w, height: h,
    opacity: o.opacity, filter: o.filter, preserveAspectRatio: 'xMidYMid meet',
  });
}
/** 等比放进盒子里并居中 */
function sprFit(name, bx, by, bw, bh, o = {}) {
  const kind = name.includes('-hd') ? 'hd' : name.startsWith('claude') ? 'claude' : 'deepseek';
  const ratio = RATIO[kind];
  const h = Math.min(bh, bw * ratio);
  const w = h / ratio;
  return spr(name, bx + (bw - w) / 2, by + (bh - h) / 2, { h, opacity: o.opacity, filter: o.filter });
}

const ell = (cx, cy, rx, ry, o = {}) =>
  K.el('ellipse', { cx, cy, rx, ry, fill: o.fill, 'fill-opacity': o.fillOpacity, filter: o.filter, opacity: o.opacity });

/* -------- 组件：状态胶囊 / 开关 / 三档滑杆 / 勾选 -------- */
function chip(x, y, o = {}) {
  const st = STATE[o.state ?? 'working'];
  const h = o.h ?? 36;
  const w = o.w ?? 210;
  const c = 4;
  const showProg = o.progress !== false;
  const ty = y + (showProg ? h / 2 - 3 : h / 2);
  let s = '';
  s += K.el('path', { d: pxD(x + 3, y + 3, w, h, c), fill: o.shadowColor ?? C.shadow });
  s += K.el('path', {
    d: pxD(x, y, w, h, c),
    fill: o.fill ?? '#12121c',
    stroke: o.stroke ?? C.line,
    'stroke-width': o.sw ?? 1,
  });
  s += K.rect({ x: x + 3, y: y + 3, w: 3, h: h - 6, fill: st.color });
  s += glyph(st.icon, x + 13, y + (showProg ? -1 : 0) + h / 2 - 7.5, 3, st.color);
  s += tx(x + 33, ty, o.label ?? st.cn, { size: o.size ?? 11.5, weight: 600, fill: C.text });
  if (o.meta) s += tx(x + w - 9, ty, o.meta, { size: 8.5, mono: true, fill: C.textMuted, anchor: 'end' });
  if (showProg) {
    const segs = 8, gap = 2, pad = 8;
    const sw2 = (w - pad * 2 - gap * (segs - 1)) / segs;
    const active = o.progress ?? 5;
    for (let i = 0; i < segs; i++) {
      s += K.rect({ x: x + pad + i * (sw2 + gap), y: y + h - 6, w: sw2, h: 2, fill: i < active ? st.color : C.line });
    }
  }
  return s;
}

function toggle(x, y, on, label) {
  const w = 38, h = 18;
  let s = '';
  s += K.el('path', {
    d: pxD(x, y, w, h, 3),
    fill: on ? C.accent : C.surfaceAlt,
    stroke: on ? C.accentShade : C.lineStrong,
    'stroke-width': 1,
  });
  s += K.rect({ x: on ? x + w - 14 : x + 3, y: y + 3, w: 11, h: h - 6, fill: on ? C.ink : C.textMuted });
  if (label) s += tx(x + w + 8, y + h / 2, label, { size: 8, mono: true, fill: on ? C.accent : C.textFaint, ls: 1.2 });
  return s;
}

function slider3(x, y, w, val = 1, o = {}) {
  const h = o.h ?? 18;
  const cy = y + h / 2;
  const pos = [x, x + (w - 12) / 2, x + w - 12];
  let s = K.rect({ x, y: cy - 1, w, h: 2, fill: C.lineStrong });
  for (let i = 0; i < 3; i++) {
    const on = i <= val;
    s += K.rect({ x: pos[i], y: cy - 5, w: 12, h: 12, fill: on ? C.accent : C.surface, stroke: on ? C.accentShade : C.lineStrong, sw: 1 });
    if (i === val) s += K.rect({ x: pos[i] + 3, y: cy - 2, w: 6, h: 6, fill: C.accentInk });
  }
  if (o.labels !== false) {
    ['小', '中', '大'].forEach((t, i) => {
      s += tx(pos[i] + 6, y + h + 11, t, { size: 8.5, fill: i === val ? C.text : C.textFaint, anchor: 'middle' });
    });
  }
  return s;
}

function checkbox(x, y, on, label, o = {}) {
  const b = 14;
  let s = K.rect({ x, y, w: b, h: b, fill: on ? C.accent : 'none', stroke: on ? C.accent : C.lineStrong, sw: 1 });
  if (on) s += glyph('done', x + 2, y + 2, 2, C.ink);
  s += tx(x + b + 10, y + b / 2, label, { size: o.size ?? 11.5, fill: on ? C.text : C.textMuted });
  if (o.meta) s += tx(o.metaX ?? x + 250, y + b / 2, o.meta, { size: 8, mono: true, fill: C.textFaint, anchor: 'end' });
  return s;
}

/* =========================================================================
 * 3. defs / sheet
 * ========================================================================= */
const DEFS = `
<linearGradient id="bgBoard" x1="0" y1="0" x2="0.35" y2="1">
  <stop offset="0" stop-color="#0d0d16"/><stop offset="0.45" stop-color="#0a0a10"/><stop offset="1" stop-color="#08080d"/>
</linearGradient>
<pattern id="boardDots" width="16" height="16" patternUnits="userSpaceOnUse">
  <rect width="2" height="2" fill="#f2ead8" fill-opacity="0.045"/>
</pattern>
<pattern id="grid8" width="8" height="8" patternUnits="userSpaceOnUse">
  <path d="M8 0H0V8" fill="none" stroke="#f2ead8" stroke-opacity="0.055" stroke-width="1"/>
</pattern>
<pattern id="grid16" width="16" height="16" patternUnits="userSpaceOnUse">
  <path d="M16 0H0V16" fill="none" stroke="#f2ead8" stroke-opacity="0.05" stroke-width="1"/>
</pattern>
<pattern id="dotsTex" width="8" height="8" patternUnits="userSpaceOnUse">
  <rect x="1" y="1" width="3" height="3" fill="#ffa63d" fill-opacity="0.55"/>
</pattern>
<pattern id="scanTex" width="4" height="4" patternUnits="userSpaceOnUse">
  <rect width="4" height="2" fill="#ffa63d" fill-opacity="0.16"/>
</pattern>
<pattern id="ditherTex" width="6" height="6" patternUnits="userSpaceOnUse">
  <rect x="0" y="0" width="3" height="3" fill="#ffa63d" fill-opacity="0.5"/>
  <rect x="3" y="3" width="3" height="3" fill="#59c9d6" fill-opacity="0.45"/>
</pattern>
<linearGradient id="wall" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0" stop-color="#221c36"/><stop offset="0.52" stop-color="#15141f"/><stop offset="1" stop-color="#0a0a10"/>
</linearGradient>
<radialGradient id="aurora" cx="76%" cy="28%" r="72%">
  <stop offset="0" stop-color="#ffa63d" stop-opacity="0.17"/>
  <stop offset="0.42" stop-color="#b4557a" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0"/>
</radialGradient>
<radialGradient id="petGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#ffa63d" stop-opacity="0.3"/>
  <stop offset="0.55" stop-color="#ffa63d" stop-opacity="0.08"/>
  <stop offset="1" stop-color="#ffa63d" stop-opacity="0"/>
</radialGradient>
<radialGradient id="stageGlow" cx="50%" cy="44%" r="62%">
  <stop offset="0" stop-color="#ffa63d" stop-opacity="0.15"/>
  <stop offset="0.6" stop-color="#ffa63d" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#ffa63d" stop-opacity="0"/>
</radialGradient>
<linearGradient id="coverGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#272238"/><stop offset="1" stop-color="#12121c"/>
</linearGradient>
<linearGradient id="fadeDown" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#14141f" stop-opacity="0"/>
  <stop offset="1" stop-color="#14141f" stop-opacity="1"/>
</linearGradient>
<filter id="blur4" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="blur10" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="blur20" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="20"/></filter>
`;

const sh = K.createSheet({
  width: W,
  theme: { fonts: { display: F.ui, ui: F.ui, mono: F.mono } },
  bg: 'url(#bgBoard)',
  defs: DEFS,
});

const parts = sh.parts;
let y = PAD;
// 画板底纹
parts.push(K.rect({ x: 0, y: 0, w: W, h: 20000, fill: 'url(#boardDots)' }));

const add = (s, adv = 0) => {
  if (s) parts.push(s);
  y += adv;
  return s;
};

/* -------- 分节标题 -------- */
function sectionHead(index, title, note) {
  const top = y;
  parts.push(K.rect({ x: PAD, y: top + 2, w: 26, h: 26, fill: 'none', stroke: C.lineStrong, sw: 1 }));
  parts.push(K.rect({ x: PAD + 2, y: top + 4, w: 3, h: 3, fill: C.accent }));
  parts.push(tx(PAD + 13, top + 16, String(index).padStart(2, '0'), { size: 11.5, mono: true, fill: C.accent, anchor: 'middle', ls: 1 }));
  parts.push(tx(PAD + 46, top + 19, title, { size: 22, weight: 650, fill: C.text, ls: 2 }));
  parts.push(tx(RIGHT, top + 18, note, { size: 11, fill: C.textFaint, anchor: 'end', ls: 0.5 }));
  parts.push(K.el('line', { x1: PAD, y1: top + 44, x2: RIGHT, y2: top + 44, stroke: C.line, 'stroke-width': 1 }));
  parts.push(K.el('line', { x1: PAD, y1: top + 44, x2: PAD + 96, y2: top + 44, stroke: C.accent, 'stroke-width': 2 }));
  y = top + 68;
  return y;
}

/* =========================================================================
 * 4. 封面
 * ========================================================================= */
function drawHeader() {
  const top = PAD;
  add(tx(PAD, top + 12, 'LINGPET / 灵伴 · 设计方案 A', { size: 11, mono: true, fill: C.accent, ls: 4 }));
  add(tx(PAD, top + 32, 'PIXEL NATIVE UI · 8PX GRID · ZERO RADIUS · STEPS() MOTION', { size: 9, mono: true, fill: C.textFaint, ls: 2.4 }));

  // 标题 + 硬投影
  add(tx(PAD + 6, top + 120, '像素工坊', { size: 66, weight: 700, fill: '#2a2012', ls: 8 }));
  add(tx(PAD, top + 114, '像素工坊', { size: 66, weight: 700, fill: C.text, ls: 8 }));
  add(tx(PAD + 3, top + 168, 'PIXEL  WORKSHOP', { size: 14, mono: true, fill: C.accent, ls: 7 }));
  // 像素角标
  add(K.rect({ x: PAD + 302, y: top + 62, w: 8, h: 8, fill: C.accent }));
  add(K.rect({ x: PAD + 314, y: top + 54, w: 8, h: 8, fill: C.accent, opacity: 0.55 }));
  add(K.rect({ x: PAD + 326, y: top + 46, w: 8, h: 8, fill: C.accent, opacity: 0.3 }));

  add(par(PAD, top + 204, '把像素角色自己的世界做成界面：8px 网格、2px 硬描边、steps() 帧动画。像素是它的母语，秩序是现代的——不是给后台贴一层复古皮肤。', {
    size: 15, lineHeight: 25, w: 860, fill: C.textMuted,
  }));

  // 关键词
  let kx = PAD;
  ['8px 网格', '2px 硬描边', 'steps() 帧动画', '≤ 6 个功能色'].forEach((t) => {
    const pw = Math.ceil(K.measure(t, 11)) + 28;
    add(K.el('path', { d: pxD(kx, top + 252, pw, 26, 4), fill: 'none', stroke: C.line }));
    add(K.rect({ x: kx + 10, y: top + 263, w: 6, h: 6, fill: C.accent }));
    add(tx(kx + 22, top + 265, t, { size: 11, fill: C.textMuted }));
    kx += pw + 10;
  });

  // 右侧「卡带标签」
  const cx = RIGHT - 468, cy = top + 2, cw = 468, ch = 200;
  add(sticker(cx, cy, cw, ch, { fill: C.surface, c: 10, stroke: C.lineStrong, sw: 2, shadow: 6 }));
  const tapeW = (cw - 8) / 6;
  for (let i = 0; i < 6; i++) add(K.rect({ x: cx + 4 + i * tapeW, y: cy + 2, w: tapeW - 3, h: 6, fill: C.accent }));
  add(tx(cx + 22, cy + 38, 'CARTRIDGE / 01', { size: 8.5, mono: true, fill: C.accent, ls: 2.4 }));
  add(tx(cx + 22, cy + 66, 'PIXEL WORKSHOP', { size: 13, mono: true, fill: C.text, ls: 5 }));
  add(tx(cx + 22, cy + 94, '像素工坊 · 方案 A', { size: 18, weight: 700, fill: C.text, ls: 2 }));
  add(tx(cx + 22, cy + 116, '深靛底 / 米白字 / 琥珀主强调 / 冰蓝次强调', { size: 10.5, fill: C.textMuted, maxW: cw - 44, tag: 'header-note' }));
  const pal = [['BG', C.bg], ['SURFACE', C.surfaceRise], ['AMBER', C.accent], ['CREAM', C.text], ['ICE', C.secondary]];
  pal.forEach(([name, hex], i) => {
    const px = cx + 22 + i * 86;
    add(K.rect({ x: px, y: cy + 132, w: 78, h: 26, fill: hex, stroke: C.line, sw: 1 }));
    add(tx(px, cy + 176, hex.toUpperCase(), { size: 7.5, mono: true, fill: C.textMuted }));
    add(tx(px, cy + 188, name, { size: 7, mono: true, fill: C.textFaint, ls: 1.2 }));
  });
  y = top + 300;
}
drawHeader();

/* =========================================================================
 * 5. 01 桌面浮层
 * ========================================================================= */
sectionHead(1, '桌面浮层', '透明窗口 · 8 种状态语言 · 焦点只给角色');

// 场景小注
add(tx(PAD, y + 8, 'SIMULATED DESKTOP · 2560 × 1440 · WALLPAPER DESATURATED', { size: 8.5, mono: true, fill: C.textFaint, ls: 1.6 }));
add(tx(RIGHT, y + 8, 'TRANSPARENT WINDOW 512 × 512 · PET 1:1 SCALE', { size: 8.5, mono: true, fill: C.textFaint, ls: 1.6, anchor: 'end' }));
y += 24;

const sx = PAD, sy = y, sW = INNER, sH = 430, sC = 12;
add(clipDef('sceneClip', pxD(sx, sy, sW, sH, sC)));
let scene = '';
scene += K.el('path', { d: pxD(sx, sy, sW, sH, sC), fill: 'url(#wall)' });
scene += K.rect({ x: sx, y: sy, w: sW, h: sH, fill: 'url(#aurora)' });

/* --- 模拟窗口 A：编辑器 --- */
function fakeEditor(x, y2, w, h, focused) {
  let s = '';
  s += K.rect({ x, y: y2, w, h, fill: '#0F0F18', stroke: focused ? '#333b58' : '#242a42', sw: 1 });
  s += K.rect({ x, y: y2, w, h: 24, fill: focused ? '#181822' : '#14141C' });
  ['#ff5f5f', '#ffd166', '#7ee2a8'].forEach((cc, i) => {
    s += K.rect({ x: x + 10 + i * 12, y: y2 + 9, w: 6, h: 6, fill: cc, opacity: focused ? 0.9 : 0.55 });
  });
  s += tx(x + 54, y2 + 12, 'lingpet — workspace', { size: 7.5, mono: true, fill: focused ? '#98a0c0' : '#6f7593' });
  s += K.rect({ x, y: y2 + 24, w: 34, h: h - 24, fill: '#0B0B12' });
  for (let i = 0; i < 10; i++) s += K.rect({ x: x + 12, y: y2 + 38 + i * 20, w: 10, h: 3, fill: '#343A52' });
  // 彩色代码条砍到约 1/3，其余退成灰蓝，减少「线框感」
  const code = [
    [[86, '#59c9d6'], [42, '#6b7396'], [64, '#ffa63d']],
    [[52, '#6b7396'], [96, '#6b7396']],
    [[64, '#6b7396'], [38, '#6b7396'], [58, '#6b7396'], [30, '#6b7396']],
    [[40, '#7ee2a8'], [72, '#6b7396']],
    [[28, '#6b7396'], [88, '#59c9d6'], [46, '#6b7396']],
    [[70, '#ffa63d'], [34, '#6b7396']],
    [[44, '#6b7396'], [56, '#6b7396'], [66, '#6b7396']],
    [[58, '#6b7396'], [36, '#6b7396']],
    [[92, '#6b7396'], [40, '#6b7396']],
  ];
  code.forEach((segs, i) => {
    let lx = x + 46;
    segs.forEach(([sw2, col]) => {
      s += K.rect({ x: lx, y: y2 + 37 + i * 20, w: sw2, h: 5, fill: col, fillOpacity: 0.45 });
      lx += sw2 + 8;
    });
  });
  // 当前行高亮 + 光标
  s += K.rect({ x: x + 34, y: y2 + 30 + 4 * 20, w: w - 44, h: 15, fill: '#59c9d6', fillOpacity: 0.08 });
  s += K.rect({ x: x + 46 + 70 + 8 + 34 + 8, y: y2 + 33 + 4 * 20, w: 3, h: 12, fill: C.accent });
  // 状态栏
  s += K.rect({ x, y: y2 + h - 18, w, h: 18, fill: '#131826' });
  s += tx(x + 12, y2 + h - 9, 'main*', { size: 6.5, mono: true, fill: '#8d93ab' });
  s += tx(x + 52, y2 + h - 9, 'TypeScript · UTF-8 · Ln 42, Col 8', { size: 6.5, mono: true, fill: '#6f7593', maxW: w - 70, tag: 'editor-status' });
  return s;
}
/* --- 模拟窗口 B：终端 --- */
function fakeTerm(x, y2, w, h) {
  let s = '';
  s += K.rect({ x, y: y2, w, h, fill: '#0C0C14', stroke: '#252b3e', sw: 1 });
  s += K.rect({ x, y: y2, w, h: 22, fill: '#13131C' });
  ['#ff5f5f', '#ffd166', '#7ee2a8'].forEach((cc, i) => {
    s += K.rect({ x: x + 10 + i * 11, y: y2 + 8, w: 5, h: 5, fill: cc, opacity: 0.5 });
  });
  s += tx(x + 50, y2 + 11, 'zsh — dsh', { size: 7, mono: true, fill: '#6f7593' });
  // 真实提示行
  s += K.rect({ x: x + 12, y: y2 + 30, w: 4, h: 6, fill: C.accent });
  s += tx(x + 20, y2 + 33, 'dsh run --watch', { size: 7, mono: true, fill: '#98a0c0', maxW: w - 34, tag: 'term-line' });
  s += tx(x + 12, y2 + 49, '◇ 3 sessions · cursor codex dsh', { size: 6.5, mono: true, fill: '#6f7593', maxW: w - 24, tag: 'term-line2' });
  s += tx(x + 12, y2 + 64, '✓ tasks/sync.ts  2.1s', { size: 6.5, mono: true, fill: '#7ee2a8', maxW: w - 24, tag: 'term-line3' });
  for (let i = 0; i < 4; i++) {
    const ww = [70, 120, 96, 150][i];
    s += K.rect({ x: x + 14, y: y2 + 80 + i * 19, w: ww, h: 4, fill: i === 1 ? C.accent : '#5d6685', fillOpacity: i === 1 ? 0.6 : 0.35 });
  }
  s += K.rect({ x: x + 14, y: y2 + 80 + 4 * 19, w: 6, h: 11, fill: C.accent });
  return s;
}
/* --- 模拟窗口 C：设置页（被桌宠压住） --- */
function fakeSettings(x, y2, w, h) {
  let s = '';
  s += K.rect({ x, y: y2, w, h, fill: '#0E0E16', stroke: '#232941', sw: 1 });
  s += K.rect({ x, y: y2, w, h: 26, fill: '#171724' });
  s += tx(x + 16, y2 + 14, '设置 · 桌宠', { size: 8.5, fill: '#7d84a3' });
  s += tx(x + 18, y2 + 46, '外观与显示', { size: 9, weight: 600, fill: '#a8a2ba' });
  s += tx(x + w - 18, y2 + 46, '实时预览', { size: 7, fill: '#5f6684', anchor: 'end' });
  // 选择角色
  s += K.rect({ x: x + 18, y: y2 + 60, w: w - 36, h: 46, fill: '#181b28', stroke: '#252b3e', sw: 1 });
  s += tx(x + 30, y2 + 76, '选择角色', { size: 7.5, fill: '#8d93ab' });
  s += tx(x + 30, y2 + 92, 'DeepSeek · 1 个形象', { size: 6.5, mono: true, fill: '#5f6684' });
  s += K.rect({ x: x + w - 62, y: y2 + 74, w: 26, h: 12, fill: C.accent, fillOpacity: 0.45 });
  s += K.rect({ x: x + w - 50, y: y2 + 77, w: 8, h: 6, fill: '#12131d' });
  // 选择形象
  s += K.rect({ x: x + 18, y: y2 + 118, w: w - 36, h: 46, fill: '#181b28', stroke: '#252b3e', sw: 1 });
  s += tx(x + 30, y2 + 134, '选择形象', { size: 7.5, fill: '#8d93ab' });
  s += tx(x + 30, y2 + 150, '鲸鱼娘 · 原图 / 像素', { size: 6.5, mono: true, fill: '#5f6684' });
  s += K.rect({ x: x + w - 62, y: y2 + 132, w: 26, h: 12, fill: C.accent, fillOpacity: 0.45 });
  s += K.rect({ x: x + w - 50, y: y2 + 135, w: 8, h: 6, fill: '#12131d' });
  // 主按钮
  s += K.rect({ x: x + 18, y: y2 + 178, w: 120, h: 30, fill: C.accent, fillOpacity: 0.85, stroke: C.accentShade, sw: 1 });
  s += tx(x + 78, y2 + 193, '隐藏桌宠', { size: 8.5, weight: 600, fill: '#241a10', anchor: 'middle' });
  s += K.rect({ x: x + 148, y: y2 + 178, w: 96, h: 30, fill: '#181b28', stroke: '#252b3e', sw: 1 });
  s += tx(x + 196, y2 + 193, '更多操作', { size: 8, fill: '#8d93ab', anchor: 'middle' });
  return s;
}

// 像素光标（8px 网格上的 2px 方块拼成，先铺 1px 墨边再填米白）
function pixelCursor(x, y2, unit = 2, fill = C.text, ink = C.ink) {
  const CUR = [
    'X....',
    'XX...',
    'XXX..',
    'XXXX.',
    'XXXXX',
    'XXX..',
    'X.XX.',
    '...XX',
  ];
  let s = '';
  CUR.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 'X') continue;
      s += K.rect({ x: x + i * unit - 1, y: y2 + j * unit - 1, w: unit + 2, h: unit + 2, fill: ink });
    }
  });
  CUR.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 'X') continue;
      s += K.rect({ x: x + i * unit, y: y2 + j * unit, w: unit, h: unit, fill });
    }
  });
  return s;
}

// 桌面图标（两个，8px 网格对齐）
function deskIcon(x, y2, label, icon) {
  let s = '';
  s += K.el('path', { d: pxD(x, y2, 40, 40, 4), fill: '#15151F', stroke: '#3A3A5C', 'stroke-width': 2 });
  s += glyph(icon, x + 12, y2 + 12, 3, C.textMuted);
  s += tx(x + 20, y2 + 54, label, { size: 8, fill: C.textMuted, anchor: 'middle', maxW: 76, tag: 'desk-icon' });
  return s;
}

scene += fakeTerm(sx + 596, sy + 26, 300, 206);
scene += fakeSettings(sx + 900, sy + 52, 372, 268);
scene += fakeEditor(sx + 72, sy + 50, 512, 286, true);
scene += deskIcon(sx + 1312, sy + 92, '灵伴工作台', 'monitor');
scene += deskIcon(sx + 1312, sy + 176, '桌宠市场', 'dots');

// 壁纸地平线
scene += K.rect({ x: sx, y: sy + sH - 120, w: sW, h: 1, fill: '#ffffff', fillOpacity: 0.05 });

// 任务栏
const tbY = sy + sH - 32;
scene += K.rect({ x: sx + 6, y: tbY, w: sW - 12, h: 26, fill: '#0b0b12', opacity: 0.92 });
scene += K.el('line', { x1: sx + 6, y1: tbY, x2: sx + sW - 6, y2: tbY, stroke: '#ffffff', 'stroke-opacity': 0.08, 'stroke-width': 1 });
scene += K.rect({ x: sx + 24, y: tbY + 6, w: 14, h: 14, fill: C.accent });
scene += glyph('dots', sx + 27, tbY + 9, 2, C.accentInk);
[0, 1, 2, 3].forEach((i) => {
  scene += K.rect({ x: sx + 696 + i * 30, y: tbY + 6, w: 14, h: 14, fill: '#2b2f45', stroke: '#3b4160', sw: 1 });
});
scene += K.rect({ x: sx + 696, y: tbY + 6, w: 14, h: 14, fill: C.accent, opacity: 0.22 });
scene += tx(sx + sW - 26, tbY + 14, '20:41  ·  10 / 27', { size: 8, mono: true, fill: '#8d93ab', anchor: 'end' });

// 桌宠：辉光 + 接触阴影 + 角色
const petX = sx + 1046, petY = sy + 66, petH = 322;
const petCx = petX + (petH / RATIO.deepseek) / 2;
scene += K.circle({ cx: petCx, cy: petY + petH * 0.52, r: 216, fill: 'url(#petGlow)' });
scene += ell(petCx, sy + 398, 104, 13, { fill: '#000000', fillOpacity: 0.5, filter: 'url(#blur10)' });
scene += ell(petCx, sy + 396, 58, 8, { fill: '#000000', fillOpacity: 0.55 });
scene += spr('deepseek-working', petX, petY, { h: petH });

// 状态胶囊：移到桌宠头顶，独占背景，避开右侧设置窗标题栏
scene += chip(petCx - 128, sy + 12, { w: 256, h: 38, state: 'working', label: '执行工具', meta: 'DSH · 00:42', progress: 5 });

// 互动气泡（米白贴纸 + 3 级阶梯像素尾巴：宽边贴住气泡，逐级收窄指向角色）
const bx = sx + 700, by = sy + 126, bw = 296, bh = 84;
const ty0 = by + bh - 46;
const tailPath = `M${bx + bw},${ty0} L${bx + bw + 20},${ty0} L${bx + bw + 20},${ty0 + 4} L${bx + bw + 15},${ty0 + 4} L${bx + bw + 15},${ty0 + 8} L${bx + bw + 10},${ty0 + 8} L${bx + bw + 10},${ty0 + 12} L${bx + bw},${ty0 + 12} Z`;
scene += K.el('path', { d: tailPath, fill: '#050509', transform: 'translate(4,4)' });
scene += sticker(bx, by, bw, bh, { fill: C.text, c: 8, stroke: C.ink, sw: 2, shadow: 4 });
scene += K.el('path', { d: tailPath, fill: C.text, stroke: C.ink, 'stroke-width': 2 });
scene += K.rect({ x: bx + bw - 3, y: ty0 + 2, w: 5, h: 9, fill: C.text });
scene += tx(bx + 20, by + 32, '改完了，要看看吗？', { size: 15.5, weight: 650, fill: C.ink, maxW: bw - 40, tag: 'bubble' });
scene += tx(bx + 20, by + 58, 'DONE · 4 帧弹出 · 点击进入工作台', { size: 8.5, mono: true, fill: '#6b6250', ls: 1.2, maxW: bw - 40, tag: 'bubble-sub' });
scene += glyph('done', bx + bw - 34, by + 20, 2.6, '#4c8f63');

// 悬浮操作条（hover 才出现）
const hbX = sx + 690, hbY = sy + 286, hbW = 306, hbH = 44;
scene += tx(hbX, hbY - 10, 'HOVER · 悬浮操作条', { size: 7.5, mono: true, fill: C.textFaint, ls: 2 });
scene += K.el('line', { x1: hbX + hbW + 8, y1: hbY + hbH / 2, x2: petX - 6, y2: hbY + hbH / 2, stroke: C.accent, 'stroke-width': 1, 'stroke-dasharray': '5 5', 'stroke-opacity': 0.5 });
scene += K.rect({ x: petX - 8, y: hbY + hbH / 2 - 3, w: 6, h: 6, fill: C.accent });
scene += sticker(hbX, hbY, hbW, hbH, { fill: '#12121c', c: 6, stroke: C.lineStrong, sw: 2, shadow: 3 });
const hbItems = [
  { icon: 'monitor', label: '工作台', active: true },
  { icon: 'swap', label: '换角色' },
  { icon: 'hide', label: '隐藏' },
];
hbItems.forEach((it, i) => {
  const ix = hbX + 6 + i * 100, iy = hbY + 5, iw = 96, ih = 34;
  if (it.active) {
    scene += K.el('path', { d: pxD(ix, iy, iw, ih, 3), fill: C.accent, stroke: C.accentShade, 'stroke-width': 1 });
    scene += glyph(it.icon, ix + 12, iy + 10, 2.6, C.accentInk);
    scene += tx(ix + 34, iy + 17, it.label, { size: 10.5, weight: 600, fill: C.accentInk });
  } else {
    scene += glyph(it.icon, ix + 12, iy + 10, 2.6, C.textMuted);
    scene += tx(ix + 34, iy + 17, it.label, { size: 10.5, fill: C.textMuted });
  }
});

// 像素光标（贴在桌宠左侧，指向悬浮条/角色）
scene += pixelCursor(sx + 1004, sy + 222, 2);

// 场景内注解
scene += K.rect({ x: sx + 18, y: sy + 16, w: 234, h: 22, fill: '#0b0b12', opacity: 0.72, stroke: '#2c2c42', sw: 1 });
scene += K.rect({ x: sx + 18, y: sy + 16, w: 3, h: 22, fill: C.accent });
scene += tx(sx + 30, sy + 27, '真透明窗口 · 没有矩形底板', { size: 9, fill: C.textMuted });
scene += tx(sx + 18, sy + 404, '接触阴影只跟角色，不画矩形边界', { size: 8.5, mono: false, fill: C.textFaint });
scene += tx(sx + sW - 20, sy + 404, '壁纸降饱和 · 角色饱和度 +8%', { size: 8.5, fill: C.textFaint, anchor: 'end' });

// 场景框
scene += K.el('path', { d: pxD(sx, sy, sW, sH, sC), fill: 'none', stroke: C.lineStrong, 'stroke-width': 2 });
scene += brackets(sx, sy, sW, sH, { color: '#f2ead8', len: 20, sw: 2, inset: 8 });
add(clipUse('sceneClip', scene));
y = sy + sH + 26;

/* --- 三种状态小样 --- */
function stateSample(x, y2, w, h, key, spec) {
  const st = STATE[key];
  let s = '';
  s += panel(x, y2, w, h, { fill: C.surface, edge: C.line, brackets: st.color, bLen: 14, bSw: 2, inset: 5 });
  s += tx(x + 20, y2 + 28, `STATE / ${st.en}`, { size: 8.5, mono: true, fill: st.color, ls: 2 });
  s += glyph(st.icon, x + w - 40, y2 + 16, 3.4, st.color);
  s += spr(spec.sprite, x + 18, y2 + 50, { h: 156 });
  const cx2 = x + 152;
  s += tx(cx2, y2 + 74, st.cn, { size: 21, weight: 650, fill: C.text, ls: 1.5, maxW: 120, tag: 'sample-title' });
  s += chip(cx2, y2 + 92, { w: 216, h: 32, state: key, label: st.cn, meta: spec.meta, progress: spec.prog, size: 11 });
  // 帧序列
  s += tx(cx2, y2 + 146, 'FRAME SEQUENCE · steps()', { size: 7.2, mono: true, fill: C.textFaint, ls: 1.4 });
  spec.frames.forEach((f, i) => {
    const fx = cx2 + i * 50, fy = y2 + 150;
    s += K.rect({ x: fx, y: fy, w: 42, h: 34, fill: '#0e0e17', stroke: C.line, sw: 1 });
    s += glyph(st.icon, fx + 11 + (f.dx || 0), fy + 9 + (f.dy || 0), 4, st.color, f.o ?? 1);
    s += tx(fx + 21, fy + 42, f.t, { size: 6.5, mono: true, fill: C.textFaint, anchor: 'middle' });
  });
  s += par(cx2, y2 + 212, spec.note, { size: 10, lineHeight: 16, w: w - cx2 + x - 24, fill: C.textMuted });
  s += tx(x + 20, y2 + h - 10, spec.caption, { size: 7.2, mono: true, fill: C.textFaint, ls: 1.2 });
  return s;
}

const samples = [
  {
    key: 'thinking', sprite: 'deepseek-thinking', meta: 'DSH · 02:14', prog: 3,
    caption: 'DEEPSEEK · 4 FRAME LOOP',
    frames: [{ t: 'T 0ms', o: 0.35 }, { t: 'T 250', o: 1 }, { t: 'T 500', o: 0.35 }],
    note: '三颗像素点 steps(2) 轮闪，胶囊左条同步呼吸；角色 4 帧循环待机，不额外发光。',
  },
  {
    key: 'approval', sprite: 'deepseek-approval', meta: '需要你', prog: 8,
    caption: 'DEEPSEEK · 4 FRAME SHAKE',
    frames: [{ t: 'T 0ms', o: 1, dx: -2 }, { t: 'T 120', o: 1, dx: 2 }, { t: 'T 240', o: 1, dx: 0 }],
    note: '胶囊转珊瑚点阵 + 4 帧位移抖动；主操作变实心，并给「确认」快捷键提示。',
  },
  {
    key: 'error', sprite: 'deepseek-error', meta: '1 次失败', prog: 2,
    caption: 'DEEPSEEK · 4 FRAME SHAKE',
    frames: [{ t: 'T 0ms', o: 1, dy: -2 }, { t: 'T 90', o: 1, dy: 2 }, { t: 'T 180', o: 1, dy: 0 }],
    note: '点阵转红并 4 帧抖动；30 秒无操作自动降回灰阶待机，不持续刺激。',
  },
];
const samW = (INNER - 2 * 25) / 3;
samples.forEach((sp, i) => {
  add(stateSample(PAD + i * (samW + 25), y, samW, 252, sp.key, sp), 0);
});
y += 252;

/* =========================================================================
 * 6. 02 快捷控制
 * ========================================================================= */
sectionHead(2, '快捷控制', '右键光标弹层 · 宽度 320 · 内容可滚动');

const qx = PAD, qy = y, qw = 336, qh = 540;
add(sticker(qx, qy, qw, qh, { fill: C.surface, c: 10, stroke: C.lineStrong, sw: 2, shadow: 6 }));
add(K.rect({ x: qx + 16, y: qy + 2, w: qw - 32, h: 3, fill: C.accent }));

// 头部
add(K.rect({ x: qx + 18, y: qy + 16, w: 28, h: 28, fill: C.surfaceRise, stroke: C.line, sw: 1 }));
add(brandGlyph(qx + 24, qy + 22, 2, C.accent));
add(tx(qx + 56, qy + 31, '灵伴', { size: 15, weight: 700, fill: C.text, ls: 2 }));
add(tx(qx + 56, qy + 47, 'LINGPET · 快捷控制', { size: 7.5, mono: true, fill: C.textFaint, ls: 1.4 }));
// 关闭按钮
add(K.el('path', { d: pxD(qx + qw - 40, qy + 18, 22, 22, 3), fill: C.surfaceAlt, stroke: C.line, 'stroke-width': 1 }));
add(glyph('close', qx + qw - 35, qy + 23, 2, C.textMuted));

// 桌宠列表
const rowY0 = qy + 64;
const petRows = [
  { name: 'DSH 桌宠', engine: 'DEEPSEEK · 像素', sprite: 'deepseek-idle', status: '已显示' },
  { name: 'Cursor 桌宠', engine: 'CLAUDE · 像素', sprite: 'claude-idle', status: '当前', active: true },
  { name: 'Codex 桌宠', engine: 'CLAUDE · 像素', sprite: 'claude-thinking', status: '已显示' },
  { name: '固定会话', engine: 'CHATGPT · 原图', sprite: 'deepseek-done', status: '隐藏' },
];
petRows.forEach((row, i) => {
  const ry = rowY0 + i * 60, rw = qw - 28, rx = qx + 14, rh = 54;
  add(K.el('path', { d: pxD(rx, ry, rw, rh, 4), fill: row.active ? C.surfaceRise : '#12121b', stroke: row.active ? C.accent : C.line, 'stroke-width': row.active ? 2 : 1 }));
  if (row.active) add(K.rect({ x: rx + 2, y: ry + 9, w: 3, h: rh - 18, fill: C.accent }));
  add(K.rect({ x: rx + 11, y: ry + 9, w: 36, h: 36, fill: '#0c0c13', stroke: C.line, sw: 1 }));
  add(sprFit(row.sprite, rx + 12, ry + 10, 34, 34));
  add(tx(rx + 58, ry + 21, row.name, { size: 12.5, weight: 600, fill: row.active ? C.text : C.textMuted, maxW: 150, tag: 'pet-name' }));
  add(tx(rx + 58, ry + 39, row.engine, { size: 8, mono: true, fill: C.textFaint, ls: 0.8 }));
  if (row.active) {
    add(K.rect({ x: rx + rw - 62, y: ry + 12, w: 44, h: 17, fill: C.accent }));
    add(tx(rx + rw - 40, ry + 21, '当前', { size: 8.5, weight: 700, fill: C.accentInk, anchor: 'middle' }));
  } else {
    const col = row.status === '已显示' ? C.mint : C.textFaint;
    add(K.rect({ x: rx + rw - 12, y: ry + 17, w: 5, h: 5, fill: col }));
    add(tx(rx + rw - 18, ry + 21, row.status, { size: 8.5, fill: col === C.mint ? C.textMuted : C.textFaint, anchor: 'end' }));
  }
});
// 滚动条暗示
add(K.rect({ x: qx + qw - 10, y: rowY0 + 4, w: 3, h: 226, fill: C.line }));
add(K.rect({ x: qx + qw - 10, y: rowY0 + 4, w: 3, h: 74, fill: C.accent }));
add(tx(qx + qw - 24, rowY0 - 8, '4 / 12 · SCROLL', { size: 6.5, mono: true, fill: C.textFaint, anchor: 'end', ls: 1 }));

// 分隔线
const divY = qy + 304;
add(K.el('line', { x1: qx + 16, y1: divY, x2: qx + qw - 16, y2: divY, stroke: C.line, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
[0, 1, 2].forEach((i) => add(K.rect({ x: qx + 16 + i * 8, y: divY - 1, w: 4, h: 2, fill: C.accent })));

// 控制行
add(tx(qx + 20, qy + 330, '显示桌宠', { size: 12.5, fill: C.text }));
add(toggle(qx + qw - 76, qy + 321, true, 'ON'));
add(tx(qx + 20, qy + 380, '大小', { size: 12.5, fill: C.text }));
add(slider3(qx + 128, qy + 370, 156, 1));
add(tx(qx + 20, qy + 428, '会话跟随', { size: 12.5, fill: C.text }));
add(toggle(qx + qw - 76, qy + 419, true, 'ON'));

// 主按钮
const pbtnY = qy + 452, pbtnX = qx + 16, pbtnW = qw - 32, pbtnH = 44;
add(K.el('path', { d: pxD(pbtnX + 4, pbtnY + 4, pbtnW, pbtnH, 6), fill: C.accentShade }));
add(K.el('path', { d: pxD(pbtnX, pbtnY, pbtnW, pbtnH, 6), fill: C.accent, stroke: '#ffc27a', 'stroke-width': 1 }));
add(glyph('monitor', pbtnX + 18, pbtnY + 12, 2.8, C.accentInk));
add(tx(pbtnX + pbtnW / 2 + 10, pbtnY + pbtnH / 2, '进入工作台', { size: 13.5, weight: 700, fill: C.accentInk, anchor: 'middle' }));
add(tx(qx + qw / 2, qy + 518, 'ALT + SHIFT + L · 随时呼出', { size: 7.5, mono: true, fill: C.textFaint, anchor: 'middle', ls: 1.4 }));

/* --- 右侧：POPUP SPEC 横条 + 四列细节卡 --- */
const specX = PAD + qw + 40;
const specW = RIGHT - specX;
add(K.rect({ x: specX, y: qy, w: specW, h: 92, fill: C.surface, stroke: C.line, sw: 1 }));
add(K.rect({ x: specX, y: qy, w: 4, h: 92, fill: C.accent }));
add(tx(specX + 18, qy + 22, 'POPUP SPEC / 弹层规格', { size: 8.5, mono: true, fill: C.accent, ls: 2 }));
add(tx(specX + specW - 16, qy + 22, 'RIGHT-CLICK · 8PX SNAP · FLIP AT EDGE', { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 1.4 }));
const specItems = [
  ['宽度', '320px', '8px 网格对齐'],
  ['位置', '光标 +12px', '近边反向翻转'],
  ['高度', '≤ 100vh−80', '超出内容区滚动'],
  ['滚动', '6px 轨道', '视觉滑块 3px'],
  ['关闭', 'Esc / 外部', '失焦即收起'],
];
const specCol = (specW - 36) / 5;
specItems.forEach(([k, v, d], i) => {
  const x = specX + 18 + i * specCol;
  add(tx(x, qy + 50, k, { size: 8, mono: true, fill: C.textFaint, ls: 1.2 }));
  add(tx(x + 34, qy + 50, v, { size: 10, mono: true, fill: C.text, maxW: specCol - 40, tag: 'spec-v' }));
  add(tx(x, qy + 72, d, { size: 8.5, fill: C.textMuted, maxW: specCol - 14, tag: 'spec-d' }));
  if (i > 0) add(K.el('line', { x1: x - 10, y1: qy + 36, x2: x - 10, y2: qy + 82, stroke: C.line, 'stroke-width': 1 }));
});

/* --- 四列细节卡 --- */
const cardY = qy + 106;
const cardH = qh - 106;
const cardGap = 16;
const cardW = (specW - cardGap * 3) / 4;

function detailCard(x, y2, w, h, tag, title, body) {
  let s = panel(x, y2, w, h, { fill: C.surface, edge: C.line });
  s += K.rect({ x: x + 1, y: y2 + 1, w: 56, h: 2, fill: C.accent });
  s += tx(x + 16, y2 + 24, tag, { size: 7.5, mono: true, fill: C.accent, ls: 1.8 });
  s += tx(x + 16, y2 + 46, title, { size: 12.5, weight: 600, fill: C.text, maxW: w - 32, tag: 'card-title' });
  s += body(x, y2, w, h);
  return s;
}

// A. 拖拽控制条
add(detailCard(specX, cardY, cardW, cardH, 'A / DRAG BAR', '拖拽控制条', (x, y2, w, h) => {
  const bw = w - 36, bh = 86, bx = x + 18, by = y2 + 66;
  let s = '';
  s += K.el('path', { d: pxD(bx + 3, by + 3, bw, bh, 5), fill: C.shadow });
  s += K.el('path', { d: pxD(bx, by, bw, bh, 5), fill: '#12121b', stroke: C.lineStrong, 'stroke-width': 2 });
  s += K.rect({ x: bx + 2, y: by + 10, w: 3, h: bh - 20, fill: STATE.working.color });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) s += K.rect({ x: bx + 14 + c * 8, y: by + 24 + r * 8, w: 3, h: 3, fill: C.textFaint });
  s += glyph('working', bx + 14, by + 44, 3, STATE.working.color);
  s += tx(bx + 42, by + 32, '执行工具', { size: 12.5, weight: 600, fill: C.text, maxW: bw - 64, tag: 'dragbar-title' });
  s += tx(bx + 42, by + 52, 'DSH · 00:42', { size: 8, mono: true, fill: C.textFaint, ls: 1 });
  s += K.el('path', { d: pxD(bx + bw - 38, by + 12, 24, 24, 3), fill: C.surfaceAlt, stroke: C.line, 'stroke-width': 1 });
  s += glyph('hide', bx + bw - 32, by + 18, 2, C.textMuted);
  s += tx(bx + 12, by + bh - 12, 'DRAG ANYWHERE', { size: 6, mono: true, fill: C.textFaint, ls: 1.2 });
  ['拖动任意位置移动桌宠', '状态点随会话实时切换', '隐藏后留在托盘，不退出'].forEach((t, i) => {
    s += K.rect({ x: x + 18, y: y2 + 182 + i * 26, w: 5, h: 5, fill: C.accent });
    s += tx(x + 32, y2 + 185 + i * 26, t, { size: 10, fill: C.textMuted, maxW: w - 48, tag: 'drag-note' });
  });
  s += tx(x + 16, y2 + h - 18, '260 × 92 · 2PX BORDER', { size: 7, mono: true, fill: C.textFaint, ls: 1.2 });
  return s;
}));

// B. 尺寸 / 开关 / 呈现
function seg(x, y2, w, items, active) {
  const sw = w / items.length;
  let s = K.rect({ x, y: y2, w, h: 30, fill: '#0c0c13', stroke: C.lineStrong, sw: 1 });
  items.forEach((t, i) => {
    if (i === active) {
      s += K.el('path', { d: pxD(x + i * sw + 2, y2 + 2, sw - 4, 26, 3), fill: C.accent, stroke: C.accentShade, 'stroke-width': 1 });
      s += tx(x + i * sw + sw / 2, y2 + 16, t, { size: 10.5, weight: 700, fill: C.accentInk, anchor: 'middle' });
    } else {
      s += tx(x + i * sw + sw / 2, y2 + 16, t, { size: 10.5, fill: C.textMuted, anchor: 'middle' });
    }
    if (i > 0) s += K.el('line', { x1: x + i * sw, y1: y2 + 3, x2: x + i * sw, y2: y2 + 27, stroke: C.line, 'stroke-width': 1 });
  });
  return s;
}
add(detailCard(specX + cardW + cardGap, cardY, cardW, cardH, 'B / SIZE + TOGGLE', '大小与开关', (x, y2, w, h) => {
  let s = '';
  s += tx(x + 18, y2 + 74, '大小', { size: 10.5, fill: C.textMuted });
  s += tx(x + w - 18, y2 + 74, '当前 · 中', { size: 8, mono: true, fill: C.accent, anchor: 'end' });
  s += slider3(x + 18, y2 + 86, w - 36, 1);
  s += tx(x + 18, y2 + 136, '显示桌宠', { size: 11.5, fill: C.text });
  s += toggle(x + w - 76, y2 + 126, true, 'ON');
  s += tx(x + 18, y2 + 170, '会话跟随', { size: 11.5, fill: C.text });
  s += toggle(x + w - 76, y2 + 160, true, 'ON');
  s += K.el('line', { x1: x + 18, y1: y2 + 192, x2: x + w - 18, y2: y2 + 192, stroke: C.line, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
  s += tx(x + 18, y2 + 216, '形象呈现', { size: 10.5, fill: C.textMuted });
  s += seg(x + 18, y2 + 228, w - 36, ['原图', '像素'], 1);
  s += tx(x + 18, y2 + 282, '三档 = 贴图 80 / 100 / 120%', { size: 9.5, fill: C.textMuted, maxW: w - 36, tag: 'toggle-note' });
  s += tx(x + 18, y2 + 302, '开关位移 steps(2) 两帧，不补间', { size: 9.5, fill: C.textFaint, maxW: w - 36, tag: 'toggle-note2' });
  s += tx(x + 16, y2 + h - 18, 'TOGGLE 38×18 · SEG 2×', { size: 7, mono: true, fill: C.textFaint, ls: 1.2 });
  return s;
}));

// C. 八态行：颜色 / 点阵图标 / 动效 三个维度
add(detailCard(specX + (cardW + cardGap) * 2, cardY, cardW, cardH, 'C / 8 STATES', '八种状态，三个维度区分', (x, y2, w, h) => {
  let s = '';
  const ORDER = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];
  ORDER.forEach((k, i) => {
    const st = STATE[k];
    const ry = y2 + 66 + i * 42;
    s += K.rect({ x: x + 16, y: ry, w: w - 32, h: 36, fill: i % 2 ? '#161622' : 'none', opacity: i % 2 ? 1 : 0 });
    s += K.rect({ x: x + 16, y: ry, w: 3, h: 36, fill: st.color });
    s += glyph(st.icon, x + 28, ry + 11, 2.6, st.color);
    s += tx(x + 48, ry + 18, st.cn, { size: 11.5, fill: C.text, maxW: 90, tag: 'state-cn' });
    s += tx(x + w - 16, ry + 12, st.en, { size: 6.5, mono: true, fill: C.textFaint, anchor: 'end', ls: 1 });
    // 动效帧条
    const fr = [0.35, 1, 0.35];
    fr.forEach((o, f) => {
      s += K.rect({ x: x + w - 16 - 3 * 8 + f * 8, y: ry + 23, w: 5, h: 5, fill: st.color, opacity: o });
    });
  });
  s += tx(x + 16, y2 + h - 18, 'COLOR · GLYPH · MOTION', { size: 7, mono: true, fill: C.textFaint, ls: 1.2 });
  return s;
}));

// D. 贴光标弹出 / 越界翻转
add(detailCard(specX + (cardW + cardGap) * 3, cardY, cardW, cardH, 'D / FLIP AT EDGE', '贴光标弹出 · 越界翻转', (x, y2, w, h) => {
  const dx = x + 18, dy = y2 + 66, dw = w - 36, dh = 150;
  let s = '';
  s += K.rect({ x: dx, y: dy, w: dw, h: dh, fill: '#0d0d15', stroke: C.line, sw: 1 });
  for (let i = 0; i < 6; i++) s += K.rect({ x: dx + 6 + i * 22, y: dy + 150, w: 14, h: 3, fill: '#1c1c2b' });
  s += tx(dx + 8, dy + 14, 'VIEWPORT', { size: 6, mono: true, fill: C.textFaint, ls: 1.2 });
  // 越界翻转的小弹层（贴右下角）
  const pw = 116, ph = 76, px = dx + dw - pw - 4, py = dy + dh - ph - 4;
  s += K.el('path', { d: pxD(px, py, pw, ph, 4), fill: C.surface, stroke: C.accent, 'stroke-width': 1.5 });
  s += K.rect({ x: px + 6, y: py + 8, w: 3, h: ph - 16, fill: C.accent });
  s += K.rect({ x: px + 16, y: py + 12, w: 52, h: 4, fill: C.textMuted, fillOpacity: 0.9 });
  s += K.rect({ x: px + 16, y: py + 24, w: 80, h: 4, fill: C.textFaint, fillOpacity: 0.7 });
  s += K.rect({ x: px + 16, y: py + 36, w: 66, h: 4, fill: C.textFaint, fillOpacity: 0.5 });
  s += K.rect({ x: px + 16, y: py + 48, w: 74, h: 4, fill: C.textFaint, fillOpacity: 0.4 });
  // 光标
  s += K.el('path', { d: 'M0 0 L0 15 L4 11 L6 16 L9 15 L7 10 L11 10 Z', fill: C.text, stroke: C.ink, 'stroke-width': 0.8, transform: `translate(${px + pw - 17} ${py + ph - 28})` });
  // 翻转箭头
  s += K.el('path', { d: `M${px - 42} ${py + 34} h 16 M${px - 30} ${py + 29} l 6 5 l -6 5`, fill: 'none', stroke: C.accent, 'stroke-width': 1.5 });
  s += tx(px - 48, py + 56, 'FLIP', { size: 6.5, mono: true, fill: C.accent, ls: 1.5, anchor: 'end' });
  s += tx(dx + 8, dy + dh - 10, 'SCROLL ↕', { size: 6, mono: true, fill: C.textFaint, ls: 1 });
  // 规则
  const rules = [
    ['弹出', '光标 + 12px，8px 吸附'],
    ['翻转', '距边 < 弹层时反向'],
    ['限高', '100vh − 80，内容滚动'],
    ['关闭', 'Esc / 点击外部 / 失焦'],
  ];
  rules.forEach(([k, v], i) => {
    const ry = y2 + 236 + i * 30;
    s += tx(x + 18, ry, k, { size: 8, mono: true, fill: C.textFaint, ls: 1.2 });
    s += tx(x + 58, ry, v, { size: 9.5, fill: C.textMuted, maxW: w - 76, tag: 'flip-rule' });
  });
  s += tx(x + 16, y2 + h - 18, '8PX SNAP · NO SPRING', { size: 7, mono: true, fill: C.textFaint, ls: 1.2 });
  return s;
}));

y = qy + qh;

/* =========================================================================
 * 7. 03 桌宠工作台
 * ========================================================================= */
sectionHead(3, '桌宠工作台', '主窗口 1130 × 850 · 板内 1.04× 展示');

const WX = PAD, WY = y, WW = 1180, WH = 886;
const wx = (n) => WX + n;
const wy = (n) => WY + n;
const wtx = (x, y2, s, o = {}) => tx(wx(x), wy(y2), s, o);
const wrect = (x, y2, w, h, o = {}) => K.rect({ ...o, x: wx(x), y: wy(y2), w, h });
const wpD = (x, y2, w, h, c, o = {}) => K.el('path', { ...o, d: pxD(wx(x), wy(y2), w, h, c) });

function pin(n, x, y2) {
  return [
    K.rect({ x: wx(x), y: wy(y2), w: 14, h: 14, fill: C.accent, stroke: C.accentInk, sw: 1 }),
    tx(wx(x + 7), wy(y2 + 7.5), String(n), { size: 8, weight: 700, mono: true, fill: C.accentInk, anchor: 'middle' }),
  ].join('');
}

function miniWindow(x, y2, w, h, title, sub) {
  let s = '';
  s += K.rect({ x: x + 4, y: y2 + 4, w, h, fill: C.shadow });
  s += K.rect({ x, y: y2, w, h, fill: '#101018', stroke: C.lineStrong, sw: 2 });
  s += K.rect({ x, y: y2, w, h: 20, fill: '#171722' });
  ['#3d3d5c', '#3d3d5c', '#3d3d5c'].forEach((cc, i) => {
    s += K.rect({ x: x + 8 + i * 9, y: y2 + 7, w: 5, h: 5, fill: cc });
  });
  s += tx(x + w - 8, y2 + 10, title, { size: 6.5, mono: true, fill: C.textFaint, anchor: 'end', ls: 1 });
  s += K.rect({ x, y: y2 + 20, w: 44, h: h - 20, fill: '#141420' });
  for (let i = 0; i < 3; i++) s += K.rect({ x: x + 8, y: y2 + 30 + i * 10, w: 24, h: 3, fill: '#2c2c42' });
  if (sub) s += sub;
  return s;
}

// 窗口外框
parts.push(K.rect({ x: wx(8), y: wy(8), w: WW, h: WH, fill: C.shadow }));
parts.push(K.rect({ x: WX, y: WY, w: WW, h: WH, fill: '#0e0e16', stroke: C.lineStrong, sw: 2 }));
// 标题栏
parts.push(wrect(0, 0, WW, 30, { fill: '#171722' }));
parts.push(K.el('line', { x1: WX, y1: wy(30), x2: wx(WW), y2: wy(30), stroke: C.line, 'stroke-width': 1 }));
['#5b5b80', '#5b5b80', '#5b5b80'].forEach((cc, i) => parts.push(wrect(14 + i * 11, 11, 7, 7, { fill: cc })));
parts.push(wtx(58, 16, 'LINGPET / 桌宠工作台', { size: 8.5, mono: true, fill: C.textFaint, ls: 1.6 }));
[['min', 42], ['full', 44], ['close', 46]].forEach(([k, off], i) => {
  const bx = 1078 + i * 30;
  parts.push(wrect(bx, 8, 24, 16, { fill: 'none', stroke: C.line, sw: 1 }));
  if (k === 'min') parts.push(wrect(bx + 6, 15, 12, 2, { fill: C.textMuted }));
  if (k === 'full') parts.push(wrect(bx + 7, 12, 10, 8, { fill: 'none', stroke: C.textMuted, sw: 1 }));
  if (k === 'close') parts.push(glyph('close', wx(bx + 7), wy(12), 2, C.textMuted));
});

// 左栏
parts.push(wrect(0, 30, 244, WH - 30, { fill: '#12121b' }));
parts.push(K.el('line', { x1: wx(244), y1: wy(30), x2: wx(244), y2: wy(WH), stroke: C.line, 'stroke-width': 1 }));
parts.push(wrect(20, 48, 32, 32, { fill: C.surfaceRise, stroke: C.line, sw: 1 }));
parts.push(brandGlyph(wx(26), wy(54), 3, C.accent));
parts.push(wtx(64, 62, '灵伴', { size: 15, weight: 700, fill: C.text, ls: 2 }));
parts.push(wtx(64, 76, 'LINGPET', { size: 7, mono: true, fill: C.textFaint, ls: 2.4 }));

const navItems = [['monitor', '桌宠工作台', true], ['bag', '桌宠市场', false]];
navItems.forEach(([ic, label, active], i) => {
  const ny = 108 + i * 44;
  if (active) {
    parts.push(wrect(12, ny, 220, 38, { fill: C.accentSoft }));
    parts.push(wrect(12, ny, 3, 38, { fill: C.accent }));
  }
  parts.push(glyph(ic, wx(28), wy(ny + 12), 2.8, active ? C.accent : C.textFaint));
  parts.push(wtx(50, ny + 20, label, { size: 12, weight: active ? 600 : 400, fill: active ? C.accent : C.textMuted }));
});
parts.push(wtx(20, 214, '我的桌宠', { size: 8.5, mono: true, fill: C.textFaint, ls: 1.4 }));
parts.push(wtx(224, 214, '4', { size: 8.5, mono: true, fill: C.textFaint, anchor: 'end' }));

const myPets = [
  { name: 'DSH 桌宠', meta: 'DEEPSEEK · 像素', sprite: 'deepseek-idle', status: '已显示' },
  { name: 'Cursor 桌宠', meta: 'CLAUDE · 像素', sprite: 'claude-idle', status: '已显示', active: true },
  { name: 'Codex 桌宠', meta: 'CLAUDE · 像素', sprite: 'claude-thinking', status: '已显示' },
  { name: '固定会话', meta: 'CHATGPT · 原图', sprite: 'deepseek-done', status: '已显示' },
];
myPets.forEach((row, i) => {
  const ry = 228 + i * 60;
  if (row.active) {
    parts.push(wrect(12, ry, 220, 54, { fill: '#1b1b2a', stroke: C.accent, sw: 2 }));
  }
  parts.push(wrect(22, ry + 8, 38, 38, { fill: '#0b0b12', stroke: C.line, sw: 1 }));
  parts.push(sprFit(row.sprite, wx(23), wy(ry + 9), 36, 36));
  parts.push(wtx(68, ry + 19, row.name, { size: 11.5, weight: 600, fill: row.active ? C.text : C.textMuted, maxW: 120, tag: 'wb-pet' }));
  parts.push(wtx(68, ry + 35, row.meta, { size: 7.5, mono: true, fill: C.textFaint, ls: 0.8 }));
  parts.push(wtx(218, ry + 19, '删除', { size: 8.5, fill: C.textFaint, anchor: 'end' }));
});
// 新增桌宠
parts.push(K.el('path', { d: pxD(wx(12), wy(512), 220, 40, 4), fill: 'none', stroke: C.lineStrong, 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
parts.push(glyph('plus', wx(72), wy(523), 2.4, C.accent));
parts.push(wtx(92, 532, '新增桌宠', { size: 11.5, fill: C.textMuted }));
// 侧栏脚注
parts.push(wtx(20, 792, '拖动桌宠可移动位置', { size: 8.5, fill: C.textFaint, maxW: 204, tag: 'wb-foot' }));
parts.push(wtx(20, 810, '右键桌宠可打开快捷控制', { size: 8.5, fill: C.textFaint, maxW: 204, tag: 'wb-foot2' }));
parts.push(wtx(20, 856, 'v0.9.4 · ELECTRON 45', { size: 6.5, mono: true, fill: '#3f3f58', ls: 1.2 }));

// 主区标题
parts.push(wtx(268, 48, '灵伴 / 桌宠管理', { size: 8.5, mono: true, fill: C.textFaint, ls: 1.4 }));
parts.push(wtx(268, 82, '桌宠工作台', { size: 24, weight: 700, fill: C.text, ls: 2 }));
parts.push(wtx(268, 108, '选择一位伙伴，设置它的外观和跟随方式。', { size: 11.5, fill: C.textMuted, maxW: 420, tag: 'wb-sub' }));
// 连接胶囊
parts.push(K.el('path', { d: pxD(wx(940), wy(48), 216, 28, 4), fill: C.surface, stroke: C.line, 'stroke-width': 1 }));
parts.push(wrect(952, 59, 6, 6, { fill: C.mint }));
parts.push(wtx(966, 62, 'Codex / Cursor / DSH 已连接 · 3', { size: 9, fill: C.textMuted, maxW: 186, tag: 'wb-conn' }));

// 当前桌宠条
parts.push(wrect(268, 130, 888, 60, { fill: C.surface, stroke: C.line, sw: 1 }));
parts.push(wtx(288, 160, '当前：', { size: 10.5, fill: C.textMuted }));
parts.push(wrect(330, 146, 148, 28, { fill: '#0c0c13', stroke: C.lineStrong, sw: 1 }));
parts.push(wtx(344, 160, '默认桌宠', { size: 11, fill: C.text }));
parts.push(glyph('down', wx(456), wy(154), 2, C.textMuted));
parts.push(wtx(500, 160, '修改后自动保存，无需确认', { size: 8.5, mono: true, fill: C.textFaint, ls: 0.8 }));
parts.push(wrect(1050, 146, 92, 28, { fill: 'none', stroke: C.line, sw: 1 }));
parts.push(wtx(1062, 160, '更多操作', { size: 9.5, fill: C.textMuted }));
parts.push(glyph('down', wx(1120), wy(154), 2, C.textFaint));
parts.push(pin(1, 254, 148));

// 实时预览卡
parts.push(wrect(268, 206, 440, 640, { fill: '#12121b', stroke: C.line, sw: 1 }));
parts.push(wtx(286, 230, '实时预览', { size: 12.5, weight: 600, fill: C.text, ls: 1 }));
parts.push(wtx(692, 230, '鲸鱼娘 / PIXEL', { size: 7.5, mono: true, fill: C.textFaint, anchor: 'end', ls: 1.2 }));
// 舞台
const stg = { x: 286, y: 246, w: 404, h: 404 };
parts.push(K.rect({ x: wx(stg.x), y: wy(stg.y), w: stg.w, h: stg.h, fill: '#0b0b12', stroke: C.line, sw: 1 }));
parts.push(clipDef('wbStage', `M${wx(stg.x)} ${wy(stg.y)} h${stg.w} v${stg.h} h${-stg.w} Z`));
let stage = '';
stage += K.rect({ x: wx(stg.x), y: wy(stg.y), w: stg.w, h: stg.h, fill: 'url(#grid8)' });
stage += K.rect({ x: wx(stg.x), y: wy(stg.y), w: stg.w, h: stg.h, fill: 'url(#stageGlow)' });
stage += ell(wx(stg.x + stg.w / 2), wy(stg.y + 348), 80, 11, { fill: '#000000', fillOpacity: 0.5, filter: 'url(#blur10)' });
stage += ell(wx(stg.x + stg.w / 2), wy(stg.y + 346), 44, 7, { fill: '#000000', fillOpacity: 0.55 });
stage += sprFit('deepseek-idle', wx(stg.x + 40), wy(stg.y + 28), stg.w - 80, 330);
// 舞台四角
stage += [[stg.x + 8, stg.y + 8, 1, 1], [stg.x + stg.w - 8, stg.y + 8, -1, 1], [stg.x + 8, stg.y + stg.h - 8, 1, -1], [stg.x + stg.w - 8, stg.y + stg.h - 8, -1, -1]]
  .map(([x, y2, sx2, sy2]) => K.el('line', { x1: wx(x), y1: wy(y2), x2: wx(x + 14 * sx2), y2: wy(y2), stroke: C.accentShade, 'stroke-width': 1.5 }) + K.el('line', { x1: wx(x), y1: wy(y2), x2: wx(x), y2: wy(y2 + 14 * sy2), stroke: C.accentShade, 'stroke-width': 1.5 }))
  .join('');
// 舞台状态胶囊
const stChip = chip(wx(stg.x + stg.w / 2 - 92), wy(stg.y + stg.h - 54), { w: 184, h: 32, state: 'idle', label: '空闲 · 等待会话', meta: '', progress: 3, size: 10 });
stage += stChip;
parts.push(clipUse('wbStage', stage));
parts.push(pin(2, 254, 428));
// 预览卡底部
parts.push(wtx(488, 678, 'Cursor · 会话 cursor-task', { size: 8.5, mono: true, fill: C.textFaint, anchor: 'middle', ls: 0.8 }));
parts.push(K.el('line', { x1: wx(286), y1: wy(696), x2: wx(690), y2: wy(696), stroke: C.line, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
[
  ['跟随', 'DSH / Cursor / Codex'],
  ['位置', '右下角 · 记忆每屏'],
  ['尺寸', '中 · 100%'],
].forEach(([k, v], i) => {
  const py = 718 + i * 26;
  parts.push(wtx(286, py, k, { size: 8, mono: true, fill: C.textFaint, ls: 1.2 }));
  parts.push(wtx(324, py, v, { size: 9.5, fill: C.textMuted, maxW: 250, tag: 'wb-info' }));
});
// 隐藏桌宠按钮
const bkx = 286, bky = 796, bkw = 404, bkh = 42;
parts.push(K.el('path', { d: pxD(wx(bkx + 4), wy(bky + 4), bkw, bkh, 6), fill: C.accentShade }));
parts.push(K.el('path', { d: pxD(wx(bkx), wy(bky), bkw, bkh, 6), fill: C.accent }));
parts.push(glyph('hide', wx(bkx + bkw / 2 - 64), wy(bky + 12), 2.4, C.accentInk));
parts.push(wtx(bkx + bkw / 2 + 8, 817, '隐藏桌宠', { size: 13, weight: 700, fill: C.accentInk, anchor: 'middle' }));
parts.push(wtx(488, 848, '隐藏后可从托盘恢复，不退出进程', { size: 7.5, mono: true, fill: C.textFaint, anchor: 'middle', ls: 0.8 }));

// 右侧：tabs
const colX = 724;
[['外观与显示', true], ['会话跟随', false]].forEach(([t, active], i) => {
  const tx2 = colX + i * 218;
  parts.push(wrect(tx2, 206, 216, 40, { fill: active ? C.surface : 'none', stroke: C.line, sw: 1 }));
  if (active) parts.push(wrect(tx2, 206, 216, 2, { fill: C.accent }));
  const align = i === 0 ? 'middle' : 'middle';
  parts.push(wtx(tx2 + 108, 228, t, { size: 11.5, weight: active ? 600 : 400, fill: active ? C.text : C.textMuted, anchor: align }));
});
// 选择角色
parts.push(wrect(colX, 258, 432, 158, { fill: '#12121b', stroke: C.line, sw: 1 }));
parts.push(wtx(colX + 18, 282, '选择角色', { size: 12.5, weight: 600, fill: C.text, ls: 1 }));
parts.push(wtx(colX + 414, 282, '点击切换', { size: 8, fill: C.textFaint, anchor: 'end' }));
const roles = [
  ['Claude', '1 个形象', false],
  ['DeepSeek', '1 个形象', true],
  ['ChatGPT', '2 个形象', false],
];
roles.forEach(([name, meta, sel], i) => {
  const rx2 = colX + 18 + i * 136;
  parts.push(K.el('path', { d: pxD(wx(rx2), wy(300), 126, 98, 4), fill: sel ? C.accentSoft : '#0f0f17', stroke: sel ? C.accent : C.line, 'stroke-width': sel ? 2 : 1 }));
  parts.push(wtx(rx2 + 14, 326, name, { size: 12, weight: sel ? 700 : 400, fill: sel ? C.text : C.textMuted, maxW: 100, tag: 'wb-role' }));
  parts.push(wtx(rx2 + 14, 348, meta, { size: 8.5, fill: C.textFaint }));
  if (sel) {
    parts.push(wtx(rx2 + 14, 372, '当前角色', { size: 7.5, mono: true, fill: C.accent, ls: 1 }));
    parts.push(glyph('check', wx(rx2 + 102), wy(312), 2.2, C.accent));
  } else {
    parts.push(wtx(rx2 + 14, 372, '切换', { size: 8, fill: '#3f3f58' }));
  }
});
parts.push(pin(3, 710, 330));

// 选择形象
parts.push(wrect(colX, 428, 432, 214, { fill: '#12121b', stroke: C.line, sw: 1 }));
parts.push(wtx(colX + 18, 452, '选择形象', { size: 12.5, weight: 600, fill: C.text, ls: 1 }));
parts.push(wtx(colX + 414, 452, '1 个已保留', { size: 8, mono: true, fill: C.textFaint, anchor: 'end' }));
// 已保存形象卡
const ic = { x: colX + 18, y: 468, w: 192, h: 158 };
parts.push(K.el('path', { d: pxD(wx(ic.x), wy(ic.y), ic.w, ic.h, 4), fill: '#0f0f17', stroke: C.accent, 'stroke-width': 2 }));
parts.push(K.rect({ x: wx(ic.x + 1), y: wy(ic.y + 1), w: ic.w - 2, h: 88, fill: C.surfaceAlt }));
parts.push(K.rect({ x: wx(ic.x + 1), y: wy(ic.y + 1), w: ic.w - 2, h: 88, fill: 'url(#grid8)' }));
parts.push(sprFit('deepseek-idle', wx(ic.x + 40), wy(ic.y + 4), 112, 80));
// 已保存徽章
parts.push(K.rect({ x: wx(ic.x + 7), y: wy(ic.y + 7), w: 76, h: 28, fill: C.accent, stroke: C.accentShade, sw: 1 }));
parts.push(K.rect({ x: wx(ic.x + 7), y: wy(ic.y + 7), w: 76, h: 2, fill: '#ffc27a' }));
parts.push(wtx(ic.x + 24, ic.y + 21, '已保存', { size: 9, weight: 700, fill: C.accentInk }));
parts.push(wtx(ic.x + 12, ic.y + 110, '鲸鱼娘', { size: 11, weight: 600, fill: C.text }));
parts.push(wtx(ic.x + 12, ic.y + 128, '原图 / 像素', { size: 8, mono: true, fill: C.textFaint, ls: 0.8 }));
// 小分段：原图 / 像素（像素 = 当前）
const sgx = ic.x + 100, sgy = ic.y + 116;
parts.push(K.rect({ x: wx(sgx), y: wy(sgy), w: 80, h: 20, fill: '#0b0b12', stroke: C.line, sw: 1 }));
parts.push(wtx(sgx + 21, sgy + 10, '原图', { size: 7.5, fill: C.textFaint, anchor: 'middle' }));
parts.push(K.rect({ x: wx(sgx + 42), y: wy(sgy + 2), w: 36, h: 16, fill: C.accent }));
parts.push(wtx(sgx + 60, sgy + 10, '像素', { size: 7.5, weight: 700, fill: C.accentInk, anchor: 'middle' }));
parts.push(pin(4, 728, 540));
// 空位：从市场添加
const es = { x: colX + 220, y: 468, w: 194, h: 158 };
parts.push(K.el('path', { d: pxD(wx(es.x), wy(es.y), es.w, es.h, 4), fill: 'none', stroke: C.lineStrong, 'stroke-width': 1, 'stroke-dasharray': '6 5' }));
parts.push(wtx(es.x + es.w / 2, es.y + 54, 'EMPTY SLOT', { size: 6.5, mono: true, fill: C.textFaint, anchor: 'middle', ls: 1.4 }));
parts.push(glyph('plus', wx(es.x + es.w / 2 - 7), wy(es.y + 70), 2.8, C.textMuted));
parts.push(wtx(es.x + es.w / 2, es.y + 102, '从市场添加形象', { size: 9.5, fill: C.textMuted, anchor: 'middle' }));
parts.push(wtx(es.x + es.w / 2, es.y + 120, '导入本地包', { size: 8, mono: true, fill: C.textFaint, anchor: 'middle' }));

// 大小与显示
parts.push(wrect(colX, 656, 432, 166, { fill: '#12121b', stroke: C.line, sw: 1 }));
parts.push(wtx(colX + 18, 680, '大小', { size: 11.5, fill: C.text, ls: 1 }));
parts.push(wtx(colX + 414, 680, '中 · 100%', { size: 8, mono: true, fill: C.accent, anchor: 'end' }));
parts.push(slider3(wx(colX + 18), wy(692), 396, 1));
parts.push(K.el('line', { x1: wx(colX + 18), y1: wy(748), x2: wx(colX + 414), y2: wy(748), stroke: C.line, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
parts.push(wtx(colX + 18, 772, '显示桌宠', { size: 11, fill: C.text }));
parts.push(toggle(wx(colX + 306), wy(762), true, 'ON'));
parts.push(wtx(colX + 18, 802, '会话跟随', { size: 11, fill: C.text }));
parts.push(toggle(wx(colX + 306), wy(792), true, 'ON'));
parts.push(pin(5, 710, 714));

// 状态栏
parts.push(wrect(244, 848, WW - 244, 38, { fill: '#14141f' }));
parts.push(K.el('line', { x1: wx(244), y1: wy(848), x2: wx(WW), y2: wy(848), stroke: C.line, 'stroke-width': 1 }));
parts.push(wrect(268, 864, 6, 6, { fill: C.mint }));
parts.push(wtx(282, 867, '桌宠运行状态 · 正常', { size: 9, fill: C.textMuted }));
parts.push(wtx(470, 867, '跟随 3 个会话 · 上次切换 00:42', { size: 8, mono: true, fill: C.textFaint, ls: 0.6 }));
parts.push(wtx(1000, 867, '恢复继承配置', { size: 8.5, fill: C.textMuted, anchor: 'end' }));
parts.push(wtx(1120, 867, '会话偏好', { size: 8.5, fill: C.accent, anchor: 'end' }));

/* --- 右侧批注 + 状态小样 --- */
const noteX = WX + WW + 26;
const noteW = RIGHT - noteX;
parts.push(tx(noteX, WY + 6, 'SPEC CALLOUTS', { size: 8, mono: true, fill: C.accent, ls: 2.4 }));
const notes = [
  [1, '当前：默认桌宠', '下拉切换会话映射；改完全部自动保存，状态栏同步。'],
  [2, '实时预览舞台', '8px 网格 + 径向光，只放角色与一个 8 段状态条。'],
  [3, '选择角色', '引擎卡三角排布；选中 2px 琥珀描边 + 软底，不用阴影。'],
  [4, '已保存 + 原图 / 像素', '徽章贴在缩略图左上；分段控件切换贴图精度。'],
  [5, '大小三档', '滑杆 steps() 吸附 3 档，按下位移 2px，不做弹性。'],
];
notes.forEach(([n, title, body], i) => {
  const ny = WY + 30 + i * 84;
  parts.push(K.rect({ x: noteX, y: ny, w: 14, h: 14, fill: 'none', stroke: C.accent, sw: 1 }));
  parts.push(tx(noteX + 7, ny + 7.5, String(n), { size: 8, mono: true, fill: C.accent, anchor: 'middle' }));
  parts.push(tx(noteX + 24, ny + 8, title, { size: 11.5, weight: 600, fill: C.text, maxW: noteW - 24, tag: 'note-title' }));
  parts.push(par(noteX, ny + 28, body, { size: 9.5, lineHeight: 16, w: noteW - 4, fill: C.textMuted }));
  if (i < notes.length - 1) parts.push(K.el('line', { x1: noteX, y1: ny + 72, x2: RIGHT, y2: ny + 72, stroke: C.line, 'stroke-width': 1, 'stroke-opacity': 0.6 }));
});
// 空态 / 加载态小样
const mwY = WY + 470;
parts.push(tx(noteX, mwY, 'EMPTY / LOADING', { size: 8, mono: true, fill: C.accent, ls: 2.4 }));
parts.push(miniWindow(noteX, mwY + 16, 264, 124, 'EMPTY', (() => {
  let s = '';
  s += K.el('path', { d: pxD(noteX + 56, mwY + 58, 156, 44, 3), fill: 'none', stroke: C.lineStrong, 'stroke-width': 1, 'stroke-dasharray': '5 4' });
  s += tx(noteX + 134, mwY + 74, '还没有桌宠', { size: 9, fill: C.textMuted, anchor: 'middle' });
  s += tx(noteX + 134, mwY + 88, '去市场挑一个', { size: 7.5, fill: C.textFaint, anchor: 'middle' });
  s += K.rect({ x: noteX + 100, y: mwY + 110, w: 68, h: 18, fill: C.accent, opacity: 0.9 });
  s += tx(noteX + 134, mwY + 119, '桌宠市场', { size: 8, weight: 700, fill: C.accentInk, anchor: 'middle' });
  return s;
})()));
parts.push(tx(noteX + 264, mwY + 28, '空状态：虚线框 + 一个明确出口', { size: 8, fill: C.textFaint, anchor: 'end', maxW: 260, tag: 'empty-cap' }));

const ldY = mwY + 152;
parts.push(miniWindow(noteX, ldY, 264, 124, 'LOADING', (() => {
  let s = '';
  for (let i = 0; i < 3; i++) {
    const ly = ldY + 38 + i * 26;
    s += K.rect({ x: noteX + 56, y: ly, w: 164, h: 20, fill: C.surfaceAlt });
    s += K.rect({ x: noteX + 62, y: ly + 7, w: 88, h: 3, fill: C.textFaint, opacity: 0.5 });
    s += K.rect({ x: noteX + 62, y: ly + 13, w: 54, h: 3, fill: C.textFaint, opacity: 0.3 });
  }
  s += K.rect({ x: noteX + 56, y: ldY + 116, w: 96, h: 2, fill: C.accent, opacity: 0.6 });
  return s;
})()));
parts.push(tx(noteX + 264, ldY + 28, '加载态：骨架条 + 不转圈', { size: 8, fill: C.textFaint, anchor: 'end', maxW: 260, tag: 'load-cap' }));

y = WY + WH + 26;

/* =========================================================================
 * 8. 04 桌宠市场
 * ========================================================================= */
sectionHead(4, '桌宠市场', '客户端内页 · 卡片与静态站同源');

function winFrame(x, y2, w, h, label, cornerPin) {
  const s = [];
  s.push(K.rect({ x: x + 6, y: y2 + 6, w, h, fill: C.shadow }));
  s.push(K.rect({ x, y: y2, w, h, fill: '#101018', stroke: C.lineStrong, sw: 2 }));
  s.push(K.rect({ x, y: y2, w, h: 30, fill: '#171722' }));
  ['#5b5b80', '#5b5b80', '#5b5b80'].forEach((cc, i) => s.push(K.rect({ x: x + 14 + i * 11, y: y2 + 11, w: 7, h: 7, fill: cc })));
  s.push(tx(x + 58, y2 + 16, label, { size: 8.5, mono: true, fill: C.textFaint, ls: 1.6 }));
  s.push(K.el('line', { x1: x, y1: y2 + 30, x2: x + w, y2: y2 + 30, stroke: C.line, 'stroke-width': 1 }));
  if (cornerPin) s.push(tx(x + w - 14, y2 + 16, cornerPin, { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 1.2 }));
  return s.join('');
}

const MX = PAD, MY = y, MW = 1180, MH = 508;
parts.push(winFrame(MX, MY, MW, MH, 'LINGPET / 桌宠市场', '3 TABS · 6 WORKS'));
const mx = (n) => MX + n;
const my = (n) => MY + n;
const mrect = (x, y2, w, h, o = {}) => K.rect({ ...o, x: mx(x), y: my(y2), w, h });
const mtx = (x, y2, s, o = {}) => { parts.push(tx(mx(x), my(y2), s, o)); return ''; };

mtx(24, 64, '桌宠市场', { size: 19, weight: 700, fill: C.text, ls: 3 });
const mkTabs = [['发现桌宠', true], ['投稿作品', false], ['查询投稿', false]];
mkTabs.forEach(([t, active], i) => {
  const tX = 190 + i * 104;
  mtx(tX, 64, t, { size: 11, weight: active ? 600 : 400, fill: active ? C.accent : C.textMuted });
  if (active) parts.push(mrect(tX, 78, K.measure(t, 11), 2, { fill: C.accent }));
});
// 搜索
parts.push(mrect(742, 44, 262, 34, { fill: '#0b0b12', stroke: C.lineStrong, sw: 1 }));
parts.push(glyph('search', mx(756), my(53), 2.4, C.textFaint));
mtx(774, 62, '搜索桌宠、作者或介绍', { size: 9.5, fill: C.textFaint });
mtx(994, 62, '/', { size: 9, mono: true, fill: C.textFaint, anchor: 'end' });
// 导入本地包
parts.push(K.el('path', { d: pxD(mx(1018) + 3, my(47) + 3, 138, 30, 4), fill: C.shadow }));
parts.push(K.el('path', { d: pxD(mx(1018), my(47), 138, 30, 4), fill: C.surfaceRise, stroke: C.lineStrong, 'stroke-width': 1.5 }));
parts.push(glyph('plus', mx(1030), my(57), 2.2, C.accent));
mtx(1048, 62, '导入本地包', { size: 9.5, weight: 600, fill: C.text });

// 过滤行
parts.push(K.el('line', { x1: mx(24), y1: my(88), x2: mx(1156), y2: my(88), stroke: C.line, 'stroke-width': 1 }));
// 安装方式下拉
parts.push(mrect(24, 100, 158, 30, { fill: C.surface, stroke: C.line, sw: 1 }));
mtx(36, 113, '安装方式', { size: 8, mono: true, fill: C.textFaint, ls: 1 });
mtx(88, 115, '拖入窗口', { size: 9.5, fill: C.text });
parts.push(glyph('down', mx(162), my(107), 2, C.textMuted));
['最热', '最新', '免费'].forEach((t, i) => {
  const x = 200 + i * 62;
  parts.push(mrect(x, 102, 54, 26, { fill: i === 0 ? C.accentSoft : 'none', stroke: i === 0 ? C.accent : C.line, sw: 1 }));
  mtx(x + 27, 115, t, { size: 9, fill: i === 0 ? C.accent : C.textMuted, anchor: 'middle' });
});
mtx(1156, 115, '共 24 个作品 · 其中 6 个已安装', { size: 8.5, mono: true, fill: C.textFaint, anchor: 'end', ls: 0.6 });

// 作品卡
const works = [
  { name: '鲸鱼娘 · 夜巡', author: '@kujira_lab', eng: 'DEEPSEEK', tag: '像素', sprite: 'deepseek-idle', dl: '2.4k', inst: true, hot: true },
  { name: '白龙 · 白夜', author: '@white_dragon', eng: 'DEEPSEEK', tag: '原图', sprite: 'white-dragon-hd', dl: '1.8k', inst: false },
  { name: '像素柯基', author: '@corgi.8bit', eng: 'CLAUDE', tag: '像素', sprite: 'claude-idle', dl: '1.2k', inst: true },
  { name: '章鱼博士', author: '@dr_octo', eng: 'CLAUDE', tag: '像素', sprite: 'claude-working', dl: '986', inst: false },
  { name: '太空猫', author: '@nyan_space', eng: 'DEEPSEEK', tag: '像素', sprite: 'deepseek-hd', dl: '744', inst: false },
  { name: '营业中', author: '@open_24h', eng: 'CLAUDE', tag: '原图', sprite: 'claude-done', dl: '512', inst: false },
];
works.forEach((w2, i) => {
  const cx2 = 24 + (i % 3) * 384;
  const cy2 = 146 + Math.floor(i / 3) * 162;
  const cw = 364, ch = 150;
  parts.push(mrect(cx2, cy2, cw, ch, { fill: C.surface, stroke: w2.hot ? C.accent : C.line, sw: w2.hot ? 2 : 1 }));
  // 封面
  parts.push(mrect(cx2 + 1, cy2 + 1, 102, ch - 2, { fill: 'url(#coverGrad)' }));
  parts.push(mrect(cx2 + 1, cy2 + 1, 102, ch - 2, { fill: 'url(#grid8)' }));
  parts.push(K.rect({ x: mx(cx2 + 1), y: my(cy2 + ch - 22), w: 102, h: 21, fill: '#0a0a10', opacity: 0.5 }));
  if (w2.inst) parts.push(K.rect({ x: mx(cx2 + 8), y: my(cy2 + 8), w: 44, h: 16, fill: C.mint, opacity: 0.92 }));
  if (w2.inst) mtx(cx2 + 12, cy2 + 16, '已安装', { size: 7, weight: 700, fill: C.ink });
  parts.push(sprFit(w2.sprite, mx(cx2 + 10), my(cy2 + 16), 84, 118));
  mtx(cx2 + 10, cy2 + ch - 8, w2.tag === '像素' ? 'PIXEL' : 'RAW', { size: 6.5, mono: true, fill: C.textFaint, ls: 1.4 });
  // 文案
  mtx(cx2 + 116, cy2 + 30, w2.name, { size: 13, weight: 600, fill: C.text, maxW: 200, tag: 'work-name' });
  mtx(cx2 + 116, cy2 + 50, w2.author, { size: 8.5, mono: true, fill: C.textFaint, ls: 0.6 });
  // 标签
  const engW = K.measure(w2.eng, 7.5) + 14;
  parts.push(mrect(cx2 + 116, cy2 + 66, engW, 18, { fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
  mtx(cx2 + 123, cy2 + 75, w2.eng, { size: 7.5, mono: true, fill: C.textMuted, ls: 0.8 });
  parts.push(mrect(cx2 + 122 + engW, cy2 + 66, 46, 18, { fill: 'none', stroke: C.line, sw: 1 }));
  mtx(cx2 + 145 + engW, cy2 + 75, w2.tag, { size: 7.5, fill: C.textMuted, anchor: 'middle' });
  // 操作
  if (w2.inst) {
    parts.push(K.el('path', { d: pxD(mx(cx2 + 116), my(cy2 + 104), 86, 28, 3), fill: C.accentSoft, stroke: C.accent, 'stroke-width': 1 }));
    parts.push(glyph('check', mx(cx2 + 126), my(cy2 + 111), 2, C.accent));
    mtx(cx2 + 146, cy2 + 118, '已安装', { size: 9.5, fill: C.accent });
  } else {
    parts.push(K.el('path', { d: pxD(mx(cx2 + 119), my(cy2 + 107), 86, 28, 3), fill: C.accentShade }));
    parts.push(K.el('path', { d: pxD(mx(cx2 + 116), my(cy2 + 104), 86, 28, 3), fill: C.accent }));
    parts.push(glyph('down', mx(cx2 + 128), my(cy2 + 112), 2, C.accentInk));
    mtx(cx2 + 158, cy2 + 118, '安装', { size: 9.5, weight: 700, fill: C.accentInk, anchor: 'middle' });
  }
  mtx(cx2 + cw - 14, cy2 + 118, w2.dl, { size: 8.5, mono: true, fill: C.textFaint, anchor: 'end' });
  mtx(cx2 + cw - 14, cy2 + 104, '下载', { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 1 });
  if (w2.hot) mtx(cx2 + cw - 14, cy2 + 30, 'HOVER', { size: 6.5, mono: true, fill: C.accent, anchor: 'end', ls: 1.4 });
});
// 底部加载
parts.push(K.el('line', { x1: mx(24), y1: my(474), x2: mx(1156), y2: my(474), stroke: C.line, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
mtx(590, 488, '已展示 6 / 24 · 滚动到底自动加载下一批', { size: 8.5, mono: true, fill: C.textFaint, anchor: 'middle', ls: 0.8 });

// 右侧批注
const mnX = MX + MW + 26;
const mnW = RIGHT - mnX;
parts.push(tx(mnX, MY + 6, 'MARKET SPEC', { size: 8, mono: true, fill: C.accent, ls: 2.4 }));
const mkNotes = [
  ['三个 tab', '发现 / 投稿作品 / 查询投稿 共用一条 40px 行高，切换不跳布局。'],
  ['安装方式', '拖入窗口 / 下载并打开 / 复制链接，三种都落在同一下拉。'],
  ['作品卡', '封面 102px + 引擎标签 + 安装态；已安装变成描边按钮。'],
];
mkNotes.forEach(([t, b], i) => {
  const ny = MY + 30 + i * 92;
  parts.push(K.rect({ x: mnX, y: ny, w: 3, h: 74, fill: i === 0 ? C.accent : C.line }));
  parts.push(tx(mnX + 14, ny + 10, t, { size: 12, weight: 600, fill: C.text, maxW: mnW - 14 }));
  parts.push(par(mnX + 14, ny + 30, b, { size: 9.5, lineHeight: 16, w: mnW - 20, fill: C.textMuted }));
});
// 统计块
const stY = MY + 322;
parts.push(K.rect({ x: mnX, y: stY, w: mnW, h: 156, fill: C.surface, stroke: C.line, sw: 1 }));
parts.push(tx(mnX + 16, stY + 22, 'MARKET / 24H', { size: 7.5, mono: true, fill: C.accent, ls: 2 }));
[['24', '在架作品'], ['6', '已安装'], ['08', '今日新增'], ['1.9k', '总下载']].forEach(([n, l], i) => {
  const qx2 = mnX + 16 + (i % 2) * 120;
  const qy2 = stY + 52 + Math.floor(i / 2) * 48;
  parts.push(tx(qx2, qy2, n, { size: 19, mono: true, weight: 700, fill: C.text }));
  parts.push(tx(qx2 + 2, qy2 + 18, l, { size: 8.5, fill: C.textFaint }));
});

y = MY + MH + 26;

/* =========================================================================
 * 9. 05 周边表面
 * ========================================================================= */
sectionHead(5, '周边表面', 'DSH 设置页注入面板 · 市场静态站');

const sX = PAD, sY = y;
// 标注
add(tx(sX, sY + 6, 'DSH SETTINGS PANEL · 460 WIDE · INJECTED', { size: 8, mono: true, fill: C.textFaint, ls: 1.4 }));
add(tx(RIGHT, sY + 6, 'lingpet.market · 静态站 · 与客户端同源', { size: 8, mono: true, fill: C.textFaint, ls: 1.4, anchor: 'end' }));

/* --- 左：DSH 面板（深色宿主） --- */
const dpX = sX, dpY = sY + 22, dpW = 460, dpH = 296;
add(sticker(dpX, dpY, dpW, dpH, { fill: C.surface, c: 8, stroke: C.lineStrong, sw: 2, shadow: 4 }));
add(K.rect({ x: dpX + 1, y: dpY + 1, w: dpW - 2, h: 3, fill: C.accent }));
// 面板头
add(glyph('star', dpX + 20, dpY + 22, 2.6, C.accent));
add(tx(dpX + 40, dpY + 25, '桌宠', { size: 12.5, weight: 600, fill: C.text, ls: 1 }));
add(tx(dpX + dpW - 20, dpY + 25, 'DSH SETTINGS', { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 1.4 }));
add(K.el('line', { x1: dpX + 20, y1: dpY + 42, x2: dpX + dpW - 20, y2: dpY + 42, stroke: C.line, 'stroke-width': 1 }));
// 标题
add(tx(dpX + 20, dpY + 68, '你的会话伙伴', { size: 15, weight: 700, fill: C.text, ls: 1.5 }));
add(tx(dpX + 20, dpY + 88, '颜色从宿主继承，强调色可被 --lp-accent 覆盖。', { size: 9, fill: C.textMuted, maxW: 400, tag: 'dsh-sub' }));
// 运行状态
add(tx(dpX + 20, dpY + 116, '桌宠运行状态', { size: 9.5, fill: C.textMuted }));
add(chip(dpX + 20, dpY + 126, { w: 230, h: 32, state: 'working', label: '执行工具', meta: 'DSH · 00:42', progress: 5, size: 10 }));
// 勾选
add(checkbox(dpX + 20, dpY + 174, true, '你的会话伙伴', { size: 11, meta: '默认开启', metaX: dpX + 260 }));
add(K.rect({ x: dpX + 300, y: dpY + 172, w: 140, h: 20, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
add(tx(dpX + 308, dpY + 182, '会话偏好：继承工作台', { size: 7.5, fill: C.textMuted, maxW: 126, tag: 'dsh-pref' }));
// 次操作
add(tx(dpX + 20, dpY + 214, '恢复继承配置', { size: 9, fill: C.accent }));
add(tx(dpX + 112, dpY + 214, '/ 查看工作台设置', { size: 9, fill: C.textFaint }));
// 主按钮（桃色 = 宿主 --lp-accent 调色）
add(K.el('path', { d: pxD(dpX + 24, dpY + 230, 412, 42, 6), fill: '#a8795a' }));
add(K.el('path', { d: pxD(dpX + 20, dpY + 226, 412, 42, 6), fill: '#efbc99' }));
add(glyph('monitor', dpX + 40, dpY + 238, 2.6, '#3a2418'));
add(tx(dpX + 226, dpY + 247, '打开工作台', { size: 12.5, weight: 700, fill: '#2a1a10', anchor: 'middle' }));
add(tx(dpX + 20, dpY + 284, 'PEACH = 宿主强调色示例 · 回退 --lp-accent', { size: 6.5, mono: true, fill: C.textFaint, ls: 1 }));

// 浅色变体
const lvX = sX, lvY = dpY + dpH + 20, lvW = 460, lvH = 132;
add(panel(lvX, lvY, lvW, lvH, { fill: C.light.bg, edge: C.light.line }));
add(tx(lvX + 16, lvY + 22, 'LIGHT HOST / 浅色宿主同一组件', { size: 7.5, mono: true, fill: C.light.muted, ls: 1.4 }));
add(glyph('star', lvX + 16, lvY + 38, 2.2, C.light.accent));
add(tx(lvX + 32, lvY + 41, '桌宠', { size: 11.5, weight: 700, fill: C.light.text }));
add(tx(lvX + 90, lvY + 41, '你的会话伙伴 · 执行工具', { size: 9.5, fill: C.light.muted }));
add(tx(lvX + 16, lvY + 68, '桌宠运行状态', { size: 8, mono: true, fill: C.light.muted, ls: 1 }));
add(K.el('path', { d: pxD(lvX + 116, lvY + 58, 196, 22, 4), fill: C.light.surface, stroke: C.light.line, 'stroke-width': 1 }));
add(K.rect({ x: lvX + 124, y: lvY + 66, w: 6, h: 6, fill: STATE.working.color }));
add(tx(lvX + 136, lvY + 69, '● 执行工具 · DSH', { size: 9, fill: C.light.text }));
add(K.el('path', { d: pxD(lvX + 16, lvY + 92, 180, 28, 4), fill: C.light.accent }));
add(tx(lvX + 106, lvY + 106, '打开工作台', { size: 10.5, weight: 700, fill: '#fff8ec', anchor: 'middle' }));
add(tx(lvX + 210, lvY + 106, '底色 = color-mix(in srgb, currentColor 6%, transparent)', { size: 7.5, mono: true, fill: C.light.muted, maxW: 240, tag: 'light-note' }));

/* --- 右：市场静态站 --- */
const webX = sX + 500, webY = sY + 22, webW = 940, webH = 428;
add(winFrame(webX, webY, webW, webH, 'BROWSER'));
// 地址栏
add(K.rect({ x: webX + 104, y: webY + 7, w: 320, h: 16, fill: '#0d0d15', stroke: C.line, sw: 1 }));
add(tx(webX + 112, webY + 15, 'lingpet.market/explore', { size: 7, mono: true, fill: C.textMuted }));
// 站点导航
add(K.rect({ x: webX, y: webY + 30, w: webW, h: 52, fill: '#0c0c13' }));
add(brandGlyph(webX + 24, webY + 46, 2, C.accent));
add(tx(webX + 44, webY + 53, 'LINGPET', { size: 11, mono: true, weight: 700, fill: C.text, ls: 3 }));
add(tx(webX + 44, webY + 68, '灵伴 · 像素角色市场', { size: 7, fill: C.textFaint, ls: 0.6 }));
['发现', '榜单', '投稿', '关于'].forEach((t, i) => {
  add(tx(webX + 300 + i * 62, webY + 58, t, { size: 9, fill: i === 0 ? C.accent : C.textMuted }));
});
add(K.el('path', { d: pxD(webX + webW - 132, webY + 42, 108, 28, 4), fill: C.accent }));
add(tx(webX + webW - 78, webY + 56, '上传作品', { size: 9.5, weight: 700, fill: C.accentInk, anchor: 'middle' }));
// hero
add(K.rect({ x: webX, y: webY + 82, w: webW, h: 96, fill: 'url(#aurora)' }));
add(tx(webX + 40, webY + 116, '桌宠市场', { size: 26, weight: 700, fill: C.text, ls: 4 }));
add(tx(webX + 40, webY + 140, '24 个作品 · 每天新增 · 全部由作者上传', { size: 9.5, fill: C.textMuted, maxW: 360, tag: 'web-sub' }));
// hero 右侧像素装饰
for (let i = 0; i < 5; i++) add(K.rect({ x: webX + webW - 120 + i * 18, y: webY + 96 + (i % 2) * 16, w: 8, h: 8, fill: C.accent, opacity: 0.8 - i * 0.12 }));
// 精选卡
const feats = [
  ['鲸鱼娘 · 夜巡', 'DEEPSEEK · 2.4k', 'deepseek-idle'],
  ['白龙 · 白夜', 'DEEPSEEK · 1.8k', 'white-dragon-hd'],
  ['像素柯基', 'CLAUDE · 1.2k', 'claude-idle'],
];
feats.forEach(([name, meta, sprName], i) => {
  const fx = webX + 40 + i * 288;
  const fy = webY + 196;
  add(K.rect({ x: fx, y: fy, w: 264, h: 150, fill: C.surface, stroke: C.line, sw: 1 }));
  add(K.rect({ x: fx + 1, y: fy + 1, w: 262, h: 92, fill: 'url(#coverGrad)' }));
  add(K.rect({ x: fx + 1, y: fy + 1, w: 262, h: 92, fill: 'url(#grid8)' }));
  add(sprFit(sprName, fx + 84, fy + 4, 96, 86));
  add(tx(fx + 14, fy + 112, name, { size: 11.5, weight: 600, fill: C.text, maxW: 236, tag: 'web-card' }));
  add(tx(fx + 14, fy + 130, meta, { size: 7.5, mono: true, fill: C.textFaint, ls: 0.8 }));
  add(glyph('down', fx + 232, fy + 112, 2, C.accent));
});
add(tx(webX + 40, webY + 372, '坚持像素原生：所有封面按 1:1 贴图，不做模糊放大。', { size: 8.5, fill: C.textFaint, maxW: 600, tag: 'web-foot' }));
add(tx(webX + webW - 40, webY + 372, 'LINGPET / 静态站', { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 1.2 }));
add(K.el('line', { x1: webX + 40, y1: webY + 350, x2: webX + webW - 40, y2: webY + 350, stroke: C.line, 'stroke-width': 1 }));

y = sY + 22 + 296 + 20 + 132 + 30;

/* =========================================================================
 * 10. 06 设计语言
 * ========================================================================= */
sectionHead(6, '设计语言', '0 圆角 · 2px 描边 · 4px 硬投影 · steps()');

const colA = PAD, colB = PAD + 496, colC = PAD + 992, colW = 480;
function langCard(x, y2, w, h, tag, title) {
  let s = panel(x, y2, w, h, { fill: C.surface, edge: C.line });
  s += K.rect({ x: x + 1, y: y2 + 1, w: 44, h: 2, fill: C.accent });
  s += tx(x + 16, y2 + 22, tag, { size: 7, mono: true, fill: C.accent, ls: 1.8 });
  s += tx(x + 16, y2 + 42, title, { size: 13.5, weight: 600, fill: C.text, ls: 1, maxW: w - 32, tag: 'lang-title' });
  return s;
}

const row1Y = y, row1H = 236;
const row2Y = row1Y + row1H + 16, row2H = 300;
const row3Y = row2Y + row2H + 16, row3H = 196;

/* --- 色彩 --- */
add(langCard(colA, row1Y, colW, row1H, 'A / CORE PALETTE', '主色板 · 9 色'));
const pal = [
  ['BG', C.bg], ['SURFACE', C.surface], ['SURFACE ALT', C.surfaceAlt],
  ['LINE', C.line], ['TEXT MUTED', C.textMuted], ['TEXT', C.text],
  ['ACCENT', C.accent], ['SECONDARY', C.secondary], ['ACCENT SOFT', C.accentSoft],
];
pal.forEach(([name, hex], i) => {
  const px = colA + 16 + (i % 3) * 150;
  const py = row1Y + 52 + Math.floor(i / 3) * 58;
  add(K.rect({ x: px, y: py, w: 142, h: 34, fill: hex, stroke: C.line, sw: 1 }));
  if (hex === C.bg) add(K.rect({ x: px, y: py, w: 142, h: 34, fill: 'none', stroke: C.lineStrong, sw: 1 }));
  add(tx(px, py + 44, hex.toUpperCase(), { size: 8, mono: true, fill: C.textMuted, ls: 0.8 }));
  add(tx(px, py + 54, name, { size: 6.5, mono: true, fill: C.textFaint, ls: 1 }));
});

/* --- 状态色 --- */
add(langCard(colB, row1Y, colW, row1H, 'B / STATE COLORS', '八种状态 · 色 + 动效'));
const stateOrder = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];
const mot = { idle: '1F', thinking: '2F 闪', working: '8F 进', input: '2F 闪', approval: '4F 摇', done: '2F 弹', error: '4F 抖', sleep: '1F' };
stateOrder.forEach((k, i) => {
  const st = STATE[k];
  const px = colB + 16 + (i % 4) * 114;
  const py = row1Y + 58 + Math.floor(i / 4) * 78;
  add(K.rect({ x: px, y: py, w: 106, h: 46, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
  add(K.rect({ x: px, y: py, w: 3, h: 46, fill: st.color }));
  add(glyph(st.icon, px + 12, py + 14, 3, st.color));
  add(tx(px + 34, py + 18, st.cn, { size: 9.5, fill: C.text, maxW: 66, tag: 'state-cn2' }));
  add(tx(px + 34, py + 34, st.en, { size: 6, mono: true, fill: C.textFaint, ls: 0.8 }));
  add(tx(px + 100, py + 40, mot[k], { size: 6, mono: true, fill: st.color, anchor: 'end', opacity: 0.9 }));
});
add(tx(colB + 16, row1Y + 214, '颜色之外，动效时长与点阵图标同维度区分；色值见 tokens.json → colors.state', { size: 8.5, fill: C.textFaint, maxW: colW - 32, tag: 'state-note' }));

/* --- 浅色变体 --- */
add(langCard(colC, row1Y, colW, row1H, 'C / LIGHT HOST', '浅色宿主 · 同一套 token'));
add(K.rect({ x: colC + 16, y: row1Y + 56, w: colW - 32, h: 150, fill: C.light.bg, stroke: C.light.line, sw: 1 }));
add(tx(colC + 32, row1Y + 80, 'PIXEL WORKSHOP', { size: 8, mono: true, fill: C.light.muted, ls: 2 }));
add(tx(colC + 32, row1Y + 102, '像素工坊', { size: 20, weight: 700, fill: C.light.text, ls: 3 }));
add(K.rect({ x: colC + 32, y: row1Y + 118, w: 148, h: 34, fill: C.light.surface, stroke: C.light.line, sw: 1 }));
add(tx(colC + 44, row1Y + 135, '选择一位伙伴', { size: 9, fill: C.light.text }));
add(K.el('path', { d: pxD(colC + 194, row1Y + 118, 104, 34, 4), fill: C.light.accent }));
add(tx(colC + 246, row1Y + 135, '打开工作台', { size: 9, weight: 700, fill: '#fff8ec', anchor: 'middle' }));
add(tx(colC + 32, row1Y + 172, '#f2ecdd · #faf6ea · #1b1b26 · #c2691c', { size: 7.5, mono: true, fill: C.light.muted, ls: 0.4 }));
add(tx(colC + 32, row1Y + 188, '跟随 prefers-color-scheme 与 prefers-contrast 两档', { size: 8, fill: C.light.muted, maxW: 380, tag: 'light-host-note' }));

/* --- 字阶 --- */
add(langCard(colA, row2Y, colW, row2H, 'D / TYPE SCALE', '7 档字阶 · 中文 YaHei / 英文 Consolas'));
const typeRows = [
  ['DISPLAY', 40, 700, '像素工坊', C.text, 6],
  ['H1', 28, 700, '桌宠工作台', C.text, 8],
  ['H2', 20, 650, '你的会话伙伴', C.text, 10],
  ['BODY', 14, 400, '选择一位伙伴，设置它的外观和跟随方式。', C.textMuted, 12],
  ['META', 12, 400, '跟随 DSH / Cursor / Codex 三个会话', C.textMuted, 14],
  ['MONO', 12, 400, 'steps(2, end) · 8px grid · #ffa63d', C.secondary, 16],
  ['MICRO', 10, 400, 'HINT / LEGAL · 10PX 全大写辅助标签', C.textFaint, 18],
];
let ty = row2Y + 86;
typeRows.forEach(([name, size, weight, sample, fill, lh], i) => {
  add(tx(colA + 16, ty, name, { size: 6.5, mono: true, fill: C.textFaint, ls: 1.2 }));
  add(tx(colA + 16, ty + 10, `${size}/${lh}`, { size: 7, mono: true, fill: C.textFaint, ls: 0.6 }));
  add(tx(colA + 74, ty + (size > 26 ? 4 : 2), sample, {
    size: Math.min(size, 40), weight, fill, maxW: colW - 100, tag: `type-${name}`, mono: name === 'MONO', ls: name === 'MICRO' ? 1.2 : 0,
  }));
  ty += [50, 42, 32, 26, 23, 21, 20][i];
});

/* --- 形状 --- */
add(langCard(colB, row2Y, colW, row2H, 'E / SHAPE', '形状：0 圆角 / 2px 描边 / 4px 硬投影'));
const shapeCells = [
  ['0 圆角 + 1px 细线', '信息区与正文容器', 0],
  ['2px 硬描边控件', '按钮 / 输入 / 卡片焦点', 1],
  ['4px 位移硬投影', '贴纸态：浮起但不发光', 2],
  ['像素斜角面板', '斜角 c=8 / 12，配 L 角标', 3],
];
shapeCells.forEach(([label, desc, kind], i) => {
  const sx2 = colB + 16 + (i % 2) * 224;
  const sy2 = row2Y + 56 + Math.floor(i / 2) * 116;
  if (kind === 0) {
    add(K.rect({ x: sx2, y: sy2, w: 206, h: 56, fill: 'none', stroke: C.line, sw: 1 }));
    add(tx(sx2 + 12, sy2 + 28, '正文容器 · 1px 细线', { size: 8, fill: C.textFaint, maxW: 182 }));
  }
  if (kind === 1) {
    add(K.el('path', { d: pxD(sx2, sy2, 206, 56, 6), fill: C.surfaceAlt, stroke: C.lineStrong, 'stroke-width': 2 }));
    add(tx(sx2 + 103, sy2 + 28, '按钮 · 2px 硬描边', { size: 8.5, fill: C.textMuted, anchor: 'middle' }));
  }
  if (kind === 2) {
    add(K.rect({ x: sx2, y: sy2, w: 206, h: 56, fill: C.surfaceRise }));
    add(sticker(sx2 + 14, sy2 + 8, 168, 40, { fill: C.surface, c: 4, stroke: C.accent, sw: 2, shadow: 4 }));
    add(tx(sx2 + 98, sy2 + 28, 'FOCUS', { size: 9, mono: true, weight: 700, fill: C.accent, anchor: 'middle', ls: 2 }));
  }
  if (kind === 3) {
    add(K.el('path', { d: pxD(sx2, sy2, 206, 56, 12), fill: C.surfaceAlt, stroke: C.lineStrong, 'stroke-width': 2 }) + brackets(sx2, sy2, 206, 56, { color: C.accent, len: 12, sw: 1.5, inset: 4 }));
    add(tx(sx2 + 103, sy2 + 28, '面板 · 斜角 12', { size: 8.5, fill: C.textMuted, anchor: 'middle' }));
  }
  add(tx(sx2, sy2 + 74, label, { size: 9.5, fill: C.text, maxW: 206, tag: 'shape-label' }));
  add(tx(sx2, sy2 + 86, desc, { size: 8, fill: C.textFaint, maxW: 206, tag: 'shape-desc' }));
});

/* --- 光影与纹理 --- */
add(langCard(colC, row2Y, colW, row2H, 'F / LIGHT + TEXTURE', '阴影 / 发光 / 纹理'));
const lightCells = [
  ['硬投影', '4px 4px 0 #050509', 'shadow'],
  ['径向光', 'pet glow · 只给角色', 'glow'],
  ['点阵', '8px dot · 面板底纹', 'dots'],
  ['斜纹', '4px scan · 进度/强调', 'scan'],
];
lightCells.forEach(([label, desc, kind], i) => {
  const sx2 = colC + 16 + (i % 2) * 224;
  const sy2 = row2Y + 56 + Math.floor(i / 2) * 116;
  add(K.rect({ x: sx2, y: sy2, w: 206, h: 56, fill: '#0b0b12', stroke: C.line, sw: 1 }));
  add(clipDef(`tex${i}`, `M${sx2} ${sy2} h206 v56 h-206 Z`));
  let inner = '';
  if (kind === 'shadow') {
    inner += K.rect({ x: sx2 + 20, y: sy2 + 14, w: 120, h: 28, fill: C.shadow });
    inner += K.rect({ x: sx2 + 16, y: sy2 + 10, w: 120, h: 28, fill: C.surfaceRise, stroke: C.accent, sw: 2 });
  }
  if (kind === 'glow') {
    inner += K.circle({ cx: sx2 + 70, cy: sy2 + 28, r: 46, fill: 'url(#petGlow)' });
    inner += K.rect({ x: sx2 + 58, y: sy2 + 16, w: 24, h: 24, fill: C.accent });
  }
  if (kind === 'dots') {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) {
      const ox = sx2 + 14 + k * 19, oy2 = sy2 + 8 + r * 13;
      inner += K.rect({ x: ox, y: oy2, w: 3, h: 3, fill: C.lineStrong });
      inner += K.rect({ x: ox + 8, y: oy2 + 5, w: 2, h: 2, fill: C.line });
    }
    inner += K.rect({ x: sx2 + 12, y: sy2 + 12, w: 74, h: 32, fill: 'none', stroke: C.accent, sw: 1 });
  }
  if (kind === 'scan') {
    inner += K.rect({ x: sx2 + 20, y: sy2 + 18, w: 160, h: 22, fill: C.surfaceAlt });
    inner += K.rect({ x: sx2 + 20, y: sy2 + 18, w: 96, h: 22, fill: C.accent });
    for (let k = 0; k < 11; k++) inner += K.rect({ x: sx2 + 20, y: sy2 + 18 + k * 2, w: k < 10 ? 160 : 160, h: 1, fill: C.bg, opacity: 0.55 });
  }
  add(clipUse(`tex${i}`, inner));
  add(tx(sx2, sy2 + 72, label, { size: 9.5, fill: C.text, maxW: 206 }));
  add(tx(sx2, sy2 + 84, desc, { size: 8, mono: kind === 'shadow', fill: C.textFaint, maxW: 206, tag: 'tex-desc' }));
});

/* --- 动效 --- */
add(langCard(colA, row3Y, colW, row3H, 'G / MOTION', '动效：全部 steps()，不做缓动'));
const motions = [
  ['状态点闪烁', 'steps(2) 900ms', 'blink'],
  ['进度条推进', 'steps(8) 1200ms', 'prog'],
  ['气泡弹出', 'steps(4) 160ms', 'pop'],
  ['按钮按下位移', 'translate 2px · steps(1)', 'press'],
];
motions.forEach(([label, spec, kind], i) => {
  const my2 = row3Y + 66 + i * 32;
  add(tx(colA + 16, my2, label, { size: 9, fill: C.text, maxW: 100 }));
  const bx = colA + 130;
  if (kind === 'blink') {
    for (let k = 0; k < 8; k++) add(K.rect({ x: bx + k * 26, y: my2 - 6, w: 22, h: 12, fill: k % 2 ? C.accent : C.surfaceAlt }));
  }
  if (kind === 'prog') {
    for (let k = 0; k < 8; k++) add(K.rect({ x: bx + k * 26, y: my2 - 6, w: 22, h: 12, fill: k < 5 ? C.gold : C.surfaceAlt }));
  }
  if (kind === 'pop') {
    const szs = [4, 8, 12, 18, 22, 22, 22, 22];
    szs.forEach((sz, k) => add(K.rect({ x: bx + k * 26 + (22 - sz) / 2, y: my2 - sz / 2, w: sz, h: sz, fill: k > 2 ? C.text : C.secondary, opacity: 0.35 + k * 0.09 })));
  }
  if (kind === 'press') {
    add(K.rect({ x: bx, y: my2 - 8, w: 54, h: 16, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
    add(K.rect({ x: bx + 8, y: my2 - 6, w: 54, h: 16, fill: C.shadow }));
    add(K.rect({ x: bx + 6, y: my2 - 8, w: 54, h: 16, fill: C.accent }));
    add(K.el('line', { x1: bx + 70, y1: my2, x2: bx + 96, y2: my2, stroke: C.lineStrong, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    add(tx(bx + 106, my2, '+2px', { size: 7, mono: true, fill: C.textFaint }));
  }
  add(tx(colA + colW - 16, my2, spec, { size: 7, mono: true, fill: C.textFaint, anchor: 'end', ls: 0.6, maxW: 150, tag: 'motion-spec' }));
});
add(tx(colA + 16, row3Y + row3H - 14, 'prefers-reduced-motion: reduce → 全部降到 0.01ms，只保留终态', { size: 8, fill: C.textFaint, maxW: colW - 32, tag: 'motion-note' }));

/* --- 图标 --- */
add(langCard(colB, row3Y, colW, row3H, 'H / PIXEL GLYPHS', '图标：5×5 / 7×7 点阵'));
const iconList = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];
iconList.forEach((name, i) => {
  const ix2 = colB + 20 + (i % 4) * 112;
  const iy2 = row3Y + 62 + Math.floor(i / 4) * 66;
  add(K.rect({ x: ix2, y: iy2, w: 40, h: 40, fill: '#0b0b12', stroke: C.line, sw: 1 }));
  add(glyph(name, ix2 + 5, iy2 + 5, 6, i === 6 ? C.red : C.text));
  add(tx(ix2, iy2 + 52, name.toUpperCase(), { size: 6, mono: true, fill: C.textFaint, ls: 0.8 }));
  add(tx(ix2 + 40, iy2 + 52, '5×5', { size: 6, mono: true, fill: '#3f3f58', anchor: 'end' }));
});
add(tx(colB + 20, row3Y + row3H - 14, 'unit 2 / 3 / 4 三档：12 / 18 / 24px，落在 2px 网格上', { size: 8, fill: C.textFaint, maxW: colW - 32, tag: 'icon-note' }));

/* --- 8px 网格 --- */
add(langCard(colC, row3Y, colW, row3H, 'I / 8PX GRID', '网格：所有坐标落在 8 的倍数'));
const gx0 = colC + 20, gy0 = row3Y + 60;
add(K.rect({ x: gx0, y: gy0, w: 168, h: 104, fill: '#0b0b12', stroke: C.line, sw: 1 }));
add(K.rect({ x: gx0, y: gy0, w: 168, h: 104, fill: 'url(#grid8)' }));
[[8, 8, 48, 24], [64, 8, 88, 24], [8, 40, 48, 56], [64, 40, 152, 56]].forEach(([x, y2, x2, y3]) => {
  add(K.rect({ x: gx0 + x, y: gy0 + y2, w: x2 - x, h: y3 - y2, fill: C.accent, opacity: 0.22, stroke: C.accent, sw: 1 }));
});
for (let k = 0; k <= 20; k++) add(K.rect({ x: gx0 + k * 8, y: gy0 - 4, w: 1, h: 3, fill: k % 2 ? '#3f3f58' : C.lineStrong }));
add(tx(gx0 + 182, gy0 + 16, '8px 网格', { size: 9.5, fill: C.text }));
add(tx(gx0 + 182, gy0 + 32, '间距 8 / 16 / 24 / 32', { size: 8, mono: true, fill: C.textFaint, ls: 0.4 }));
add(tx(gx0 + 182, gy0 + 48, '2px 描边中心对齐', { size: 8, mono: true, fill: C.textFaint, ls: 0.4 }));
add(tx(gx0 + 182, gy0 + 64, '图标落 2px 子网格', { size: 8, mono: true, fill: C.textFaint, ls: 0.4 }));
add(tx(gx0 + 182, gy0 + 80, '斜角 c ∈ {6,8,12}', { size: 8, mono: true, fill: C.textFaint, ls: 0.4 }));

/* --- CSS 变量映射 --- */
const cssY = row3Y + row3H + 20;
add(K.rect({ x: PAD, y: cssY, w: INNER, h: 92, fill: '#0b0b12', stroke: C.line, sw: 1 }));
add(K.rect({ x: PAD, y: cssY, w: 4, h: 92, fill: C.accent }));
add(tx(PAD + 20, cssY + 22, 'CSS VARIABLES / 直接可落地的映射', { size: 8, mono: true, fill: C.accent, ls: 2 }));
const cssLines = [
  '--lp-bg: #0a0a10; --lp-surface: #14141f; --lp-surface-alt: #1b1b2a; --lp-line: #2c2c42;',
  '--lp-text: #f2ead8; --lp-text-muted: #a8a2ba; --lp-accent: #ffa63d; --lp-accent-ink: #16100a;',
  '--lp-radius: 0; --lp-border: 2px; --lp-shadow: 4px 4px 0 #050509; --lp-ease: steps(2, end);',
];
cssLines.forEach((l, i) => add(tx(PAD + 20, cssY + 44 + i * 18, l, { size: 8.5, mono: true, fill: i === 0 ? C.textMuted : C.textFaint, maxW: INNER - 40, tag: 'css-line' })));

y = cssY + 92 + 24;

// 页脚
add(K.el('line', { x1: PAD, y1: y + 6, x2: RIGHT, y2: y + 6, stroke: C.line, 'stroke-width': 1 }));
add(tx(PAD, y + 28, '方案 A · 像素工坊 / PIXEL WORKSHOP', { size: 9, mono: true, fill: C.textFaint, ls: 2 }));
add(tx(RIGHT - 84, y + 28, 'LINGPET 灵伴 · 2026 · 由 board.mjs 生成', { size: 8, mono: true, fill: '#3f3f58', anchor: 'end', ls: 1.2 }));
[0, 1, 2].forEach((i) => add(K.rect({ x: RIGHT - 60 + i * 10, y: y + 34, w: 4, h: 4, fill: C.accent, opacity: 1 - i * 0.3 })));
y += 56;

/* =========================================================================
 * 收尾
 * ========================================================================= */
sh.y = y + PAD * 0.7;
await sh.finish(OUT);
console.log(`board: ${OUT}`);
console.log(`height: ${Math.ceil(sh.y)}`);
if (warnings.length) {
  console.log('\n⚠️ 文字溢出提示（需修正）:');
  warnings.forEach((w) => console.log('  ' + w));
} else {
  console.log('✅ 无文字溢出提示');
}
