/**
 * 灵伴 LingPet · 视觉改版提案 04 · 方向 D「终端脉动 / TERMINAL PULSE」
 *
 * 把桌宠做成一个可爱的 CLI 进程：状态胶囊 = statusline，动作 = 进度条/行内提示，
 * 会话跟随 = 一个常驻的 agent 标签页。
 *
 * 运行： node design/proposals/04-terminal-pulse/board.mjs
 */
import * as K from '../../lib/svgkit.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'board.png');

/* ---------------------------------------------------------------------------
 * 0. 设计 token（与同目录 tokens.json 一一对应）
 * ------------------------------------------------------------------------- */
const F = {
  ui: "'Microsoft YaHei','Noto Sans SC',sans-serif",
  mono: "Consolas,'Cascadia Mono',monospace",
  sym: "Consolas,'Segoe UI Symbol','Microsoft YaHei',monospace",
  mix: "Consolas,'Microsoft YaHei',monospace",
};

const C = {
  bg: '#070A09',
  surface: '#0C1210',
  surfaceAlt: '#111917',
  surfaceHi: '#16201D',
  line: '#1E2B26',
  lineStrong: '#31443C',
  text: '#D8E2DB',
  textMuted: '#8DA096',
  textFaint: '#6E8278',
  accent: '#54F0A6',
  accentSoft: '#0E2A1D',
  accentText: '#05130C',
  secondary: '#A38BFF',
  state: {
    idle: '#8DA096',
    thinking: '#79B8FF',
    working: '#54F0A6',
    input: '#E8D44D',
    approval: '#E8A33B',
    done: '#4FD8E8',
    error: '#FF5F66',
    sleep: '#5F7379',
  },
};

const RAD = { window: 2, panel: 2, card: 2, control: 2, pill: 2 };
const MOTION = {
  ease: 'cubic-bezier(.2,.8,.2,1)',
  steps: 'steps(8, end)',
  fast: '90ms',
  base: '160ms',
  slow: '320ms',
  blink: '1s',
  scan: '8s',
};

/* ---------------------------------------------------------------------------
 * 1. defs：渐变 / 纹理 / 滤镜
 * ------------------------------------------------------------------------- */
const DEFS = `
<linearGradient id="boardBg" x1="0" y1="0" x2="0.25" y2="1">
  <stop offset="0" stop-color="#070A09"/>
  <stop offset="0.5" stop-color="#0A100E"/>
  <stop offset="1" stop-color="#060908"/>
</linearGradient>
<radialGradient id="vignette" cx="50%" cy="26%" r="78%">
  <stop offset="0" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.62" stop-color="#000000" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.5"/>
</radialGradient>
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
  <circle cx="1" cy="1" r="0.9" fill="#ffffff" fill-opacity="0.032"/>
</pattern>
<pattern id="dotsFine" width="8" height="8" patternUnits="userSpaceOnUse">
  <circle cx="0.8" cy="0.8" r="0.8" fill="#ffffff" fill-opacity="0.03"/>
</pattern>
<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
  <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>
</pattern>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
  <rect width="4" height="1" fill="#000000" fill-opacity="0.18"/>
</pattern>
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
</pattern>
<linearGradient id="wall" x1="0" y1="0" x2="0.65" y2="1">
  <stop offset="0" stop-color="#0C1714"/>
  <stop offset="0.55" stop-color="#08100E"/>
  <stop offset="1" stop-color="#0B0F10"/>
</linearGradient>
<radialGradient id="wallGlow1" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#2E6B5A" stop-opacity="0.28"/>
  <stop offset="1" stop-color="#2E6B5A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="wallGlow2" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#3B4B8A" stop-opacity="0.16"/>
  <stop offset="1" stop-color="#3B4B8A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="petGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#54F0A6" stop-opacity="0.18"/>
  <stop offset="0.55" stop-color="#54F0A6" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#54F0A6" stop-opacity="0"/>
</radialGradient>
<radialGradient id="stageGlow" cx="50%" cy="40%" r="58%">
  <stop offset="0" stop-color="#54F0A6" stop-opacity="0.14"/>
  <stop offset="0.65" stop-color="#54F0A6" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#54F0A6" stop-opacity="0"/>
</radialGradient>
<linearGradient id="sceneShade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0.5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="panelTop" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#101815"/>
  <stop offset="1" stop-color="#0B110F"/>
</linearGradient>
<filter id="soft" x="-25%" y="-25%" width="150%" height="170%">
  <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.55"/>
</filter>
<filter id="softSm" x="-30%" y="-30%" width="160%" height="160%">
  <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.5"/>
</filter>
<filter id="blur2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="blur6" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur14" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="glowG" x="-120%" y="-120%" width="340%" height="340%">
  <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#54F0A6" flood-opacity="0.55"/>
</filter>
<filter id="glowA" x="-120%" y="-120%" width="340%" height="340%">
  <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#E8A33B" flood-opacity="0.5"/>
</filter>
<filter id="glowR" x="-120%" y="-120%" width="340%" height="340%">
  <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#FF5F66" flood-opacity="0.5"/>
</filter>
<filter id="glowC" x="-120%" y="-120%" width="340%" height="340%">
  <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#4FD8E8" flood-opacity="0.5"/>
</filter>
`;

/* ---------------------------------------------------------------------------
 * 2. 图元 helper
 * ------------------------------------------------------------------------- */
const hexA = K.hexA;

function mono(x, y, s, size = 11, fill = C.textMuted, ext = {}) {
  return K.text({ x, y, s, size, family: F.mono, fill, ...ext });
}
function monoM(x, y, s, size = 11, fill = C.textMuted, ext = {}) {
  return K.text({ x, y, s, size, family: F.mono, fill, baseline: 'middle', ...ext });
}
function ui(x, y, s, size = 13, fill = C.text, ext = {}) {
  return K.text({ x, y, s, size, family: F.ui, fill, ...ext });
}
function uiM(x, y, s, size = 13, fill = C.text, ext = {}) {
  return K.text({ x, y, s, size, family: F.ui, fill, baseline: 'middle', ...ext });
}
function symM(x, y, s, size = 11, fill = C.textMuted, ext = {}) {
  return K.text({ x, y, s, size, family: F.sym, fill, baseline: 'middle', ...ext });
}
function mixM(x, y, s, size = 11, fill = C.text, ext = {}) {
  return K.text({ x, y, s, size, family: F.mix, fill, baseline: 'middle', ...ext });
}

/** 等宽推进：Consolas ASCII 精确 0.55em，CJK 1em（比 svgkit.measure 更精确，用于拼接代码/标签） */
function monoW(s, size) {
  let em = 0;
  for (const ch of String(s)) em += ch.codePointAt(0) >= 0x2e80 ? 1 : 0.55;
  return em * size;
}

function panel(x, y, w, h, ext = {}) {
  return K.rect({
    x, y, w, h, r: ext.r ?? RAD.panel,
    fill: ext.fill ?? C.surface,
    stroke: ext.stroke === null ? undefined : (ext.stroke ?? C.line),
    sw: ext.sw ?? 1,
    filter: ext.filter,
    opacity: ext.opacity,
    dash: ext.dash,
  });
}

function ellipse(o) {
  return K.el('ellipse', {
    cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry,
    fill: o.fill ?? 'none', 'fill-opacity': o.fillOpacity,
    stroke: o.stroke, 'stroke-width': o.sw,
    opacity: o.opacity, filter: o.filter,
  });
}

function pathEl(d, o = {}) {
  return K.el('path', {
    d,
    fill: o.fill ?? 'none',
    'fill-opacity': o.fillOpacity,
    stroke: o.stroke,
    'stroke-width': o.sw,
    'stroke-opacity': o.strokeOpacity,
    'stroke-dasharray': o.dash,
    'stroke-linecap': o.linecap ?? 'round',
    'stroke-linejoin': o.linejoin,
    opacity: o.opacity,
    filter: o.filter,
    transform: o.transform,
  });
}

/** 局部坐标系 + 自动裁剪的嵌套 svg */
function nested(x, y, w, h, body, attrs = {}) {
  return K.el('svg', { x, y, width: w, height: h, viewBox: `0 0 ${w} ${h}`, overflow: 'hidden', ...attrs }, body);
}

/** 像素贴图：加 image-rendering 防止放大后糊成一片 */
function petSprite(name, x, y, w, h) {
  return K.sprite({ name, x, y, w, h }).replace('<image ', '<image image-rendering="pixelated" ');
}

/** 方括号标签，返回 {svg,w}，w 为估算宽度 */
function btag(x, y, label, color = C.textMuted, o = {}) {
  const size = o.size ?? 10;
  const s = `[${label}]`;
  const w = K.measure(s, size);
  return { svg: mono(x, y, s, size, color, { weight: o.weight ?? 600, ls: o.ls ?? 0 }), w, size };
}

/** 状态胶囊（方向 D 的核心组件） */
function statusChip(x, y, o = {}) {
  const h = o.h ?? 30;
  const color = o.color ?? C.state.working;
  const w = o.w ?? 300;
  const size = o.size ?? 10;
  const out = [];
  out.push(K.rect({ x, y, w, h, r: RAD.pill, fill: hexA(color, 0.085), stroke: hexA(color, 0.45), sw: 1 }));
  out.push(K.rect({ x, y, w: 4, h, fill: color }));
  let cx = x + 12;
  if (o.icon) {
    out.push(symM(cx, y + h / 2, o.icon, 10, color));
    cx += 14;
  }
  out.push(monoM(cx, y + h / 2, `[${o.state}]`, size, color, { weight: 600 }));
  cx += K.measure(`[${o.state}]`, size) + 9;
  out.push(uiM(cx, y + h / 2, o.label ?? '', 12, C.text));
  cx += K.measure(o.label ?? '', 12) + 9;
  if (o.note) {
    out.push(mixM(cx, y + h / 2, o.note, 9.5, C.textMuted));
  }
  if (o.seg !== undefined) {
    const n = o.segN ?? 8;
    const sw2 = o.segW ?? 6;
    const gap = 2;
    const total = n * sw2 + (n - 1) * gap;
    const sx = x + w - 10 - total - (o.meta ? 0 : 0);
    for (let i = 0; i < n; i++) {
      out.push(K.rect({ x: sx + i * (sw2 + gap), y: y + h / 2 - 4.5, w: sw2, h: 9, fill: i < o.seg ? color : C.line }));
    }
    if (o.meta) out.push(monoM(sx - 12, y + h / 2, o.meta, 9, C.textMuted, { anchor: 'end' }));
  } else if (o.meta) {
    out.push(monoM(x + w - 10, y + h / 2, o.meta, 9, C.textMuted, { anchor: 'end' }));
  }
  return out.join('');
}

/** 分段进度条，返回 {svg,w} */
function segbar(x, y, o = {}) {
  const n = o.n ?? 8;
  const filled = o.filled ?? 5;
  const w = o.w ?? 7;
  const gap = o.gap ?? 2;
  const h = o.h ?? 9;
  const color = o.color ?? C.accent;
  let svg = '';
  for (let i = 0; i < n; i++) {
    svg += K.rect({ x: x + i * (w + gap), y, w, h, fill: i < filled ? color : C.line });
  }
  return { svg, w: n * w + (n - 1) * gap };
}

/** 键帽 */
function keycap(x, y, label, o = {}) {
  const size = o.size ?? 9.5;
  const w = o.w ?? Math.max(24, K.measure(label, size) + 14);
  const h = o.h ?? 20;
  return {
    svg: [
      K.rect({ x, y, w, h, r: RAD.control, fill: o.fill ?? C.surfaceAlt, stroke: o.stroke ?? C.lineStrong, sw: 1 }),
      mixM(x + w / 2, y + h / 2, label, size, o.color ?? C.text, { anchor: 'middle' }),
    ].join(''),
    w,
  };
}

/** 开关 */
function toggle(x, y, o = {}) {
  const on = o.on ?? true;
  const color = o.color ?? C.accent;
  const w = 40;
  const h = 20;
  return [
    // 轨道：on = 荧光淡底 + 荧光描边；off = 画布底 + 中性灰描边（同一种画法，只换 token）
    K.rect({ x, y, w, h, r: RAD.control, fill: on ? hexA(color, 0.14) : '#080D0B', stroke: on ? hexA(color, 0.65) : C.lineStrong, sw: 1 }),
    // 方钮：on = 荧光实心（贴右）；off = 中性灰实心（贴左）
    K.rect({ x: on ? x + w - 16 : x + 4, y: y + 4, w: 12, h: 12, r: 1, fill: on ? color : C.textMuted }),
  ].join('');
}

/** 三档滑杆 */
function slider(x, y, w, o = {}) {
  const pos = o.pos ?? 0.5;
  const color = o.color ?? C.accent;
  const out = [];
  out.push(K.rect({ x, y: y + 7, w, h: 1, fill: C.lineStrong }));
  out.push(K.rect({ x, y: y + 7, w: w * pos, h: 1, fill: color }));
  [0, 0.5, 1].forEach((t) => {
    out.push(K.rect({ x: x + w * t - 1, y: y + 3, w: 2, h: 9, fill: t <= pos ? color : C.lineStrong }));
  });
  out.push(K.rect({ x: x + w * pos - 3, y: y, w: 6, h: 16, fill: color, r: 1 }));
  return out.join('');
}

/** 带行号槽的代码块 */
function codeBlock(x, y, lines, o = {}) {
  const size = o.size ?? 8.5;
  const lh = o.lh ?? 15;
  const out = [];
  const numW = o.numW ?? 26;
  lines.forEach((segs, i) => {
    const ly = y + i * lh;
    if (o.highlight === i) {
      out.push(K.rect({ x: x - 4, y: ly - 9, w: o.w ?? 300, h: lh, fill: hexA(o.accent ?? C.accent, 0.06) }));
    }
    out.push(mono(x + numW - 6, ly, String(i + 1), size - 0.5, C.textFaint, { anchor: 'end' }));
    let cx = x + numW + 4;
    for (const [t, col] of segs) {
      out.push(mono(cx, ly, t, size, col));
      cx += monoW(t, size);
    }
    if (o.cursor === i) {
      out.push(K.rect({ x: cx + 1, y: ly - size + 1, w: 5, h: size + 1, fill: o.accent ?? C.accent, opacity: 0.95 }));
    }
  });
  return out.join('');
}

/* ---------------------------------------------------------------------------
 * 3. 画板
 * ------------------------------------------------------------------------- */
const sh = K.createSheet({
  theme: { fonts: { display: F.mono, ui: F.ui, mono: F.mono } },
  bg: 'url(#boardBg)',
  defs: DEFS,
});

// 底纹：点阵 + 细网格 + 暗角（最先绘制 → 在最底层）
sh.raw(
  K.rect({ x: 0, y: 0, w: sh.width, h: 9000, fill: 'url(#dots)' }) +
  K.rect({ x: 0, y: 0, w: sh.width, h: 9000, fill: 'url(#grid)' }) +
  K.rect({ x: 0, y: 0, w: sh.width, h: 9000, fill: 'url(#vignette)' }),
  0
);

/* ---------------------------------------------------------------------------
 * 4. 页眉
 * ------------------------------------------------------------------------- */
function drawHeader() {
  const x0 = sh.pad;
  const right = sh.width - sh.pad;
  const top = sh.y;
  const p = [];

  p.push(mono(x0, top + 10, 'LINGPET / 灵伴  ·  VISUAL REDESIGN 2026  ·  DIRECTION D / 04', 11, C.accent, { ls: 3 }));
  p.push(mono(right, top + 10, 'board.mjs  ▸  board.png  ·  1600 × %BOARD_H%  ·  no canvas / no web-font', 9.5, C.textFaint, { anchor: 'end' }));

  // hero 标题：光标条 + 中文标题 + 块光标
  p.push(K.rect({ x: x0, y: top + 44, w: 9, h: 54, fill: C.accent }));
  p.push(ui(x0 + 26, top + 94, '终端脉动', 60, C.text, { weight: 700 }));
  const titleW = K.measure('终端脉动', 60);
  p.push(K.rect({ x: x0 + 26 + titleW + 18, y: top + 44, w: 9, h: 54, fill: C.accent, opacity: 0.28 }));
  p.push(mono(x0 + 26, top + 124, 'TERMINAL  PULSE', 12, C.textFaint, { ls: 9 }));

  // 一句话主张
  p.push(ui(x0, top + 160, '把桌宠做成一个可爱的 CLI 进程：状态胶囊就是 statusline，动作就是进度条与行内提示，', 16.5, C.text, { weight: 500 }));
  p.push(ui(x0, top + 186, '会话跟随就是一个常驻的 agent 标签页 —— 不假装消费级 App，把陪伴塞进开发者待了 10 小时的地方。', 16.5, C.textMuted, { weight: 400 }));

  // 右侧终端小卡
  const tx = 1036, ty = top + 28, tw = 500, th = 122;
  const t = [];
  t.push(K.rect({ x: 0, y: 0, w: tw, h: th, r: RAD.panel, fill: '#0A100E', stroke: C.lineStrong, sw: 1 }));
  t.push(K.rect({ x: 0, y: 0, w: tw, h: 22, r: RAD.panel, fill: C.surfaceAlt }));
  t.push(K.line(0, 22, tw, 22, { stroke: C.line }));
  t.push(monoM(12, 11, 'bash — lingpet', 9, C.textMuted));
  t.push(monoM(tw - 12, 11, '—  □  ✕', 8.5, C.textFaint, { anchor: 'end' }));
  t.push(mono(14, 44, '$', 10, C.accent));
  t.push(mono(28, 44, 'lingpet init --direction=terminal-pulse', 10, C.text));
  t.push(mono(14, 62, '>', 10, C.accent));
  t.push(mono(28, 62, 'statusline / progress / agent-tab', 10, C.textMuted));
  t.push(mono(14, 80, '[ok]', 10, C.accent));
  t.push(mono(44, 80, '0 error   3 sessions followed', 10, C.textMuted));
  t.push(mono(14, 98, '[warn]', 10, C.state.approval));
  t.push(mono(58, 98, 'hacker-green budget: 7.4% of canvas', 10, C.textMuted));
  t.push(mono(14, 116, '$', 10, C.accent));
  t.push(K.rect({ x: 26, y: 108, w: 6, h: 11, fill: C.accent }));
  p.push(nested(tx, ty, tw, th, t.join('')));

  // 色板：5 枚 chips，与终端卡同宽（500），hex + 用途
  const pal = [
    ['#070A09', 'BG'], ['#0C1210', 'SURFACE'], ['#54F0A6', 'ACCENT'],
    ['#E8A33B', 'APPROVAL'], ['#4FD8E8', 'DONE'],
  ];
  const palW = 96, palGap = 5, palX = 1036, palY = ty + th + 44;
  p.push(mono(palX, palY - 14, 'PALETTE  ▸  荧光占比 7.4% · 其余全为中性灰阶', 8, C.textFaint, { ls: 0.4 }));
  pal.forEach(([hex, name], i) => {
    const x = palX + i * (palW + palGap);
    p.push(K.rect({ x, y: palY, w: palW, h: 30, r: RAD.control, fill: hex, stroke: hexA('#ffffff', 0.16), sw: 1 }));
    p.push(mono(x, palY + 42, hex.toUpperCase(), 8, C.textMuted));
    p.push(mono(x + palW, palY + 42, name, 7.5, C.textFaint, { anchor: 'end' }));
  });

  // 关键词
  const kws = ['终端', '等宽', '状态行', '低饱和', '克制的荧光', '行号即信息'];
  let kx = x0;
  kws.forEach((k) => {
    const w = K.measure(`[${k}]`, 11) + 18;
    p.push(K.rect({ x: kx, y: top + 208, w, h: 24, r: RAD.pill, fill: 'none', stroke: C.lineStrong, sw: 1 }));
    p.push(monoM(kx + 9, top + 220, `[${k}]`, 11, C.textMuted));
    kx += w + 8;
  });

  // 状态行（把产品语言直接放在页眉）
  const sy = top + 250;
  p.push(K.line(x0, sy, right, sy, { stroke: C.line }));
  p.push(monoM(x0, sy + 15, '~/lingpet/design/proposals/04-terminal-pulse', 9.5, C.textMuted));
  p.push(monoM(x0 + 380, sy + 15, '⎇ direction/D', 9.5, C.textFaint));
  p.push(monoM(x0 + 484, sy + 15, '✓ 4 files', 9.5, C.accent));
  p.push(monoM(x0 + 560, sy + 15, '▸ tokens.json synced', 9.5, C.textFaint));
  const seg = segbar(x0 + 780, sy + 9, { n: 10, filled: 6, w: 8, gap: 3, h: 11, color: C.accent });
  p.push(seg.svg);
  p.push(monoM(x0 + 780 + seg.w + 10, sy + 15, '62%  ·  contrast 4.5:1+', 9, C.textFaint));
  p.push(monoM(right, sy + 15, '2026-10-27  10:24:08', 9.5, C.textFaint, { anchor: 'end' }));

  return p.join('\n');
}

const HEADER_SVG = drawHeader();
sh.raw('', 296);
sh.gap(22);

/* ---------------------------------------------------------------------------
 * 5. 01 桌面浮层
 * ------------------------------------------------------------------------- */
function section01() {
  const ly = sh.y - 14;
  sh.section({
    index: 1,
    title: '桌面浮层',
    note: '透明窗口 / 胶囊即 statusline / 动作即进度与行内提示',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];

  // 场景外框（承担投影；贴图与控件本身不带矩形底）
  parts.push(K.rect({ x: 64, y: top, w: 1472, h: 480, r: RAD.window, fill: '#070C0B', stroke: C.line, sw: 1, filter: 'url(#soft)' }));

  // ---------- 桌面场景（局部坐标 1472 × 480） ----------
  const s = [];
  const SW = 1472, SH = 480;
  s.push(K.rect({ x: 0, y: 0, w: SW, h: SH, fill: 'url(#wall)' }));
  s.push(ellipse({ cx: 470, cy: 190, rx: 640, ry: 380, fill: 'url(#wallGlow1)' }));
  s.push(ellipse({ cx: 1180, cy: 430, rx: 520, ry: 300, fill: 'url(#wallGlow2)' }));
  s.push(K.rect({ x: 0, y: 0, w: SW, h: SH, fill: 'url(#dots)' }));
  s.push(K.rect({ x: 0, y: 0, w: SW, h: SH, fill: 'url(#scan)', opacity: 0.5 }));

  // 背景的模糊窗口（桌面暗示）
  s.push(K.el('g', { opacity: 0.45, filter: 'url(#blur6)' },
    K.rect({ x: 1094, y: 18, w: 350, h: 196, r: RAD.panel, fill: '#101B18', stroke: '#22322C', sw: 1 }) +
    K.rect({ x: 1112, y: 40, w: 180, h: 7, fill: '#2B3E36' }) +
    K.rect({ x: 1112, y: 56, w: 250, h: 5, fill: '#22322C' }) +
    K.rect({ x: 1112, y: 70, w: 214, h: 5, fill: '#22322C' })
  ));
  s.push(K.el('g', { opacity: 0.3, filter: 'url(#blur6)' },
    K.rect({ x: 26, y: 356, w: 430, h: 130, r: RAD.panel, fill: '#0E1916' }) +
    K.rect({ x: 44, y: 378, w: 150, h: 6, fill: '#243831' })
  ));

  // ---------- 编辑器窗口 ----------
  const ideX = 44, ideY = 36, ideW = 620, ideH = 284;
  s.push(K.rect({ x: ideX, y: ideY, w: ideW, h: ideH, r: RAD.window, fill: '#0A100E', stroke: C.lineStrong, sw: 1 }));
  s.push(K.rect({ x: ideX, y: ideY, w: ideW, h: 24, r: RAD.window, fill: C.surfaceAlt }));
  s.push(K.line(ideX, ideY + 24, ideX + ideW, ideY + 24, { stroke: C.line }));
  s.push(monoM(ideX + 11, ideY + 12, 'main.ts — lingpet / desktop', 8.5, C.textMuted));
  s.push(monoM(ideX + ideW - 12, ideY + 12, '—  □  ✕', 8, C.textFaint, { anchor: 'end' }));
  s.push(K.rect({ x: ideX, y: ideY + 25, w: ideW, h: 21, fill: '#0B1210' }));
  const tabs = [['main.ts', true], ['pet.ts', false], ['theme.css', false]];
  let tabx = ideX;
  tabs.forEach(([name, on]) => {
    const tw2 = K.measure(name, 8.5) + 22;
    if (on) s.push(K.rect({ x: tabx, y: ideY + 25, w: tw2, h: 21, fill: '#0A100E' }));
    if (on) s.push(K.rect({ x: tabx, y: ideY + 25, w: tw2, h: 1.5, fill: C.accent, opacity: 0.75 }));
    s.push(monoM(tabx + 11, ideY + 36, name, 8.5, on ? C.text : C.textFaint));
    tabx += tw2;
  });
  const kw = '#B49CFF', str = '#86E8B8', fn = '#7FD4FF', num = '#E8D44D', tx = '#AEBDB5', com = C.textFaint;
  const code = [
    [['import ', kw], ['{ createHash }', tx], [' from ', tx], ["'node:crypto'", str], [';', tx]],
    [['import ', kw], ['{ ipcMain }', tx], [' from ', tx], ["'electron'", str], [';', tx]],
    [],
    [['// 会话状态 → 胶囊文案', com]],
    [['const ', kw], ['STATE_TTL ', tx], ['= ', tx], ['240', num], [';', tx]],
    [['export function ', kw], ['fingerprint', fn], ['(pkt) ', tx], ['{', tx]],
    [['  const ', kw], ['h ', tx], ['= ', tx], ['createHash', fn], ["('sha256')", str], [';', tx]],
    [['  h.', tx], ['update', fn], ['(pkt.state + pkt.at)', tx], [';', tx]],
    [['  return ', kw], ['h.', tx], ['digest', fn], ["('hex').", str], ['slice', fn], ['(0, 8);', tx]],
    [['}', tx]],
    [],
    [['ipcMain.', tx], ['on', fn], ["('pet:state', (_, pkt) => {", str]],
    [['  renderCapsule', fn], ['(pkt.state);', tx]],
  ];
  s.push(codeBlock(ideX + 8, ideY + 76, code, { highlight: 8, cursor: 8, w: ideW - 70, size: 8.5, lh: 15 }));
  // minimap
  s.push(K.rect({ x: ideX + ideW - 54, y: ideY + 30, w: 40, h: 210, fill: '#080D0C' }));
  for (let i = 0; i < 22; i++) {
    const ww = [26, 18, 30, 12, 22, 34, 16][i % 7];
    s.push(K.rect({ x: ideX + ideW - 48, y: ideY + 36 + i * 8.6, w: ww, h: 2.4, fill: i === 11 ? C.accent : hexA('#ffffff', 0.10) }));
  }
  // 编辑器状态行
  const esy = ideY + ideH - 18;
  s.push(K.rect({ x: ideX, y: esy, w: ideW, h: 18, fill: '#0D1512' }));
  s.push(K.line(ideX, esy, ideX + ideW, esy, { stroke: C.line }));
  s.push(monoM(ideX + 10, esy + 9, '⎇ main*', 7.5, C.accent));
  s.push(monoM(ideX + 78, esy + 9, 'Ln 9, Col 47', 7.5, C.textFaint));
  s.push(monoM(ideX + ideW - 10, esy + 9, 'UTF-8   TypeScript   Ctrl+K', 7.5, C.textFaint, { anchor: 'end' }));

  // ---------- 终端窗口（状态时间线） ----------
  const trX = 700, trY = 240, trW = 300, trH = 168;
  s.push(K.rect({ x: trX, y: trY, w: trW, h: trH, r: RAD.window, fill: '#080D0C', stroke: C.lineStrong, sw: 1 }));
  s.push(K.rect({ x: trX, y: trY, w: trW, h: 20, r: RAD.window, fill: C.surfaceAlt }));
  s.push(K.line(trX, trY + 20, trX + trW, trY + 20, { stroke: C.line }));
  s.push(monoM(trX + 10, trY + 10, 'zsh — lingpet follow', 8, C.textMuted));
  s.push(monoM(trX + trW - 10, trY + 10, '—  □  ✕', 7.5, C.textFaint, { anchor: 'end' }));
  s.push(mono(trX + 12, trY + 40, '$ lingpet follow --session=cursor-task', 8, C.textMuted));
  const tl = [
    ['21:04:11', 'thinking', '读取 desktop/pet.ts', C.state.thinking],
    ['21:04:19', 'working', 'pnpm build --scope=desktop', C.state.working],
    ['21:04:29', 'working', '', C.state.working],
    ['21:04:38', 'done', '✓ 3 处改动 · 2 个文件', C.state.done],
  ];
  tl.forEach(([ts, st, msg, col], i) => {
    const yy = trY + 58 + i * 16;
    s.push(mono(trX + 12, yy, ts, 7.5, C.textFaint));
    s.push(mono(trX + 64, yy, `[${st}]`, 7.5, col, { weight: 600 }));
    if (i === 2) {
      const sb = segbar(trX + 118, yy - 5, { n: 10, filled: 6, w: 9, gap: 2, h: 6, color: col });
      s.push(sb.svg);
      s.push(mono(trX + 118 + sb.w + 8, yy, '62%', 7.5, C.textMuted));
    } else {
      s.push(mono(trX + 118, yy, msg, 7.5, C.textMuted));
    }
  });
  s.push(mono(trX + 12, trY + 138, '$', 7.5, C.accent));
  s.push(K.rect({ x: trX + 24, y: trY + 130, w: 5, h: 9, fill: C.accent }));

  // ---------- 互动气泡（尾巴指向角色） ----------
  const bx = 810, by = 118, bw = 292, bh = 88;
  s.push(pathEl(`M ${bx + 2} ${by} H ${bx + bw - 2} V ${by + bh - 2} H ${bx + 2} Z`, { fill: '#101815', stroke: C.lineStrong, sw: 1, linejoin: 'miter' }));
  // 尾巴：像素语言 → 8px 两级阶梯（先横 8 再竖 8），不用斜线三角
  const tBase = by + 60;
  s.push(pathEl(`M ${bx + bw} ${tBase} H ${bx + bw + 8} V ${tBase + 8} H ${bx + bw + 16} V ${tBase + 16} H ${bx + bw} Z`, { fill: '#101815' }));
  s.push(pathEl(`M ${bx + bw} ${tBase} H ${bx + bw + 8} V ${tBase + 8} H ${bx + bw + 16} V ${tBase + 16}`, { stroke: C.lineStrong, sw: 1, linecap: 'butt', linejoin: 'miter' }));
  s.push(ui(bx + 15, by + 30, '改完了，要看看吗？', 14.5, C.text, { weight: 500 }));
  s.push(mono(bx + 15, by + 52, '3 处改动 · 2 个文件 · cursor-task', 8.5, C.textMuted));
  const kc = keycap(bx + 15, by + 60, 'esc 关闭', { size: 8.5, h: 17 });
  s.push(kc.svg);
  s.push(mono(bx + 15 + kc.w + 8, by + 72, '或点击气泡', 8.5, C.textFaint));

  // ---------- 悬浮操作条（hover 才出现） ----------
  const tbX = 1000, tbY = 30, tbW = 360, tbH = 30;
  s.push(K.rect({ x: tbX, y: tbY, w: tbW, h: tbH, r: RAD.panel, fill: hexA('#0B1210', 0.94), stroke: C.lineStrong, sw: 1 }));
  const tbBtns = ['⚙ 工作台', '⇄ 换角色', '− 隐藏'];
  tbBtns.forEach((label, i) => {
    const bx2 = tbX + (tbW / 3) * i;
    s.push(mixM(bx2 + tbW / 6, tbY + tbH / 2, label, 10.5, i === 2 ? C.textMuted : C.text, { anchor: 'middle' }));
    if (i > 0) s.push(K.line(bx2, tbY + 6, bx2, tbY + tbH - 6, { stroke: C.line }));
  });
  s.push(monoM(tbX - 10, tbY + tbH / 2, 'hover', 8, C.textFaint, { anchor: 'end' }));
  // 鼠标指针
  s.push(pathEl('M 1368 52 L 1368 72 L 1373 67 L 1377 76 L 1381 74 L 1377 65 L 1383 64 Z', { fill: C.text, stroke: '#0A0F0D', sw: 1 }));

  // ---------- 状态胶囊 ----------
  s.push(statusChip(1004, 78, {
    state: 'done', label: '完成', icon: '✓', note: 'cursor-task · 3 处改动',
    color: C.state.done, w: 356, h: 32, meta: '00:42',
  }));

  // ---------- 桌宠 ----------
  // 角色可视高度 300（spec 300~340）；deepseek-done 原图 256×341，内容 bbox y22..277，
  // 底部有 63px 透明 padding —— 按内容高反推显示尺寸，接触阴影才贴得住脚。
  const petArtH = 300;
  const petScale = petArtH / 256;
  const petH = Math.round(341 * petScale);
  const petW = Math.round(256 * petScale);
  const petBottom = SH - 36 - 12;
  const petY = Math.round(petBottom - 277 * petScale);
  const petX = 1128;
  s.push(ellipse({ cx: petX + petW / 2, cy: petY + 149.5 * petScale, rx: 216, ry: 218, fill: 'url(#petGlow)' }));
  s.push(petSprite('deepseek-done', petX, petY, petW, petH));
  s.push(ellipse({ cx: petX + petW / 2, cy: petBottom + 6, rx: 100, ry: 11, fill: '#000000', opacity: 0.62, filter: 'url(#blur2)' }));
  s.push(ellipse({ cx: petX + petW / 2, cy: petBottom + 4, rx: 76, ry: 6, fill: C.state.done, opacity: 0.16, filter: 'url(#blur6)' }));

  // ---------- 任务栏暗示 ----------
  const tby = SH - 36;
  s.push(K.rect({ x: 0, y: tby, w: SW, h: 36, fill: '#060A09', opacity: 0.94 }));
  s.push(K.line(0, tby, SW, tby, { stroke: C.line }));
  s.push(K.rect({ x: 12, y: tby + 7, w: 22, h: 22, r: RAD.control, fill: C.surfaceAlt, stroke: C.lineStrong, sw: 1 }));
  s.push(symM(23, tby + 18, '▚', 10, C.accent, { anchor: 'middle' }));
  ['▣', '▤', '▥'].forEach((g, i) => {
    s.push(K.rect({ x: 44 + i * 30, y: tby + 7, w: 22, h: 22, r: RAD.control, fill: hexA('#ffffff', 0.03) }));
    s.push(symM(55 + i * 30, tby + 18, g, 10, C.textFaint, { anchor: 'middle' }));
  });
  s.push(K.rect({ x: 138, y: tby + 6, w: 24, h: 24, r: RAD.control, fill: hexA(C.accent, 0.10), stroke: hexA(C.accent, 0.5), sw: 1 }));
  s.push(symM(150, tby + 18, '◐', 11, C.accent, { anchor: 'middle' }));
  s.push(monoM(170, tby + 18, '灵伴 · agent', 8, C.textMuted));
  s.push(monoM(SW - 14, tby + 18, '10:24:08   2026-10-27', 8.5, C.textFaint, { anchor: 'end' }));

  // ---------- 透明窗口契约说明卡 ----------
  const cx0 = 44, cy0 = 328, cw = 620, ch = 116;
  s.push(K.rect({ x: cx0, y: cy0, w: cw, h: ch, r: RAD.panel, fill: hexA('#080D0C', 0.9), stroke: C.line, sw: 1 }));
  s.push(monoM(cx0 + 14, cy0 + 18, 'TRANSPARENT WINDOW / 透明窗口契约', 8.5, C.accent, { weight: 600 }));
  s.push(monoM(cx0 + 14, cy0 + 40, '▸ 只有角色与控件有像素，窗口本身没有底色', 9, C.textMuted));
  s.push(monoM(cx0 + 14, cy0 + 58, '▸ 512 × 512 · 辉光半径 ≤ 48px，贴着角色走', 9, C.textMuted));
  s.push(monoM(cx0 + 14, cy0 + 76, '▸ 胶囊 / 气泡 / hover 条是仅有的三块 UI 面', 9, C.textMuted));
  s.push(monoM(cx0 + 14, cy0 + 94, '▸ 背景虚化窗口与任务栏属于宿主桌面，不参与透明层', 9, C.textFaint));
  // 小图示：三层窗口
  const dgx = cx0 + cw - 118, dgy = cy0 + 20;
  s.push(K.rect({ x: dgx, y: dgy, w: 96, h: 76, r: 1, fill: '#060A08', stroke: C.lineStrong, sw: 1, dash: '3 4' }));
  s.push(monoM(dgx + 48, dgy - 6, '512²', 7, C.textFaint, { anchor: 'middle' }));
  s.push(K.rect({ x: dgx + 28, y: dgy + 18, w: 40, h: 46, r: 1, fill: hexA(C.state.done, 0.16), stroke: hexA(C.state.done, 0.55), sw: 1 }));
  s.push(monoM(dgx + 48, dgy + 44, 'PET', 7.5, C.state.done, { anchor: 'middle' }));
  s.push(K.rect({ x: dgx + 71, y: dgy + 10, w: 18, h: 6, fill: hexA(C.state.done, 0.2), stroke: hexA(C.state.done, 0.5), sw: 1 }));
  s.push(K.rect({ x: dgx + 71, y: dgy + 20, w: 20, h: 6, fill: hexA(C.state.done, 0.2), stroke: hexA(C.state.done, 0.5), sw: 1 }));

  s.push(K.rect({ x: 0, y: 0, w: SW, h: SH, fill: 'url(#sceneShade)' }));
  parts.push(nested(64, top, 1472, 480, s.join('\n')));

  // ---------- 三个状态小样 ----------
  const cardY = top + 498;
  const cardW = 480, cardH = 244;
  const cardX = [64, 560, 1056];

  function sampleCard(x, y, cfg) {
    const o = [];
    o.push(K.rect({ x, y, w: cardW, h: cardH, r: RAD.panel, fill: C.surface, stroke: C.line, sw: 1 }));
    o.push(K.rect({ x, y, w: cardW, h: 2, fill: cfg.color }));
    // 头部
    o.push(monoM(x + 16, y + 24, `[${cfg.state}]`, 10, cfg.color, { weight: 600 }));
    o.push(uiM(x + 16 + K.measure(`[${cfg.state}]`, 10) + 10, y + 24, cfg.label, 13.5, C.text, { weight: 600 }));
    o.push(monoM(x + cardW - 16, y + 24, cfg.idx, 8.5, C.textFaint, { anchor: 'end' }));
    o.push(K.line(x + 16, y + 36, x + cardW - 16, y + 36, { stroke: C.line }));
    // 角色（136 高，给底部说明行留位）
    const ph = 136;
    const pw = Math.round(ph * (256 / 341));
    o.push(ellipse({ cx: x + 24 + pw / 2, cy: y + 66 + ph / 2, rx: 74, ry: 80, fill: hexA(cfg.color, 0.07) }));
    o.push(K.sprite({ name: cfg.sprite, x: x + 24, y: y + 66, w: pw, h: ph }));
    o.push(ellipse({ cx: x + 24 + pw / 2, cy: y + 66 + ph + 2, rx: 34, ry: 4.5, fill: '#000000', opacity: 0.5, filter: 'url(#blur2)' }));
    // 右栏
    const rx2 = x + 24 + pw + 20;
    cfg.rows(o, rx2, y);
    // 底部：这一态的可感知差异（颜色 / 形状 / 动效 / 附属信息 至少两维）
    o.push(K.line(x + 16, y + cardH - 38, x + cardW - 16, y + cardH - 38, { stroke: C.line }));
    o.push(monoM(x + 16, y + cardH - 20, cfg.rule, 8, C.textFaint));
    return o.join('');
  }

  parts.push(sampleCard(cardX[0], cardY, {
    state: 'thinking', label: '思考中', color: C.state.thinking, sprite: 'deepseek-thinking', idx: '01 / 03',
    rule: '蓝 + ASCII 转轮 + 行内提示 —— 至少两个维度在变',
    rows: (o, rx2, y) => {
      o.push(ui(rx2, y + 68, '正在读 desktop/pet.ts', 11.5, C.textMuted));
      o.push(mono(rx2, y + 94, '[-]  分析依赖…', 10, C.state.thinking));
      o.push(K.rect({ x: rx2, y: y + 108, w: 220, h: 1, fill: C.line }));
      [0, 1, 2].forEach((i) => o.push(K.circle({ cx: rx2 + 6 + i * 13, cy: y + 124, r: 3, fill: C.state.thinking, opacity: 1 - i * 0.3 })));
      o.push(monoM(rx2 + 46, y + 124, '转轮 1.2s · 呼吸点错相位', 8, C.textFaint));
      o.push(monoM(rx2, y + 148, '00:04 已用 · deepseek-v3', 8.5, C.textMuted));
      o.push(monoM(rx2, y + 164, '会话 cursor-task · 回合 3', 8.5, C.textFaint));
    },
  }));

  parts.push(sampleCard(cardX[1], cardY, {
    state: 'approval', label: '等待确认', color: C.state.approval, sprite: 'deepseek-approval', idx: '02 / 03',
    rule: '琥珀 + 虚线流动 1s + ⏎ / esc 键盘出口',
    rows: (o, rx2, y) => {
      o.push(ui(rx2, y + 68, '需要你确认一下', 12.5, C.text, { weight: 500 }));
      o.push(K.rect({ x: rx2, y: y + 80, w: 302, h: 22, r: RAD.control, fill: hexA(C.state.approval, 0.08), stroke: hexA(C.state.approval, 0.4), sw: 1, dash: '4 3' }));
      o.push(monoM(rx2 + 8, y + 91, '$ pnpm build --scope=desktop', 8.5, C.state.approval));
      const k1 = keycap(rx2, y + 112, '⏎ 允许', { fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.6), color: C.accent, size: 9, h: 22, w: 84 });
      const k2 = keycap(rx2 + 92, y + 112, 'esc 拒绝', { size: 9, h: 22, w: 84 });
      o.push(k1.svg, k2.svg);
      o.push(monoM(rx2, y + 152, '已等待 00:12 · 超时 60s 自动收起', 8.5, C.textMuted));
      o.push(monoM(rx2, y + 168, '会话 cursor-task · 权限 write', 8.5, C.textFaint));
    },
  }));

  parts.push(sampleCard(cardX[2], cardY, {
    state: 'error', label: '错误', color: C.state.error, sprite: 'deepseek-error', idx: '03 / 03',
    rule: '红 + 反色行 / 40ms 抖动 → 直接摊开日志',
    rows: (o, rx2, y) => {
      o.push(ui(rx2, y + 68, '卡住了，看看日志？', 12.5, C.text, { weight: 500 }));
      o.push(K.rect({ x: rx2, y: y + 80, w: 302, h: 40, r: RAD.control, fill: hexA(C.state.error, 0.07), stroke: hexA(C.state.error, 0.35), sw: 1 }));
      o.push(monoM(rx2 + 8, y + 95, '✕ pnpm test — exit 1', 8.5, C.state.error));
      o.push(monoM(rx2 + 8, y + 109, 'at pet.ts:88 · TypeError', 8.5, C.textMuted));
      const k = keycap(rx2, y + 126, 'Ctrl+L 打开日志', { size: 8.5, h: 20, w: 104 });
      const k2 = keycap(rx2 + 112, y + 126, '重试', { size: 8.5, h: 20, w: 56, color: C.textMuted });
      o.push(k.svg, k2.svg);
      o.push(monoM(rx2, y + 166, '可恢复 · 会话保留 · 上次成功 21:04', 8.5, C.textFaint));
    },
  }));

  sh.raw(parts.join('\n'), 498 + 18 + 244);
  sh.gap(34);
}

section01();

/* ---------------------------------------------------------------------------
 * 6. 02 快捷控制
 * ------------------------------------------------------------------------- */
function section02() {
  const ly = sh.y - 14;
  sh.section({
    index: 2,
    title: '快捷控制',
    note: '右键即出现 · 340px 里完成 90% 的日常操作',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];

  // ---------- 右键弹层 340 × 492 ----------
  const mx = 64, mw = 340, mh = 492;
  const m = [];
  m.push(K.rect({ x: 0, y: 0, w: mw, h: mh, r: RAD.panel, fill: '#0B1210', stroke: C.lineStrong, sw: 1 }));
  m.push(K.rect({ x: 0, y: 0, w: mw, h: 2, fill: C.accent }));
  m.push(K.rect({ x: 14, y: 14, w: 24, h: 24, r: RAD.control, fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.5), sw: 1 }));
  m.push(symM(26, 26, '◐', 11, C.accent, { anchor: 'middle' }));
  m.push(uiM(48, 22, '灵伴 · 快捷控制', 12.5, C.text, { weight: 600 }));
  m.push(monoM(48, 36, '4 pets  ·  3 engines  ·  cursor-task', 7.5, C.textFaint));
  m.push(symM(mw - 20, 25, '✕', 10, C.textFaint, { anchor: 'middle' }));
  m.push(K.line(12, 48, mw - 12, 48, { stroke: C.line }));

  const pets = [
    ['DSH 桌宠', 'Claude · 像素 · 已显示', 'claude-idle', 'current'],
    ['Cursor 桌宠', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle', 'shown'],
    ['Codex 桌宠', 'Claude · 像素 · 已显示', 'claude-idle', 'shown'],
    ['固定会话', '鲸鱼娘 · 像素 · 隐藏', 'deepseek-idle', 'hidden'],
  ];
  pets.forEach(([name, meta, spr, st], i) => {
    const ry = 54 + i * 52;
    if (st === 'current') {
      m.push(K.rect({ x: 8, y: ry, w: mw - 16, h: 48, r: RAD.control, fill: hexA(C.accent, 0.07), stroke: hexA(C.accent, 0.3), sw: 1 }));
      m.push(K.rect({ x: 8, y: ry + 6, w: 2, h: 36, fill: C.accent }));
    }
    m.push(K.sprite({ name: spr, x: 20, y: ry + 8, w: 32, h: 32, opacity: st === 'hidden' ? 0.42 : 1 }));
    m.push(uiM(62, ry + 18, name, 12, st === 'current' ? C.text : st === 'hidden' ? C.textFaint : C.textMuted, { weight: st === 'current' ? 600 : 400 }));
    m.push(monoM(62, ry + 34, meta, 7.5, C.textFaint));
    const tag = st === 'current' ? '▮ 当前' : st === 'hidden' ? '○ 隐藏' : '● 显示';
    const tagCol = st === 'current' ? C.accent : st === 'hidden' ? C.textFaint : hexA(C.accent, 0.7);
    m.push(monoM(mw - 20, ry + 24, tag, 8, tagCol, { anchor: 'end' }));
  });
  // 滚动暗示：2px 轨道 + 滑块
  m.push(K.rect({ x: mw - 5, y: 56, w: 2, h: 200, fill: hexA('#ffffff', 0.04) }));
  m.push(K.rect({ x: mw - 5, y: 58, w: 2, h: 74, fill: C.lineStrong }));
  m.push(K.line(12, 272, mw - 12, 272, { stroke: C.line }));

  // 显示桌宠
  m.push(uiM(20, 294, '显示桌宠', 12, C.text));
  m.push(monoM(mw - 62, 294, 'Ctrl+H', 7.5, C.textFaint, { anchor: 'end' }));
  m.push(toggle(mw - 52, 285, { on: true }));
  // 大小
  m.push(uiM(20, 326, '大小', 12, C.text));
  m.push(monoM(mw - 20, 326, '中 · 192px', 8.5, C.accent, { anchor: 'end' }));
  m.push(slider(24, 338, mw - 48, { pos: 0.5 }));
  [['小', 0], ['中', 0.5], ['大', 1]].forEach(([t, p]) => {
    m.push(monoM(24 + (mw - 48) * p, 364, t, 7.5, p === 0.5 ? C.accent : C.textFaint, { anchor: 'middle' }));
  });
  // 会话跟随
  m.push(uiM(20, 392, '会话跟随', 12, C.text));
  m.push(monoM(20, 406, 'cursor-task · 跟随中', 7.5, C.textFaint));
  m.push(toggle(mw - 52, 383, { on: true }));
  m.push(K.line(12, 420, mw - 12, 420, { stroke: C.line }));

  // 进入工作台
  m.push(K.rect({ x: 12, y: 432, w: mw - 24, h: 36, r: RAD.control, fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.45), sw: 1 }));
  m.push(uiM(28, 450, '进入工作台', 11.5, C.accent, { weight: 600 }));
  m.push(monoM(mw - 28, 450, '⏎', 9, C.accent, { anchor: 'end' }));
  m.push(monoM(mw / 2, 480, '↑↓ 切换  ·  ⏎ 确认  ·  esc 关闭', 7.5, C.textFaint, { anchor: 'middle' }));
  parts.push(nested(mx, top, mw, mh, m.join('')));

  // ---------- 拖拽控制条小样 ----------
  const dx = 440, dw = 520, dh = 176;
  parts.push(K.rect({ x: dx, y: top, w: dw, h: dh, r: RAD.panel, fill: C.surface, stroke: C.line, sw: 1 }));
  parts.push(mono(dx + 16, top + 24, 'CONTROL BAR / 拖拽控制条', 8.5, C.accent, { weight: 600 }));
  parts.push(mono(dx + dw - 16, top + 24, 'hover 才浮出 · 不常驻', 7.5, C.textFaint, { anchor: 'end' }));
  // 逃逸热区
  parts.push(K.rect({ x: dx + 34, y: top + 44, w: 452, h: 88, r: RAD.control, fill: 'none', stroke: C.lineStrong, sw: 1, dash: '4 5' }));
  parts.push(monoM(dx + 42, top + 40, '8px 热区', 7, C.textFaint));
  // 控制条本体
  parts.push(K.rect({ x: dx + 44, y: top + 62, w: 432, h: 44, r: RAD.panel, fill: hexA('#0B1210', 0.97), stroke: C.lineStrong, sw: 1 }));
  parts.push(mixM(dx + 60, top + 84, '⠿', 13, C.textFaint));
  parts.push(monoM(dx + 84, top + 84, '灵伴 · agent', 9.5, C.text));
  parts.push(K.line(dx + 180, top + 70, dx + 180, top + 98, { stroke: C.line }));
  parts.push(mixM(dx + 200, top + 84, '⇄ 换角色', 9.5, C.textMuted));
  parts.push(K.line(dx + 286, top + 70, dx + 286, top + 98, { stroke: C.line }));
  parts.push(mixM(dx + 306, top + 84, '− 隐藏', 9.5, C.textMuted));
  parts.push(K.line(dx + 380, top + 70, dx + 380, top + 98, { stroke: C.line }));
  parts.push(mixM(dx + 402, top + 84, '⚙', 10, C.textMuted));
  parts.push(monoM(dx + 16, top + 160, '拖动 ⠿ 移动 · 双击进入工作台 · 松手后 2s 自动淡出', 7.5, C.textFaint));

  // ---------- 输入出口 ----------
  const gx = 440, gh = 176, gy = top + 196;
  parts.push(K.rect({ x: gx, y: gy, w: dw, h: gh, r: RAD.panel, fill: C.surface, stroke: C.line, sw: 1 }));
  parts.push(mono(gx + 16, gy + 24, 'INPUT / 全部可用键盘到达', 8.5, C.accent, { weight: 600 }));
  const gestures = [['右键', '快捷控制'], ['拖动', '移动位置'], ['双击', '进入工作台'], ['esc', '关闭所有浮层']];
  gestures.forEach(([k, v], i) => {
    const cx2 = gx + 16 + (i % 2) * 248;
    const cy2 = gy + 44 + Math.floor(i / 2) * 52;
    const kc2 = keycap(cx2, cy2, k, { size: 8.5, h: 20, w: 60, color: C.text });
    parts.push(kc2.svg);
    parts.push(uiM(cx2 + 72, cy2 + 11, v, 10, C.textMuted));
  });
  parts.push(monoM(gx + 16, gy + 156, '鼠标 / 键盘 / 触控板三套出口，无隐藏手势', 7.5, C.textFaint));

  // ---------- 规格说明 ----------
  const sx = 976, sw2 = 560, shh = 372;
  parts.push(K.rect({ x: sx, y: top, w: sw2, h: shh, r: RAD.panel, fill: C.surface, stroke: C.line, sw: 1 }));
  parts.push(mono(sx + 16, top + 24, 'SPEC / 为什么是 340px', 8.5, C.accent, { weight: 600 }));
  const reasons = [
    ['340', '刚好放下「Claude · 像素 · 已显示」不折行，再宽就抢桌面'],
    ['≤ 520', '高度不超过半屏：底部「进入工作台」始终在视线里'],
    ['8.5px', '元信息全部等宽：引擎 / 会话 / 状态永不换行'],
    ['1px', '单层 1px 描边、无内阴影：暗色下边界照样清楚'],
  ];
  reasons.forEach(([n, t], i) => {
    const ry = top + 48 + i * 56;
    parts.push(mono(sx + 16, ry + 12, n, 13, C.accent, { weight: 600 }));
    parts.push(ui(sx + 76, ry + 12, t, 10.5, C.textMuted));
    if (i < reasons.length - 1) parts.push(K.line(sx + 16, ry + 28, sx + sw2 - 16, ry + 28, { stroke: hexA('#ffffff', 0.04) }));
  });
  parts.push(K.line(sx + 16, top + 288, sx + sw2 - 16, top + 288, { stroke: C.line }));
  const tk = ['bg #0B1210 · α 96%', 'border #31443C', 'radius 2', 'shadow 0 16px 48px'];
  let tkx = sx + 16;
  tk.forEach((t) => {
    const w = K.measure(t, 7.5) + 16;
    parts.push(K.rect({ x: tkx, y: top + 300, w, h: 22, r: RAD.control, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
    parts.push(monoM(tkx + 8, top + 311, t, 7.5, C.textMuted));
    tkx += w + 6;
  });
  // 8px 基线网格
  for (let i = 0; i < 12; i++) {
    const yy2 = top + 336 + i * 3;
    parts.push(K.rect({ x: sx + 420, y: yy2, w: i % 8 === 0 ? 14 : 7, h: 1, fill: i % 8 === 0 ? C.accent : C.lineStrong }));
  }
  parts.push(monoM(sx + 16, top + 352, '8px 基线：所有行高与间距都是 8 的倍数', 7.5, C.textFaint));

  sh.raw(parts.join('\n'), 492 + 16);
  sh.gap(44);
}

/* ---------------------------------------------------------------------------
 * 7. 03 工作台
 * ------------------------------------------------------------------------- */
function section03() {
  const ly = sh.y - 14;
  sh.section({
    index: 3,
    title: '工作台',
    note: '窗口 = 一个长会话 · 预览与设置共用同一份 CSS 变量',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];
  const WW = 1472, WH = 912;
  const w = [];
  // 窗口
  w.push(K.rect({ x: 0, y: 0, w: WW, h: WH, r: RAD.window, fill: '#0A100E', stroke: C.lineStrong, sw: 1 }));
  w.push(K.rect({ x: 0, y: 0, w: WW, h: 32, r: RAD.window, fill: C.surfaceAlt }));
  w.push(K.line(0, 32, WW, 32, { stroke: C.line }));
  w.push(monoM(14, 16, '灵伴 · 桌宠工作台', 8.5, C.textMuted));
  w.push(monoM(WW - 14, 16, '—   □   ✕', 8, C.textFaint, { anchor: 'end' }));
  // 左栏
  const sb = 316;
  w.push(K.rect({ x: 0, y: 32, w: sb, h: WH - 32, fill: '#0B1210' }));
  w.push(K.line(sb, 32, sb, WH, { stroke: C.line }));
  w.push(K.rect({ x: 20, y: 48, w: 30, h: 30, r: RAD.control, fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.45), sw: 1 }));
  w.push(uiM(35, 64, '灵', 14, C.accent, { anchor: 'middle', weight: 700 }));
  w.push(uiM(60, 60, '灵伴', 15, C.text, { weight: 700 }));
  w.push(monoM(60, 76, 'LINGPET  v0.9.4', 7.5, C.textFaint));
  // 导航
  const nav = [['▤ 桌宠工作台', true], ['◈ 桌宠市场', false]];
  nav.forEach(([label, on], i) => {
    const ny = 104 + i * 38;
    if (on) {
      w.push(K.rect({ x: 8, y: ny, w: sb - 16, h: 34, r: RAD.control, fill: hexA(C.accent, 0.08) }));
      w.push(K.rect({ x: 8, y: ny, w: 2, h: 34, fill: C.accent }));
    }
    w.push(mixM(28, ny + 17, label, 10.5, on ? C.text : C.textMuted));
  });
  // 我的桌宠
  w.push(monoM(20, 196, '我的桌宠', 7.5, C.textFaint));
  w.push(monoM(sb - 20, 196, '4', 7.5, C.textFaint, { anchor: 'end' }));
  const myPets = [
    ['DSH 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['Cursor 桌宠', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
    ['Codex 桌宠', 'Claude · 像素 · 已显示', 'claude-idle'],
    ['固定会话', '鲸鱼娘 · 像素 · 已显示', 'deepseek-idle'],
  ];
  myPets.forEach(([name, meta, spr], i) => {
    const py2 = 208 + i * 56;
    if (i === 1) w.push(K.rect({ x: 8, y: py2, w: sb - 16, h: 52, r: RAD.control, fill: hexA(C.accent, 0.06), stroke: hexA(C.accent, 0.24), sw: 1 }));
    w.push(K.sprite({ name: spr, x: 20, y: py2 + 10, w: 32, h: 32 }));
    w.push(uiM(62, py2 + 20, name, 11, i === 1 ? C.text : C.textMuted, { weight: i === 1 ? 600 : 400 }));
    w.push(monoM(62, py2 + 36, meta, 7, C.textFaint));
    w.push(monoM(sb - 24, py2 + 22, '✕', 10, i === 1 ? C.textMuted : C.textFaint, { anchor: 'end' }));
  });
  // 底部
  w.push(K.line(20, WH - 128, sb - 20, WH - 128, { stroke: C.line }));
  w.push(K.rect({ x: 20, y: WH - 112, w: sb - 40, h: 34, r: RAD.control, fill: C.surfaceAlt, stroke: C.lineStrong, sw: 1 }));
  w.push(monoM(20 + (sb - 40) / 2, WH - 95, '+ 新增桌宠', 9.5, C.textMuted, { anchor: 'middle' }));
  w.push(monoM(20, WH - 58, '拖动桌宠可移动位置', 7, C.textFaint));
  w.push(monoM(20, WH - 42, '右键桌宠可打开快捷控制', 7, C.textFaint));

  // 主区
  const mx0 = sb + 28;
  w.push(monoM(mx0, 58, '灵伴 / 桌宠管理', 8, C.textFaint));
  w.push(ui(mx0, 96, '桌宠工作台', 26, C.text, { weight: 700 }));
  w.push(ui(mx0, 120, '选择一位伙伴，设置它的外观和跟随方式。', 12, C.textMuted));
  // 连接胶囊
  const connW = 252, connX = WW - 28 - connW;
  w.push(K.rect({ x: connX, y: 46, w: connW, h: 30, r: RAD.control, fill: hexA(C.accent, 0.07), stroke: hexA(C.accent, 0.28), sw: 1 }));
  w.push(K.circle({ cx: connX + 14, cy: 61, r: 3, fill: C.accent }));
  w.push(monoM(connX + 24, 61, 'Codex / Cursor / DSH 已连接 · 3', 8.5, C.textMuted));

  // ---------- 实时预览 ----------
  const pvX = mx0, pvY = 140, pvW = 552, pvH = 560;
  w.push(K.rect({ x: pvX, y: pvY, w: pvW, h: pvH, r: RAD.card, fill: C.surface, stroke: C.line, sw: 1 }));
  w.push(uiM(pvX + 20, pvY + 24, '实时预览', 12.5, C.text, { weight: 600 }));
  w.push(monoM(pvX + pvW - 20, pvY + 24, '鲸鱼娘 / PIXEL 192', 7.5, C.textFaint, { anchor: 'end' }));
  w.push(K.line(pvX + 1, pvY + 40, pvX + pvW - 1, pvY + 40, { stroke: C.line }));
  // 舞台
  const stX = pvX + 16, stY = pvY + 52, stW = pvW - 32, stH = 308;
  w.push(K.rect({ x: stX, y: stY, w: stW, h: stH, r: RAD.control, fill: '#080D0C', stroke: C.line, sw: 1 }));
  w.push(K.rect({ x: stX, y: stY, w: stW, h: stH, fill: 'url(#dotsFine)' }));
  w.push(ellipse({ cx: stX + stW / 2, cy: stY + stH / 2, rx: stW * 0.34, ry: stH * 0.42, fill: 'url(#stageGlow)' }));
  const spH = 236, spW = Math.round(spH * (256 / 341));
  // working 原图内容 bbox y88..336：把脚踩在舞台底边上方 56px，别让角色浮在半空
  const spScale = spH / 341;
  w.push(petSprite('deepseek-working', stX + (stW - spW) / 2, stY + 308 - 56 - 336 * spScale, spW, spH));
  w.push(ellipse({ cx: stX + stW / 2, cy: stY + 308 - 52, rx: 92, ry: 10, fill: '#000000', opacity: 0.55, filter: 'url(#blur2)' }));
  w.push(ellipse({ cx: stX + stW / 2, cy: stY + 308 - 54, rx: 66, ry: 6, fill: hexA(C.state.working, 0.14), filter: 'url(#blur6)' }));
  w.push(statusChip(stX + 12, stY + stH - 44, { state: 'working', label: '执行工具', note: 'pnpm build', color: C.state.working, w: stW - 24, h: 30, seg: 6, segN: 8, meta: '02:14' }));
  // 会话行
  w.push(monoM(pvX + 20, pvY + 384, 'Cursor · 会话 cursor-task', 8.5, C.textMuted));
  w.push(monoM(pvX + pvW - 20, pvY + 384, '● 跟随中', 8, C.accent, { anchor: 'end' }));
  // 隐藏桌宠（破坏性动作：outline 处理，不占用「主行动」的荧光实心位）
  const hbW = Math.round(pvW * 0.62), hbX = pvX + 20, hbY = pvY + 400, hbH = 40;
  w.push(K.rect({ x: hbX, y: hbY, w: hbW, h: hbH, r: RAD.control, fill: C.surfaceAlt, stroke: hexA(C.accent, 0.55), sw: 1 }));
  w.push(uiM(hbX + hbW / 2 - 20, hbY + hbH / 2, '隐藏桌宠', 11.5, C.accent, { anchor: 'middle', weight: 600 }));
  const kch = keycap(hbX + hbW - 78, hbY + 11, 'Ctrl+H', { size: 7.5, h: 18 });
  w.push(kch.svg);
  w.push(monoM(hbX + hbW + 14, hbY + hbH / 2, '随时 Ctrl+H 唤回', 7, C.textFaint));
  // 形象缓存预热（加载态：真实后台任务，不是装饰）
  w.push(monoM(pvX + 20, pvY + 462, '⌛  预热形象缓存 2 / 3', 8, C.textFaint));
  w.push(K.rect({ x: pvX + 20, y: pvY + 472, w: 300, h: 6, r: 1, fill: hexA('#ffffff', 0.06) }));
  w.push(K.rect({ x: pvX + 20, y: pvY + 472, w: 200, h: 6, r: 1, fill: hexA(C.accent, 0.5) }));
  w.push(monoM(pvX + pvW - 20, pvY + 472, '8s', 7.5, C.textFaint, { anchor: 'end' }));
  w.push(monoM(pvX + 20, pvY + 500, '修改后自动保存 · 同步到 3 个会话', 7.5, C.textFaint));
  w.push(monoM(pvX + pvW - 20, pvY + 500, '本机 · 无云同步', 7.5, C.textFaint, { anchor: 'end' }));
  w.push(K.line(pvX + 1, pvY + 518, pvX + pvW - 1, pvY + 518, { stroke: C.line }));
  w.push(monoM(pvX + 20, pvY + 540, 'PREVIEW = 真实的 512×512 透明窗', 7, C.textFaint));
  w.push(monoM(pvX + pvW - 20, pvY + 540, '点击可拖拽', 7, C.textFaint, { anchor: 'end' }));

  // ---------- 设置面板 ----------
  const cfX = pvX + pvW + 20, cfW = WW - 28 - cfX, cfH = pvH;
  w.push(K.rect({ x: cfX, y: pvY, w: cfW, h: cfH, r: RAD.card, fill: C.surface, stroke: C.line, sw: 1 }));
  // tabs
  const tabs = [['外观与显示', true], ['会话跟随', false]];
  tabs.forEach(([label, on], i) => {
    const tw2 = (cfW - 2) / 2;
    const tx2 = cfX + 1 + i * tw2;
    if (on) {
      w.push(K.rect({ x: tx2, y: pvY + 1, w: tw2, h: 36, fill: C.surfaceHi }));
      w.push(K.rect({ x: tx2, y: pvY + 1, w: tw2, h: 2, fill: C.accent }));
    }
    w.push(uiM(tx2 + tw2 / 2, pvY + 19, label, 10.5, on ? C.text : C.textFaint, { anchor: 'middle', weight: on ? 600 : 400 }));
  });
  w.push(K.line(cfX + 1, pvY + 37, cfX + cfW - 1, pvY + 37, { stroke: C.line }));
  const cIn = cfX + 20, cR = cfX + cfW - 20, cW = cR - cIn;
  // 选择角色
  w.push(uiM(cIn, pvY + 64, '选择角色', 11.5, C.text, { weight: 600 }));
  w.push(monoM(cR, pvY + 64, '点击切换', 7.5, C.textFaint, { anchor: 'end' }));
  const roles = [['Claude', '1 个形象', false], ['DeepSeek', '1 个形象', true], ['ChatGPT', '2 个形象', false]];
  const rcW = (cW - 20) / 3;
  roles.forEach(([name, meta, on], i) => {
    const rx3 = cIn + i * (rcW + 10);
    w.push(K.rect({ x: rx3, y: pvY + 76, w: rcW, h: 62, r: RAD.control, fill: on ? hexA(C.accent, 0.07) : C.surfaceAlt, stroke: on ? hexA(C.accent, 0.55) : C.line, sw: 1 }));
    w.push(uiM(rx3 + 12, pvY + 100, name, 11, on ? C.text : C.textMuted, { weight: on ? 600 : 400 }));
    w.push(monoM(rx3 + 12, pvY + 119, meta, 7.5, C.textFaint));
    if (on) w.push(symM(rx3 + rcW - 13, pvY + 90, '✓', 9, C.accent, { anchor: 'middle' }));
  });
  w.push(K.line(cIn, pvY + 158, cR, pvY + 158, { stroke: C.line }));
  // 选择形象
  w.push(uiM(cIn, pvY + 182, '选择形象', 11.5, C.text, { weight: 600 }));
  w.push(monoM(cR, pvY + 182, '1 个已保存', 7.5, C.textFaint, { anchor: 'end' }));
  // 形象卡
  const imX = cIn, imY = pvY + 196, imW = 104, imH = 96;
  w.push(K.rect({ x: imX, y: imY, w: imW, h: imH, r: RAD.control, fill: C.surfaceAlt, stroke: hexA(C.accent, 0.5), sw: 1 }));
  w.push(K.sprite({ name: 'deepseek-idle', x: imX + 18, y: imY + 6, w: 68, h: 68 }));
  w.push(K.rect({ x: imX + 6, y: imY + imH - 20, w: 46, h: 14, r: 1, fill: C.accent }));
  w.push(monoM(imX + 29, imY + imH - 13, '已保存', 7, C.accentText, { anchor: 'middle', weight: 600 }));
  // 右侧信息
  w.push(uiM(imX + imW + 16, imY + 22, '鲸鱼娘', 12, C.text, { weight: 600 }));
  w.push(monoM(imX + imW + 16, imY + 40, 'DEEPSEEK · 像素 192', 7.5, C.textFaint));
  // 原图 / 像素 分段
  const sgY = imY + 54, sgW = 132;
  w.push(K.rect({ x: imX + imW + 16, y: sgY, w: sgW, h: 26, r: RAD.control, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
  w.push(K.rect({ x: imX + imW + 18, y: sgY + 2, w: sgW / 2 - 2, h: 22, r: 1, fill: C.surfaceHi, stroke: C.lineStrong, sw: 1 }));
  w.push(monoM(imX + imW + 16 + sgW / 4, sgY + 13, '原图', 7.5, C.textMuted, { anchor: 'middle' }));
  w.push(monoM(imX + imW + 16 + (sgW * 3) / 4, sgY + 13, '像素', 7.5, C.text, { anchor: 'middle', weight: 600 }));
  // 导入本地包（空状态）
  const ipX = cR - 118;
  w.push(K.rect({ x: ipX, y: imY, w: 118, h: 96, r: RAD.control, fill: 'none', stroke: C.lineStrong, sw: 1, dash: '4 4' }));
  w.push(symM(ipX + 59, imY + 34, '＋', 12, C.textFaint, { anchor: 'middle' }));
  w.push(monoM(ipX + 59, imY + 54, '导入本地包', 8, C.textMuted, { anchor: 'middle' }));
  w.push(monoM(ipX + 59, imY + 68, '.png / .webp', 7, C.textFaint, { anchor: 'middle' }));
  w.push(K.line(cIn, pvY + 306, cR, pvY + 306, { stroke: C.line }));
  // 大小
  w.push(uiM(cIn, pvY + 330, '大小', 11.5, C.text, { weight: 600 }));
  w.push(monoM(cR, pvY + 330, '中 · 192px', 8, C.accent, { anchor: 'end' }));
  w.push(slider(cIn, pvY + 342, cW, { pos: 0.5 }));
  [['小', 0], ['中', 0.5], ['大', 1]].forEach(([t, p]) => {
    w.push(monoM(cIn + cW * p, pvY + 368, t, 7.5, p === 0.5 ? C.accent : C.textFaint, { anchor: 'middle' }));
  });
  w.push(K.line(cIn, pvY + 380, cR, pvY + 380, { stroke: C.line }));
  // 开关行
  const swRows = [
    ['桌面置顶', '窗口永远在最上层', true, ''],
    ['点击穿透', '鼠标事件直接落到下层窗口', false, ''],
    ['会话跟随', '当前会话切换时自动跟随', true, 'cursor-task'],
  ];
  swRows.forEach(([label, note, on, meta], i) => {
    const ry2 = pvY + 396 + i * 40;
    w.push(uiM(cIn, ry2 + 8, label, 10.5, C.text));
    w.push(monoM(cIn + 68, ry2 + 8, note, 7.5, C.textFaint));
    w.push(toggle(cR - 42, ry2 - 4, { on }));
    if (meta) w.push(monoM(cR - 44, ry2 + 8, meta, 7.5, C.textFaint, { anchor: 'end' }));
  });
  // 配置落盘（把设置卡的剩余高度用真实信息填满）
  w.push(K.line(cIn, pvY + 512, cR, pvY + 512, { stroke: C.line }));
  w.push(monoM(cIn, pvY + 532, '# config.json · 修改后 0.2s 自动保存', 7.5, C.textFaint));
  w.push(monoM(cR, pvY + 532, '恢复默认', 8, C.textMuted, { anchor: 'end' }));
  w.push(monoM(cR, pvY + 548, 'DSH 0.9.4 · Electron 45', 7, C.textFaint, { anchor: 'end' }));
  // ---------- 底部：跟随记录 + 快捷键 ----------
  const stripY = pvY + pvH + 20;
  const st1W = 700, st2X = mx0 + st1W + 20, st2W = WW - 28 - st2X;
  w.push(K.rect({ x: mx0, y: stripY, w: st1W, h: 140, r: RAD.card, fill: C.surface, stroke: C.line, sw: 1 }));
  w.push(mono(st2X - st1W + 16, 0, '', 1, C.text)); // spacer (kept minimal)
  w.push(monoM(mx0 + 18, stripY + 24, 'FOLLOWED SESSIONS / 会话跟随记录', 8, C.accent, { weight: 600 }));
  w.push(monoM(mx0 + st1W - 18, stripY + 24, '3 / 3 跟随中', 7.5, C.textFaint, { anchor: 'end' }));
  const follows = [
    ['cursor-task', 'Cursor', '现在 · 执行工具', C.state.working, '跟随中', true],
    ['dsh-main', 'DSH', '2m 前 · 完成', C.state.done, '跟随中', true],
    ['codex-sandbox', 'Codex', '18m 前 · 空闲', C.state.idle, '已暂停', false],
  ];
  follows.forEach(([sid, eng, info, col, tag, on], i) => {
    const fy = stripY + 44 + i * 28;
    if (i > 0) w.push(K.line(mx0 + 18, fy - 6, mx0 + st1W - 18, fy - 6, { stroke: hexA('#ffffff', 0.045) }));
    w.push(K.circle({ cx: mx0 + 24, cy: fy + 6, r: 3, fill: col }));
    w.push(monoM(mx0 + 36, fy + 6, sid, 8.5, C.text));
    w.push(uiM(mx0 + 160, fy + 6, eng, 8, C.textFaint));
    w.push(monoM(mx0 + 220, fy + 6, info, 8, C.textMuted));
    w.push(monoM(mx0 + st1W - 18, fy + 6, on ? '● 跟随中' : '○ 已暂停', 7.5, on ? C.accent : C.textFaint, { anchor: 'end' }));
  });
  // 快捷键
  w.push(K.rect({ x: st2X, y: stripY, w: st2W, h: 140, r: RAD.card, fill: C.surface, stroke: C.line, sw: 1 }));
  w.push(monoM(st2X + 18, stripY + 24, 'KEYBOARD / 快捷键', 8, C.accent, { weight: 600 }));
  const keys = [['Ctrl+K', '命令面板'], ['Ctrl+H', '隐藏桌宠'], ['Ctrl+,', '设置'], ['Esc', '关闭浮层']];
  keys.forEach(([k, v], i) => {
    const kx2 = st2X + 18 + (i % 2) * 172;
    const ky2 = stripY + 42 + Math.floor(i / 2) * 34;
    const kc3 = keycap(kx2, ky2, k, { size: 8, h: 20, w: 44 });
    w.push(kc3.svg);
    w.push(uiM(kx2 + 54, ky2 + 11, v, 9, C.textMuted));
  });
  // 底部状态栏
  w.push(K.line(0, WH - 32, WW, WH - 32, { stroke: C.line }));
  w.push(monoM(14, WH - 16, '⎇ main  ·  M 4 files  ·  3 sessions followed', 7.5, C.textFaint));
  w.push(monoM(WW - 14, WH - 16, 'LINGPET 0.9.4  ·  UTF-8  ·  Ctrl+, 设置', 7.5, C.textFaint, { anchor: 'end' }));
  parts.push(nested(64, top, WW, WH, w.join('')));

  // 窗口下方注释
  const capY = top + WH + 22;
  const caps = [
    ['◐', '预览缩放 = 真实 512 窗口的 46%，位置与拖拽一致'],
    ['▮', '右侧所有控件写入同一组 CSS 变量，改一次全表面生效'],
    ['⏎', '8px 网格：面板内边距 20 / 卡片间距 20 / 行高 40'],
  ];
  let cxp = 64;
  caps.forEach(([g, t]) => {
    parts.push(symM(cxp, capY, g, 8.5, C.accent));
    parts.push(uiM(cxp + 16, capY, t, 9, C.textMuted));
    cxp += 16 + K.measure(t, 9) + 34;
  });
  sh.raw(parts.join('\n'), WH + 40);
  sh.gap(44);
}

section02();
section03();

/* ---------------------------------------------------------------------------
 * 8. 04 市场
 * ------------------------------------------------------------------------- */
function section04() {
  const ly = sh.y - 14;
  sh.section({
    index: 4,
    title: '市场',
    note: '角色是商品 · 卡片是货架 · 一眼看到谁在跑',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];
  const BW = 1472, BH = 470;
  const b = [];
  b.push(K.rect({ x: 0, y: 0, w: BW, h: BH, r: RAD.window, fill: '#0A100E', stroke: C.lineStrong, sw: 1 }));
  b.push(K.rect({ x: 0, y: 0, w: BW, h: 32, r: RAD.window, fill: C.surfaceAlt }));
  b.push(K.line(0, 32, BW, 32, { stroke: C.line }));
  b.push(monoM(16, 16, '—   □   ✕', 8, C.textFaint));
  b.push(K.rect({ x: 96, y: 7, w: 420, h: 20, r: RAD.control, fill: '#0B1210', stroke: C.line, sw: 1 }));
  b.push(monoM(108, 17, 'lingpet.market / zh-CN', 8, C.textMuted));
  b.push(monoM(BW - 16, 16, 'Ctrl+L', 8, C.textFaint, { anchor: 'end' }));
  // 站内导航
  b.push(K.line(0, 72, BW, 72, { stroke: C.line }));
  b.push(K.rect({ x: 20, y: 40, w: 22, h: 22, r: RAD.control, fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.45), sw: 1 }));
  b.push(uiM(31, 51, '灵', 10, C.accent, { anchor: 'middle', weight: 700 }));
  b.push(uiM(50, 52, '灵伴', 13, C.text, { weight: 700 }));
  b.push(monoM(90, 52, 'MARKET', 7, C.textFaint));
  let nx = 150;
  ['市场', '文档', '更新日志'].forEach((t, i) => {
    b.push(uiM(nx, 52, t, 9.5, i === 0 ? C.text : C.textMuted));
    nx += K.measure(t, 9.5) + 30;
  });
  b.push(uiM(BW - 20, 52, '登录', 9.5, C.textMuted, { anchor: 'end' }));
  b.push(monoM(BW - 56, 52, '◑ 浅色', 8, C.textFaint, { anchor: 'end' }));
  // Hero
  b.push(ui(20, 112, '桌宠市场', 22, C.text, { weight: 700 }));
  b.push(ui(20, 132, '给每个会话配一位伙伴。角色、形象、状态包，一次装好。', 10.5, C.textMuted));
  // 搜索
  b.push(K.rect({ x: 940, y: 88, w: 296, h: 32, r: RAD.control, fill: C.surfaceAlt, stroke: C.lineStrong, sw: 1 }));
  b.push(symM(956, 104, '⌕', 11, C.textFaint));
  b.push(monoM(974, 104, '搜索桌宠、作者或介绍', 9, C.textFaint));
  b.push(monoM(1222, 104, 'Ctrl+K', 7.5, C.textFaint, { anchor: 'end' }));
  // 导入本地包
  b.push(K.rect({ x: 1248, y: 88, w: 116, h: 32, r: RAD.control, fill: hexA(C.accent, 0.10), stroke: hexA(C.accent, 0.42), sw: 1 }));
  b.push(monoM(1306, 104, '+ 导入本地包', 8.5, C.accent, { anchor: 'middle' }));
  // tabs
  const tabs4 = [['发现桌宠', true], ['投稿作品', false], ['查询投稿', false]];
  let tx4 = 20;
  tabs4.forEach(([t, on]) => {
    const w4 = K.measure(t, 10.5) + 24;
    if (on) {
      b.push(K.rect({ x: tx4, y: 160, w: w4, h: 26, fill: hexA(C.accent, 0.08) }));
      b.push(K.rect({ x: tx4, y: 184, w: w4, h: 2, fill: C.accent }));
    }
    b.push(uiM(tx4 + w4 / 2, 173, t, 10.5, on ? C.text : C.textMuted, { anchor: 'middle', weight: on ? 600 : 400 }));
    tx4 += w4 + 8;
  });
  b.push(K.line(0, 186, BW, 186, { stroke: C.line }));
  // 安装方式下拉
  b.push(K.rect({ x: BW - 20 - 236, y: 156, w: 236, h: 26, r: RAD.control, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
  b.push(monoM(BW - 20 - 236 + 12, 169, '安装方式：默认桌宠', 8, C.text));
  b.push(monoM(BW - 34, 169, '▾', 8, C.textFaint, { anchor: 'end' }));

  // 卡片
  const cards = [
    ['鲸鱼娘', '灵伴官方', '12.4k', 'deepseek-idle', C.state.done, '已安装', '使用中'],
    ['小龙娘', '白龙工作室', '8.1k', 'white-dragon-hd', C.accent, '安装', 'hover'],
    ['橘猫 · 像素', '阿柴', '5.6k', 'claude-idle', C.state.approval, '安装', ''],
    ['鲸鱼娘 · 夜', '社区 / moonlit', '3.2k', 'deepseek-thinking', C.secondary, '安装', ''],
  ];
  cards.forEach(([name, author, dl, spr, col, btn, tag], i) => {
    const cx4 = 26 + i * 360, cy4 = 200, cw4 = 340, ch4 = 216;
    const hover = tag === 'hover';
    b.push(K.rect({ x: cx4, y: cy4, w: cw4, h: ch4, r: RAD.card, fill: C.surface, stroke: hover ? hexA(C.accent, 0.55) : C.line, sw: 1, filter: hover ? 'url(#softSm)' : undefined }));
    // 封面
    b.push(K.rect({ x: cx4 + 1, y: cy4 + 1, w: cw4 - 2, h: 118, fill: hexA(col, 0.07) }));
    b.push(K.rect({ x: cx4 + 1, y: cy4 + 1, w: cw4 - 2, h: 118, fill: 'url(#dotsFine)' }));
    b.push(ellipse({ cx: cx4 + cw4 / 2, cy: cy4 + 60, rx: 92, ry: 58, fill: hexA(col, 0.10) }));
    const sh4 = 100, sw4 = Math.round(sh4 * (256 / 341));
    b.push(K.sprite({ name: spr, x: cx4 + (cw4 - sw4) / 2, y: cy4 + 8, w: sw4, h: sh4 }));
    b.push(K.line(cx4 + 1, cy4 + 120, cx4 + cw4 - 1, cy4 + 120, { stroke: C.line }));
    // 信息
    b.push(uiM(cx4 + 16, cy4 + 142, name, 12.5, C.text, { weight: 600 }));
    b.push(monoM(cx4 + 16, cy4 + 160, `by ${author}`, 7.5, C.textFaint));
    b.push(monoM(cx4 + 16, cy4 + 192, `↓ ${dl}`, 8.5, C.textMuted));
    b.push(monoM(cx4 + 74, cy4 + 192, '· 1 形象', 8, C.textFaint));
    if (btn === '安装' && hover) {
      b.push(K.rect({ x: cx4 + cw4 - 16 - 72, y: cy4 + 176, w: 72, h: 26, r: RAD.control, fill: C.accent }));
      b.push(uiM(cx4 + cw4 - 16 - 36, cy4 + 189, '安装', 9.5, C.accentText, { anchor: 'middle', weight: 600 }));
    } else if (btn === '安装') {
      b.push(K.rect({ x: cx4 + cw4 - 16 - 72, y: cy4 + 176, w: 72, h: 26, r: RAD.control, fill: 'none', stroke: C.lineStrong, sw: 1 }));
      b.push(uiM(cx4 + cw4 - 16 - 36, cy4 + 189, '安装', 9.5, C.textMuted, { anchor: 'middle' }));
    } else {
      b.push(K.rect({ x: cx4 + cw4 - 16 - 72, y: cy4 + 176, w: 72, h: 26, r: RAD.control, fill: hexA(C.accent, 0.10), stroke: hexA(C.accent, 0.4), sw: 1 }));
      b.push(uiM(cx4 + cw4 - 16 - 36, cy4 + 189, '使用中', 9, C.accent, { anchor: 'middle' }));
    }
    if (i === 0) {
      b.push(K.rect({ x: cx4 + cw4 - 16 - 46, y: cy4 + 12, w: 46, h: 16, r: 1, fill: hexA(C.accent, 0.14), stroke: hexA(C.accent, 0.45), sw: 1 }));
      b.push(monoM(cx4 + cw4 - 16 - 23, cy4 + 20, '已安装', 7, C.accent, { anchor: 'middle' }));
    }
  });
  // 结果条
  b.push(K.line(0, 440, BW, 440, { stroke: C.line }));
  b.push(monoM(20, 456, '共 4 个结果  ·  按热度排序 ▾  ·  仅显示已适配 DSH 0.9+', 8, C.textFaint));
  b.push(monoM(BW - 20, 456, '↑↓ 浏览   ⏎ 安装   esc 关闭', 8, C.textFaint, { anchor: 'end' }));
  parts.push(nested(64, top, BW, BH, b.join('')));

  const capY = top + BH + 22;
  const caps = [
    ['▮', '封面 = 角色原图放大 2×，像素边缘不糊才算合格'],
    ['⌗', '卡片 340 × 216：8px 网格对齐，4 列一屏不多不少'],
    ['⏎', '安装即写入「安装方式」，与工作台共用同一份状态'],
  ];
  let cxp = 64;
  caps.forEach(([g, t]) => {
    parts.push(symM(cxp, capY, g, 8.5, C.accent));
    parts.push(uiM(cxp + 16, capY, t, 9, C.textMuted));
    cxp += 16 + K.measure(t, 9) + 40;
  });
  sh.raw(parts.join('\n'), BH + 40);
  sh.gap(44);
}

/* ---------------------------------------------------------------------------
 * 9. 05 周边表面：DSH 面板 + 市场网站
 * ------------------------------------------------------------------------- */
function section05() {
  const ly = sh.y - 14;
  sh.section({
    index: 5,
    title: '周边表面',
    note: 'DSH 设置面板与市场网站 · 同一套 token 的两种密度',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];

  // ---------- DSH 设置面板（深色） ----------
  const px5 = 64, pw5 = 460, ph5 = 356;
  const d = [];
  d.push(K.rect({ x: 0, y: 0, w: pw5, h: ph5, r: RAD.panel, fill: C.surface, stroke: C.line, sw: 1 }));
  d.push(monoM(18, 20, '设置 / DSH · 插件', 7.5, C.textFaint));
  d.push(ui(18, 50, '你的会话伙伴', 17, C.text, { weight: 700 }));
  d.push(ui(18, 70, '桌宠运行状态 · 跟随当前会话', 10, C.textMuted));
  // 状态卡
  d.push(K.rect({ x: 18, y: 84, w: pw5 - 36, h: 52, r: RAD.control, fill: C.surfaceAlt, stroke: C.line, sw: 1 }));
  d.push(K.circle({ cx: 34, cy: 110, r: 3.5, fill: C.accent }));
  d.push(uiM(48, 103, '运行中', 10, C.text));
  d.push(monoM(48, 120, 'cursor-task · 04:12 已用', 7.5, C.textFaint));
  d.push(monoM(pw5 - 34, 110, 'v0.9.4', 7.5, C.textFaint, { anchor: 'end' }));
  // checkbox 行
  const rows5 = [
    ['打开工作台', '在 DSH 里常驻一个 agent 标签页', true],
    ['会话偏好', '按项目记住桌宠与大小', true],
    ['恢复继承配置', '新会话继承上一个会话的设置', false],
  ];
  rows5.forEach(([label, note, on], i) => {
    const ry5 = 152 + i * 34;
    d.push(K.rect({ x: 18, y: ry5, w: 14, h: 14, r: 1, fill: on ? C.accent : 'none', stroke: on ? C.accent : C.lineStrong, sw: 1 }));
    if (on) d.push(symM(25, ry5 + 7, '✓', 8, C.accentText, { anchor: 'middle' }));
    d.push(uiM(42, ry5 + 7, label, 10, C.text));
    d.push(monoM(42 + K.measure(label, 10) + 16, ry5 + 7, note, 7.5, C.textFaint));
  });
  // 主按钮
  d.push(K.rect({ x: 18, y: 262, w: pw5 - 36, h: 38, r: RAD.control, fill: C.accent }));
  d.push(uiM(pw5 / 2 - 28, 281, '打开工作台', 11, C.accentText, { anchor: 'middle', weight: 600 }));
  d.push(monoM(pw5 - 34, 281, 'Ctrl+Enter', 7, C.accentText, { anchor: 'end' }));
  // 派生说明
  d.push(monoM(18, 322, '底色 = color-mix(in srgb, currentColor 6%, #070A09)', 7.5, C.textFaint));
  d.push(monoM(18, 338, '强调色可被 --lp-accent 覆盖 · 无硬编码 hex', 7.5, C.textFaint));
  parts.push(nested(px5, top, pw5, ph5, d.join('')));

  // ---------- 浅色变体 ----------
  const ltY = top + ph5 + 20, ltH = 150;
  const l = [];
  l.push(K.rect({ x: 0, y: 0, w: pw5, h: ltH, r: RAD.panel, fill: '#F3F7F2', stroke: '#D6E2D6', sw: 1 }));
  l.push(ui(18, 30, '你的会话伙伴 · 浅色', 13, '#15211B', { weight: 700 }));
  l.push(monoM(18, 46, 'prefers-color-scheme: light 自动切换', 7, '#5C6E62'));
  l.push(K.circle({ cx: 26, cy: 66, r: 3, fill: '#0E9B63' }));
  l.push(monoM(38, 66, '运行中 · cursor-task', 8.5, '#15211B'));
  l.push(K.rect({ x: 18, y: 82, w: 180, h: 30, r: RAD.control, fill: '#0E9B63' }));
  l.push(uiM(108, 97, '打开工作台', 9, '#F4FBF6', { anchor: 'middle', weight: 600 }));
  l.push(K.rect({ x: 210, y: 82, w: 100, h: 30, r: RAD.control, fill: 'none', stroke: '#C3D4C6', sw: 1 }));
  l.push(uiM(260, 97, '取消', 8.5, '#3D5044', { anchor: 'middle' }));
  l.push(K.line(326, 26, 326, ltH - 12, { stroke: '#D6E2D6' }));
  const ltTokens = [['#0E9B63', 'accent'], ['#F3F7F2', 'bg'], ['#D6E2D6', 'line'], ['#15211B', 'text']];
  ltTokens.forEach(([hex, name], i) => {
    l.push(K.rect({ x: 342, y: 30 + i * 22, w: 10, h: 10, r: 1, fill: hex, stroke: '#B9CBBE', sw: 1 }));
    l.push(monoM(358, 35 + i * 22, hex, 6.5, '#3D5044'));
    l.push(monoM(410, 35 + i * 22, name, 6.5, '#7A8C80'));
  });
  // 对比度标注
  l.push(monoM(18, 132, '浅色 accent 压深到 #0E9B63 → 与底色对比 5.1:1，正文 12.4:1', 7, '#5C6E62'));
  parts.push(nested(px5, ltY, pw5, ltH, l.join('')));

  // ---------- 市场网站缩略 ----------
  const wx5 = 600, ww5 = 640, wh5 = 372;
  const s = [];
  s.push(K.rect({ x: 0, y: 0, w: ww5, h: wh5, r: RAD.panel, fill: '#0A100E', stroke: C.lineStrong, sw: 1 }));
  s.push(K.rect({ x: 0, y: 0, w: ww5, h: 24, r: RAD.panel, fill: C.surfaceAlt }));
  s.push(K.line(0, 24, ww5, 24, { stroke: C.line }));
  s.push(monoM(12, 12, '—  □  ✕', 7, C.textFaint));
  s.push(K.rect({ x: 60, y: 5, w: 300, h: 14, r: 1, fill: '#0B1210', stroke: C.line, sw: 1 }));
  s.push(monoM(68, 12, 'lingpet.market', 7, C.textMuted));
  // nav
  s.push(K.line(0, 62, ww5, 62, { stroke: C.line }));
  s.push(K.rect({ x: 16, y: 32, w: 18, h: 18, r: 1, fill: hexA(C.accent, 0.12), stroke: hexA(C.accent, 0.45), sw: 1 }));
  s.push(uiM(25, 41, '灵', 8, C.accent, { anchor: 'middle', weight: 700 }));
  s.push(uiM(40, 44, '灵伴', 10, C.text, { weight: 700 }));
  s.push(uiM(82, 44, '市场', 8, C.text));
  s.push(uiM(112, 44, '文档', 8, C.textFaint));
  s.push(uiM(142, 44, '更新日志', 8, C.textFaint));
  s.push(uiM(ww5 - 16, 44, '登录', 8, C.textMuted, { anchor: 'end' }));
  // hero
  s.push(ui(16, 92, '把陪伴装进浏览器里', 17, C.text, { weight: 700 }));
  s.push(ui(16, 108, '下载桌宠、投稿形象、看本周热门。', 8.5, C.textMuted));
  s.push(K.rect({ x: 16, y: 118, w: 108, h: 26, r: RAD.control, fill: C.accent }));
  s.push(uiM(70, 131, '浏览市场', 8, C.accentText, { anchor: 'middle', weight: 600 }));
  s.push(K.rect({ x: 132, y: 118, w: 96, h: 26, r: RAD.control, fill: 'none', stroke: C.lineStrong, sw: 1 }));
  s.push(uiM(180, 131, '查看文档', 8, C.textMuted, { anchor: 'middle' }));
  s.push(K.rect({ x: ww5 - 16 - 180, y: 76, w: 180, h: 64, r: 1, fill: hexA(C.state.done, 0.06), stroke: C.line, sw: 1 }));
  s.push(K.sprite({ name: 'deepseek-idle', x: ww5 - 16 - 180 + 124, y: 78, w: 44, h: 56 }));
  s.push(monoM(ww5 - 16 - 180 + 12, 96, '本周热门', 7, C.textFaint));
  s.push(monoM(ww5 - 16 - 180 + 12, 112, '鲸鱼娘 · 12.4k', 7, C.textMuted));
  // 3 卡
  for (let i = 0; i < 3; i++) {
    const cx5 = 16 + i * 204, cy5 = 152, cw5 = 192, ch5 = 176;
    s.push(K.rect({ x: cx5, y: cy5, w: cw5, h: ch5, r: RAD.card, fill: C.surface, stroke: C.line, sw: 1 }));
    s.push(K.rect({ x: cx5 + 1, y: cy5 + 1, w: cw5 - 2, h: 96, fill: hexA([C.state.done, C.accent, C.state.approval][i], 0.07) }));
    s.push(K.sprite({ name: ['deepseek-idle', 'claude-idle', 'deepseek-done'][i], x: cx5 + 56, y: cy5 + 12, w: 62, h: 82 }));
    s.push(uiM(cx5 + 10, cy5 + 112, ['鲸鱼娘', '橘猫', '鲸鱼娘 · 夜'][i], 9, C.text, { weight: 600 }));
    s.push(monoM(cx5 + 10, cy5 + 126, ['12.4k 下载', '5.6k 下载', '3.2k 下载'][i], 7, C.textFaint));
    s.push(monoM(cx5 + 10, cy5 + 152, '+ 安装', 7, C.accent));
  }
  s.push(K.line(0, 338, ww5, 338, { stroke: C.line }));
  s.push(monoM(16, 354, '© 2026 LINGPET · 开源桌面伙伴', 7, C.textFaint));
  s.push(monoM(ww5 - 16, 354, 'GitHub / 更新日志 / 关于', 7, C.textFaint, { anchor: 'end' }));
  parts.push(nested(wx5, top, ww5, wh5, s.join('')));

  // 右侧注释
  const anX = wx5 + ww5 + 28;
  const notes5 = [
    ['◐', '同一套 CSS 变量：网站、面板、桌宠窗共用'],
    ['▮', 'DSH 底色由 color-mix(currentColor) 派生，主色可覆盖'],
    ['⌗', '浅色不是反色：accent 压深、line 提亮，对比 ≥4.5:1'],
    ['⬚', '所有图标为几何路径，16px 与 24px 两个尺寸'],
    ['⏎', '键盘可达：整站 Tab / Enter / Esc 全流程无鼠标依赖'],
  ];
  notes5.forEach(([g, t], i) => {
    const ny5 = top + 40 + i * 108;
    parts.push(symM(anX, ny5, g, 10, C.accent));
    const ls = K.wrap(t, 10, 1536 - anX - 24);
    ls.forEach((line, j) => parts.push(ui(anX, ny5 + 22 + j * 16, line, 10, C.textMuted)));
  });

  sh.raw(parts.join('\n'), Math.max(ph5 + 20 + ltH, wh5) + 18);
  sh.gap(46);
}

/* ---------------------------------------------------------------------------
 * 10. 06 设计语言
 * ------------------------------------------------------------------------- */
function section06() {
  const ly = sh.y - 14;
  sh.section({
    index: 6,
    title: '设计语言',
    note: 'token → 组件 → 动效：所有表面共用一套数字',
    color: C.text,
    noteColor: C.textFaint,
    family: F.ui,
    line: K.line(sh.pad, ly, sh.width - sh.pad, ly, { stroke: C.line }),
  });
  const top = sh.y;
  const parts = [];
  const x0 = 64;

  // ---------- 色彩 ----------
  parts.push(mono(x0, top + 12, 'COLOR / 色彩', 9, C.accent, { weight: 600 }));
  parts.push(mono(x0 + 840, top + 12, '深色为默认；浅色变体只替换 6 个槽位', 8, C.textFaint));
  const cores = [
    ['bg', '#070A09'], ['surface', '#0C1210'], ['surfaceAlt', '#111917'],
    ['line', '#1E2B26'], ['text', '#D8E2DB'], ['textMuted', '#8DA096'], ['accent', '#54F0A6'],
  ];
  const swW = 108, swGap = 6;
  cores.forEach(([name, hex], i) => {
    const sx6 = x0 + i * (swW + swGap), sy6 = top + 24;
    parts.push(K.rect({ x: sx6, y: sy6, w: swW, h: 44, r: RAD.control, fill: hex, stroke: hexA('#ffffff', 0.12), sw: 1 }));
    parts.push(mono(sx6, sy6 + 58, hex.toUpperCase(), 8, C.textMuted));
    parts.push(mono(sx6, sy6 + 70, name, 7.5, C.textFaint));
  });
  // 状态色 2×4
  const stX = x0 + 840;
  const states = [
    ['idle', '空闲', C.state.idle], ['thinking', '思考中', C.state.thinking],
    ['working', '执行工具', C.state.working], ['input', '等待输入', C.state.input],
    ['approval', '等待确认', C.state.approval], ['done', '完成', C.state.done],
    ['error', '错误', C.state.error], ['sleep', '休眠', C.state.sleep],
  ];
  states.forEach(([k, label, col], i) => {
    const sx6 = stX + (i % 4) * 152, sy6 = top + 24 + Math.floor(i / 4) * 44;
    parts.push(K.rect({ x: sx6, y: sy6, w: 146, h: 36, r: RAD.control, fill: hexA(col, 0.07), stroke: hexA(col, 0.35), sw: 1 }));
    parts.push(K.rect({ x: sx6, y: sy6, w: 3, h: 36, fill: col }));
    parts.push(monoM(sx6 + 12, sy6 + 13, `[${k}]`, 7.5, col, { weight: 600 }));
    parts.push(uiM(sx6 + 12, sy6 + 27, label, 8.5, C.textMuted));
    parts.push(monoM(sx6 + 138, sy6 + 18, col.slice(1), 7, C.textFaint, { anchor: 'end' }));
  });
  // 浅色 strip
  const lightY = top + 104;
  parts.push(K.rect({ x: x0, y: lightY, w: 828, h: 40, r: RAD.control, fill: '#F3F7F2', stroke: '#D6E2D6', sw: 1 }));
  parts.push(uiM(x0 + 12, lightY + 20, '浅色变体', 8, '#15211B'));
  const lc = [['#F3F7F2', 'bg'], ['#FFFFFF', 'surface'], ['#D6E2D6', 'line'], ['#15211B', 'text'], ['#0E9B63', 'accent']];
  lc.forEach(([hex, name], i) => {
    const lx = x0 + 84 + i * 146;
    parts.push(K.rect({ x: lx, y: lightY + 10, w: 28, h: 20, r: 1, fill: hex, stroke: '#C3D4C6', sw: 1 }));
    parts.push(monoM(lx + 34, lightY + 20, hex, 7, '#3D5044'));
    parts.push(monoM(lx + 34 + K.measure(hex, 7) + 6, lightY + 20, name, 6.5, '#7A8C80'));
  });
  parts.push(monoM(stX, lightY + 56, '全部 hex 与 tokens.json 一致 · 状态色只做前景/描边，不铺大面积', 7.5, C.textFaint));

  // ---------- 字阶 ----------
  const typeY = top + 186;
  parts.push(mono(x0, typeY, 'TYPE / 字阶（字体仅系统栈：YaHei + Consolas）', 9, C.accent, { weight: 600 }));
  const ts = [
    ['display', 40, 700, 1.05, '终端脉动', 62, 'ui'],
    ['h1', 26, 700, 1.15, '桌宠工作台', 46, 'ui'],
    ['h2', 17, 600, 1.2, '选择角色', 34, 'ui'],
    ['body', 13, 400, 1.55, '选择一位伙伴，设置它的外观和跟随方式。', 28, 'ui'],
    ['meta', 11, 400, 1.4, 'Codex / Cursor / DSH 已连接 · 3', 25, 'ui'],
    ['mono', 10, 400, 1.4, 'pnpm build --scope=desktop · 62%', 25, 'mono'],
    ['micro', 8.5, 500, 1.2, '[approval] 等待确认 · 00:12', 23, 'mono'],
  ];
  let ty6 = typeY + 16;
  ts.forEach(([name, size, weight, lh, sample, rh, fam]) => {
    const base = ty6 + rh / 2 + size * 0.34;
    parts.push(mono(x0, base, name, 8, C.textFaint));
    parts.push(mono(x0 + 84, base, `${size}px / ${weight} / ${lh}`, 8, C.textMuted));
    parts.push(fam === 'mono' ? mono(x0 + 250, base, sample, size, C.text) : ui(x0 + 250, base, sample, size, C.text));
    const use = { display: '品牌 / Hero', h1: '页面主标题', h2: '区块标题', body: '正文', meta: '元信息', mono: '代码 / 数字', micro: '标签 / 角标' }[name];
    parts.push(uiM(x0 + 824, base, use, 7.5, C.textFaint, { anchor: 'end' }));
    parts.push(K.line(x0, ty6 + rh - 4, x0 + 828, ty6 + rh - 4, { stroke: hexA('#ffffff', 0.045) }));
    ty6 += rh;
  });

  // ---------- 形状 / 效果 右列 ----------
  const rx6 = x0 + 868;
  parts.push(mono(rx6, typeY, 'SHAPE & EFFECT / 形状与质感', 9, C.accent, { weight: 600 }));
  const shapeY = typeY + 16;
  const shapeBlocks = [
    ['0px', '状态块 / 进度段 / 任务栏', () => {
      let o = K.rect({ x: 0, y: 0, w: 80, h: 10, fill: C.accent }) + K.rect({ x: 84, y: 0, w: 96, h: 10, fill: C.line });
      o += K.rect({ x: 0, y: 18, w: 180, h: 6, fill: C.line });
      o += K.rect({ x: 0, y: 30, w: 120, h: 4, fill: hexA(C.accent, 0.55) });
      return o;
    }],
    ['2px', '面板 / 卡片 / 控件', () => {
      return K.rect({ x: 0, y: 0, w: 180, h: 40, r: 2, fill: C.surfaceAlt, stroke: C.lineStrong, sw: 1 }) +
        K.rect({ x: 12, y: 10, w: 60, h: 8, fill: C.lineStrong }) + K.rect({ x: 12, y: 24, w: 110, h: 6, fill: C.line });
    }],
    ['1px', '描边 / 分隔线 / 虚线焦点', () => {
      return K.line(0, 4, 180, 4, { stroke: C.lineStrong }) +
        K.rect({ x: 0, y: 14, w: 84, h: 26, r: 2, fill: 'none', stroke: hexA(C.accent, 0.55), sw: 1, dash: '4 3' }) +
        K.rect({ x: 96, y: 14, w: 84, h: 26, r: 2, fill: 'none', stroke: C.lineStrong, sw: 1 });
    }],
  ];
  shapeBlocks.forEach(([n, cap, draw], i) => {
    const bx6 = rx6 + i * 204;
    parts.push(K.rect({ x: bx6, y: shapeY, w: 196, h: 72, r: RAD.control, fill: '#080D0C', stroke: C.line, sw: 1 }));
    parts.push(nested(bx6 + 8, shapeY + 14, 180, 44, draw()));
    parts.push(monoM(bx6 + 8, shapeY + 82, n, 9, C.accent));
    parts.push(uiM(bx6 + 34, shapeY + 82, cap, 7.5, C.textFaint));
  });
  // 效果 3 块
  const effY = shapeY + 98;
  const effects = [['shadow', '0 16 / 48 rgba(0,0,0,.55)'], ['glow', '0 0 18 rgba(84,240,166,.45)'], ['texture', 'scan 1px/4px · dot 18px']];
  effects.forEach(([name, spec], i) => {
    const bx6 = rx6 + i * 204;
    parts.push(K.rect({ x: bx6, y: effY, w: 196, h: 64, r: RAD.control, fill: '#080D0C', stroke: C.line, sw: 1 }));
    if (name === 'shadow') {
      parts.push(K.rect({ x: bx6 + 14, y: effY + 16, w: 64, h: 32, r: RAD.control, fill: C.surface, stroke: C.line, sw: 1, filter: 'url(#soft)' }));
    } else if (name === 'glow') {
      parts.push(K.rect({ x: bx6 + 14, y: effY + 20, w: 72, h: 24, r: RAD.control, fill: hexA(C.accent, 0.10), stroke: hexA(C.accent, 0.5), sw: 1, filter: 'url(#glowG)' }));
    } else {
      parts.push(K.rect({ x: bx6 + 14, y: effY + 16, w: 64, h: 32, r: RAD.control, fill: C.surfaceAlt }));
      parts.push(K.rect({ x: bx6 + 14, y: effY + 16, w: 64, h: 32, fill: 'url(#scan)' }));
      parts.push(K.rect({ x: bx6 + 14, y: effY + 16, w: 64, h: 32, fill: 'url(#dotsFine)' }));
    }
    parts.push(monoM(bx6 + 90, effY + 24, name, 8, C.textMuted));
    parts.push(monoM(bx6 + 90, effY + 40, spec, 6.5, C.textFaint));
  });

  // ---------- 图标（右列 4×2） ----------
  const icY = top + 394;
  parts.push(mono(rx6, icY, 'ICONS / 8 个状态图标（16px 可辨识）', 9, C.accent, { weight: 600 }));
  const icons = [
    ['idle', C.state.idle, (cx, cy) => K.circle({ cx, cy, r: 5.5, fill: 'none', stroke: C.state.idle, sw: 1.5 }) + K.circle({ cx, cy, r: 1.6, fill: C.state.idle })],
    ['thinking', C.state.thinking, (cx, cy) => [0, 1, 2].map((i) => K.circle({ cx: cx - 5 + i * 5, cy: cy + (i === 1 ? -2 : 0), r: 1.5, fill: C.state.thinking })).join('')],
    ['working', C.state.working, (cx, cy) => [0, 1, 2].map((i) => K.rect({ x: cx - 6 + i * 5, y: cy - 2 - i * 2, w: 3, h: 6 + i * 2, fill: i < 2 ? C.state.working : hexA(C.state.working, 0.4) })).join('')],
    ['input', C.state.input, (cx, cy) => K.rect({ x: cx - 6, y: cy - 6, w: 2, h: 10, fill: C.state.input }) + K.line(cx - 2, cy + 5, cx + 6, cy + 5, { stroke: C.state.input, sw: 1.5 })],
    ['approval', C.state.approval, (cx, cy) => K.rect({ x: cx - 6, y: cy - 7, w: 12, h: 14, r: 1, fill: 'none', stroke: C.state.approval, sw: 1.2 }) + K.line(cx, cy - 3, cx, cy + 1, { stroke: C.state.approval, sw: 1.8 }) + K.rect({ x: cx - 0.8, y: cy + 3, w: 1.6, h: 1.6, fill: C.state.approval })],
    ['done', C.state.done, (cx, cy) => pathEl(`M ${cx - 5} ${cy + 0.5} L ${cx - 1.5} ${cy + 4} L ${cx + 5.5} ${cy - 4.5}`, { stroke: C.state.done, sw: 2 })],
    ['error', C.state.error, (cx, cy) => pathEl(`M ${cx - 5} ${cy - 5} L ${cx + 5} ${cy + 5} M ${cx + 5} ${cy - 5} L ${cx - 5} ${cy + 5}`, { stroke: C.state.error, sw: 1.8 })],
    ['sleep', C.state.sleep, (cx, cy) => K.circle({ cx: cx + 0.6, cy, r: 5.8, fill: C.state.sleep }) + K.circle({ cx: cx + 3.6, cy: cy - 1.4, r: 4.8, fill: '#0A0F0E' })],
  ];
  icons.forEach(([k, col, draw], i) => {
    const ix6 = rx6 + (i % 4) * 150, iy6 = icY + 20 + Math.floor(i / 4) * 62;
    parts.push(K.rect({ x: ix6, y: iy6, w: 30, h: 30, r: RAD.control, fill: k === 'sleep' ? '#0A0F0E' : hexA(col, 0.08), stroke: hexA(col, 0.35), sw: 1 }));
    parts.push(draw(ix6 + 15, iy6 + 15));
    parts.push(monoM(ix6 + 40, iy6 + 11, `[${k}]`, 7.5, col, { weight: 600 }));
    parts.push(uiM(ix6 + 40, iy6 + 25, states[i][1], 7.5, C.textFaint));
  });

  // ---------- 对比度 ----------
  const ctY = top + 540;
  parts.push(mono(rx6, ctY, 'CONTRAST / 对比度（对 bg #070A09）', 9, C.accent, { weight: 600 }));
  const cts = [
    ['--lp-text', '#D8E2DB', '15.0 : 1', 'AAA'],
    ['--lp-text-muted', '#8DA096', '7.2 : 1', 'AA'],
    ['--lp-accent', '#54F0A6', '13.6 : 1', 'AA'],
  ];
  cts.forEach(([tk, hex, ratio, lvl], i) => {
    const cy6 = ctY + 20 + i * 18;
    parts.push(monoM(rx6, cy6, tk, 7.5, C.textMuted));
    parts.push(K.rect({ x: rx6 + 152, y: cy6 - 6, w: 16, h: 12, r: 1, fill: hex }));
    parts.push(monoM(rx6 + 176, cy6, hex, 7, C.textFaint));
    parts.push(monoM(rx6 + 330, cy6, ratio, 7.5, C.accent));
    parts.push(monoM(rx6 + 424, cy6, lvl, 7, C.textFaint));
  });
  parts.push(monoM(rx6, ctY + 86, '荧光只做前景与描边：主色面积 ≤8%，层级靠中性灰阶拉开', 7, C.textFaint));

  // ---------- 动效 ----------
  const moY = top + 466;
  parts.push(mono(x0, moY, 'MOTION / 动效（全部可被 prefers-reduced-motion 关掉）', 9, C.accent, { weight: 600 }));
  const motions = [
    ['状态切换', '160ms', 'cubic-bezier(.2,.8,.2,1)', '行内刷新闪 + 色块 steps(8)', 0.16, 'state → state'],
    ['气泡出现', '160ms', '同 ease', '尾巴 90ms 先出，正文 70ms 后淡入', 0.10, 'done / approval / error'],
    ['hover 反馈', '90ms', 'linear', '描边变亮 + 背景 +4% 亮度', 0.06, 'pointerenter'],
    ['光晕呼吸', '3.2s', 'ease-in-out infinite alternate', 'opacity .14 ⇄ .26，只动 alpha', 1.0, '状态色常驻'],
  ];
  motions.forEach(([name, dur, ease, desc, frac, trig], i) => {
    const my6 = moY + 22 + i * 34;
    parts.push(uiM(x0, my6, name, 9.5, C.text));
    parts.push(monoM(x0 + 92, my6, dur, 8, C.accent));
    parts.push(monoM(x0 + 156, my6, desc, 7.5, C.textMuted));
    parts.push(monoM(x0 + 430, my6, ease, 7, C.textFaint));
    const tlX = x0 + 560, tlW = 150;
    parts.push(K.rect({ x: tlX, y: my6 - 3, w: tlW, h: 6, fill: hexA('#ffffff', 0.05) }));
    parts.push(K.rect({ x: tlX, y: my6 - 3, w: Math.max(8, tlW * frac), h: 6, fill: hexA(C.accent, 0.8) }));
    parts.push(monoM(tlX + tlW + 12, my6, trig, 7, C.textFaint));
  });
  parts.push(monoM(x0, moY + 158, 'reduced-motion：duration → 0ms，仅保留颜色切换；progress 用 steps(8) 而非线性，保证「跳格」的终端手感', 7.5, C.textFaint));

  // ---------- CSS 变量映射 ----------
  const cssY = top + 660;
  parts.push(K.rect({ x: x0, y: cssY, w: 1472, h: 78, r: RAD.control, fill: '#080D0C', stroke: C.line, sw: 1 }));
  parts.push(monoM(x0 + 14, cssY + 18, 'TOKENS → CSS 变量（示例 3 行，其余同构）', 8, C.accent, { weight: 600 }));
  const cssLines = [
    ['--lp-bg', 'tokens.colors.bg', '--lp-surface', 'tokens.colors.surface'],
    ['--lp-state-working', 'tokens.colors.state.working', '--lp-radius-panel', 'tokens.radius.panel'],
    ['--lp-ease-base', 'tokens.motion.easing', '--lp-dur-state', 'tokens.motion.base'],
  ];
  cssLines.forEach((row, i) => {
    const cy6 = cssY + 36 + i * 14;
    parts.push(monoM(x0 + 14, cy6, `${row[0]}: ${row[1]};`, 7.5, C.textMuted));
    parts.push(monoM(x0 + 740, cy6, `${row[2]}: ${row[3]};`, 7.5, C.textFaint));
  });

  sh.raw(parts.join('\n'), 660 + 88 + 8);
  sh.gap(24);
}

section04();
section05();
section06();

/* ---------------------------------------------------------------------------
 * 9. 输出
 * ------------------------------------------------------------------------- */
const totalH = Math.ceil(sh.y + sh.pad * 0.6);
const headFinal = HEADER_SVG.replace('%BOARD_H%', String(totalH));
sh.parts.splice(1, 0, headFinal);
sh.y = totalH - sh.pad * 0.6;

const res = await sh.finish(OUT);
console.log(res);
