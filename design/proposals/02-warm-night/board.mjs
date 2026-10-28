/**
 * 方案 B · 暖光夜桌（WARM NIGHT DESK）
 * 生成：node design/proposals/02-warm-night/board.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../lib/svgkit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* =========================================================================
 * Token
 * ========================================================================= */
const T = {
  bg: '#0b0908',
  surface: '#171210',
  surfaceAlt: '#1f1814',
  surfaceRaised: '#241c16',
  line: '#33291f',
  lineStrong: '#4a3a2c',
  text: '#f6efe6',
  muted: '#b4a494',
  faint: '#7e7061',
  accent: '#f0a860',
  accentLight: '#ffd7ae',
  accentSoft: '#3a2a1c',
  accentInk: '#2a1c10',
  cool: '#a8bdd8',
  done: '#9ccfae',
  error: '#e88a86',
  warn: '#e8c46a',
  state: {
    idle: '#b8a894',
    thinking: '#f0a860',
    working: '#ffc46b',
    input: '#e8c46a',
    approval: '#e8c46a',
    done: '#9ccfae',
    error: '#e88a86',
    sleep: '#9a92b8',
  },
};
const F = {
  display: "'Noto Serif SC', 'Microsoft YaHei', serif",
  ui: "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  mono: "Consolas, 'Courier New', monospace",
};
const STATE_LABEL = {
  idle: '空闲', thinking: '思考中', working: '执行工具', input: '等待输入',
  approval: '等待确认', done: '完成', error: '错误', sleep: '休眠',
};

const sh = K.createSheet({
  theme: { fonts: { display: F.display, ui: F.ui, mono: F.mono } },
  bg: 'url(#boardBg)',
  defs: `
  <linearGradient id="boardBg" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#131110"/><stop offset="0.4" stop-color="#0c0a09"/><stop offset="1" stop-color="#080706"/>
  </linearGradient>
  <radialGradient id="auraWarm" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffb36b" stop-opacity="0.60"/>
    <stop offset="0.42" stop-color="#ff9c4d" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#ff9c4d" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="auraCool" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#9ab6e8" stop-opacity="0.40"/>
    <stop offset="1" stop-color="#9ab6e8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="auraRed" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ff8e8a" stop-opacity="0.48"/>
    <stop offset="1" stop-color="#ff8e8a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="desktopBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#191b22"/><stop offset="0.5" stop-color="#121216"/><stop offset="1" stop-color="#171210"/>
  </linearGradient>
  <linearGradient id="winBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1b1613"/><stop offset="1" stop-color="#13100e"/>
  </linearGradient>
  <linearGradient id="sideBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#151110"/><stop offset="1" stop-color="#0f0c0b"/>
  </linearGradient>
  <linearGradient id="pillBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2c241d"/><stop offset="1" stop-color="#1a1512"/>
  </linearGradient>
  <linearGradient id="bubbleBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fdf5e8"/><stop offset="1" stop-color="#f3e5d0"/>
  </linearGradient>
  <linearGradient id="primaryBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffcb91"/><stop offset="1" stop-color="#eda15c"/>
  </linearGradient>
  <linearGradient id="coverA" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#33221a"/><stop offset="1" stop-color="#120e0c"/>
  </linearGradient>
  <linearGradient id="coverB" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1c1d2a"/><stop offset="1" stop-color="#100e12"/>
  </linearGradient>
  <linearGradient id="coverC" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1e2823"/><stop offset="1" stop-color="#0f1210"/>
  </linearGradient>
  <linearGradient id="stageBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0f0d0c"/><stop offset="1" stop-color="#17120f"/>
  </linearGradient>
  <filter id="panelShadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="22" stdDeviation="34" flood-color="#000000" flood-opacity="0.55"/>
  </filter>
  <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.50"/>
  </filter>
  <filter id="controlShadow" x="-40%" y="-40%" width="180%" height="190%">
    <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="0.55"/>
  </filter>
  <filter id="glowSoft" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
    <circle cx="1.3" cy="1.3" r="1.2" fill="#f6efe6" fill-opacity="0.05"/>
  </pattern>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="#000000" fill-opacity="0.14"/>
  </pattern>`,
});

const pad = sh.pad;
const W = sh.width;
const INNER = W - pad * 2;
const r = K.rect;
const t = K.text;
const L = K.lines;
const el = K.el;

/* =========================================================================
 * 基础组件
 * ========================================================================= */
const rim = (x, y, w, opacity = 0.08) => r({ x, y, w, h: 1.5, fill: '#ffffff', fillOpacity: opacity });

function panel(x, y, w, h, o = {}) {
  const rr = o.r ?? 16;
  const parts = [r({ x, y, w, h, r: rr, fill: o.fill ?? T.surface, stroke: o.stroke ?? T.line, sw: o.sw ?? 1, filter: o.filter, opacity: o.opacity })];
  if (o.rim !== false) parts.push(rim(x + rr * 0.6, y + 1, w - rr * 1.2, o.rimOpacity ?? 0.07));
  return parts.join('');
}

const aura = (cx, cy, rad, grad = 'auraWarm', opacity = 0.85) =>
  el('ellipse', { cx, cy, rx: rad, ry: rad * 0.82, fill: `url(#${grad})`, opacity });

function lantern(cx, cy, color, rad = 4) {
  return [
    el('circle', { cx, cy, r: rad * 3.2, fill: color, opacity: 0.16, filter: 'url(#glowSoft)' }),
    K.circle({ cx, cy, r: rad, fill: color }),
  ].join('');
}

/** 状态胶囊 */
function statePill(x, y, state, o = {}) {
  const label = o.label ?? STATE_LABEL[state];
  const color = T.state[state] ?? T.accent;
  const size = o.size ?? 13;
  const meta = o.meta;
  const h = o.h ?? (meta ? 42 : 32);
  const labelW = K.measure(label, size) + 8;
  const metaW = meta ? K.measure(meta, 10.5) : 0;
  const w = o.w ?? 28 + Math.max(labelW, metaW) + 12;
  const cy = y + h / 2;
  const parts = [
    r({ x, y, w, h, r: o.r ?? h / 2, fill: o.fill ?? 'url(#pillBg)', stroke: o.stroke ?? T.lineStrong, sw: 1, filter: o.filter ?? 'url(#controlShadow)' }),
    rim(x + h / 2, y + 1, w - h, 0.10),
    lantern(x + 17, cy, color, o.dot ?? 3.6),
  ];
  if (meta) {
    parts.push(t({ x: x + 30, y: cy - 7, s: label, size, weight: 600, family: F.ui, fill: T.text, baseline: 'middle' }));
    parts.push(t({ x: x + 30, y: cy + 9, s: meta, size: 10.5, family: F.mono, fill: T.faint, baseline: 'middle' }));
  } else {
    parts.push(t({ x: x + 30, y: cy + 0.5, s: label, size, weight: 600, family: F.ui, fill: T.text, baseline: 'middle' }));
  }
  return { svg: parts.join(''), w, h };
}

/** 线性图标 */
function glyph(kind, x, y, s, color, opacity = 1) {
  const c = { stroke: color, 'stroke-width': Math.max(1.2, s * 0.09), fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity };
  switch (kind) {
    case 'workbench':
      return [
        el('rect', { x: x + s * 0.10, y: y + s * 0.10, width: s * 0.34, height: s * 0.34, rx: 1.5, ...c }),
        el('rect', { x: x + s * 0.56, y: y + s * 0.10, width: s * 0.34, height: s * 0.34, rx: 1.5, ...c }),
        el('rect', { x: x + s * 0.10, y: y + s * 0.56, width: s * 0.34, height: s * 0.34, rx: 1.5, ...c }),
        el('path', { d: `M ${x + s * 0.56} ${y + s * 0.73} h ${s * 0.34} M ${x + s * 0.72} ${y + s * 0.56} v ${s * 0.34}`, ...c }),
      ].join('');
    case 'swap':
      return [
        el('path', { d: `M ${x + s * 0.16} ${y + s * 0.36} h ${s * 0.62} l ${-s * 0.15} ${-s * 0.15}`, ...c }),
        el('path', { d: `M ${x + s * 0.84} ${y + s * 0.64} h ${-s * 0.62} l ${s * 0.15} ${s * 0.15}`, ...c }),
      ].join('');
    case 'minus':
      return el('path', { d: `M ${x + s * 0.2} ${y + s * 0.5} h ${s * 0.6}`, ...c });
    case 'close':
      return el('path', { d: `M ${x + s * 0.28} ${y + s * 0.28} l ${s * 0.44} ${s * 0.44} M ${x + s * 0.72} ${y + s * 0.28} l ${-s * 0.44} ${s * 0.44}`, ...c });
    case 'search':
      return [
        K.circle({ cx: x + s * 0.44, cy: y + s * 0.44, r: s * 0.24, stroke: color, sw: s * 0.09, fill: 'none', opacity }),
        el('path', { d: `M ${x + s * 0.62} ${y + s * 0.62} l ${s * 0.2} ${s * 0.2}`, ...c }),
      ].join('');
    case 'chevron':
      return el('path', { d: `M ${x + s * 0.36} ${y + s * 0.40} l ${s * 0.16} ${s * 0.16} l ${-s * 0.16} ${s * 0.16}`, ...c });
    case 'plus':
      return el('path', { d: `M ${x + s / 2} ${y + s * 0.24} v ${s * 0.52} M ${x + s * 0.24} ${y + s / 2} h ${s * 0.52}`, ...c, 'stroke-width': Math.max(1.4, s * 0.1) });
    case 'drag':
      return [0, 1, 2].map((row) => [0, 1]
        .map((col) => K.circle({ cx: x + s * (0.36 + col * 0.28), cy: y + s * (0.3 + row * 0.2), r: Math.max(1, s * 0.05), fill: color, opacity }))
        .join('')).join('');
    case 'moon':
      return el('path', { d: `M ${x + s * 0.66} ${y + s * 0.24} a ${s * 0.30} ${s * 0.30} 0 1 0 0 ${s * 0.52} a ${s * 0.24} ${s * 0.24} 0 1 1 0 ${-s * 0.52} z`, fill: color, opacity });
    case 'check':
      return el('path', { d: `M ${x + s * 0.2} ${y + s * 0.52} l ${s * 0.2} ${s * 0.2} l ${s * 0.42} ${-s * 0.44}`, ...c, 'stroke-width': Math.max(1.6, s * 0.12) });
    case 'alert':
      return [
        K.circle({ cx: x + s / 2, cy: y + s / 2, r: s * 0.42, stroke: color, sw: s * 0.09, fill: 'none', opacity }),
        el('path', { d: `M ${x + s / 2} ${y + s * 0.26} v ${s * 0.28}`, ...c }),
        K.circle({ cx: x + s / 2, cy: y + s * 0.7, r: s * 0.055, fill: color, opacity }),
      ].join('');
    case 'spark':
      return el('path', { d: `M ${x + s * 0.5} ${y + s * 0.14} l ${s * 0.09} ${s * 0.26} l ${s * 0.26} ${s * 0.09} l ${-s * 0.26} ${s * 0.09} l ${-s * 0.09} ${s * 0.26} l ${-s * 0.09} ${-s * 0.26} l ${-s * 0.26} ${-s * 0.09} l ${s * 0.26} ${-s * 0.09} z`, fill: color, opacity });
    case 'download':
      return [
        el('path', { d: `M ${x + s * 0.5} ${y + s * 0.2} v ${s * 0.36}`, ...c }),
        el('path', { d: `M ${x + s * 0.34} ${y + s * 0.44} l ${s * 0.16} ${s * 0.16} l ${s * 0.16} ${-s * 0.16}`, ...c }),
        el('path', { d: `M ${x + s * 0.24} ${y + s * 0.74} h ${s * 0.52}`, ...c }),
      ].join('');
    case 'gem':
      return [
        el('path', { d: `M ${x + s * 0.5} ${y + s * 0.14} l ${s * 0.32} ${s * 0.26} l ${-s * 0.32} ${s * 0.46} l ${-s * 0.32} ${-s * 0.46} z`, ...c }),
        el('path', { d: `M ${x + s * 0.18} ${y + s * 0.40} h ${s * 0.64}`, ...c }),
      ].join('');
    default:
      return '';
  }
}

function orb(x, y, d, o = {}) {
  return [
    r({ x, y, w: d, h: d, r: d / 2, fill: o.fill ?? 'url(#pillBg)', stroke: o.stroke ?? T.lineStrong, sw: 1, filter: 'url(#controlShadow)' }),
    rim(x + d * 0.3, y + 1, d * 0.4, 0.10),
    o.icon ? glyph(o.icon, x + d * 0.27, y + d * 0.27, d * 0.46, o.iconColor ?? T.muted) : '',
  ].join('');
}

function toggle(x, y, on, o = {}) {
  const w = o.w ?? 40;
  const h = o.h ?? 22;
  return [
    r({ x, y, w, h, r: h / 2, fill: on ? T.accent : T.surfaceRaised, stroke: on ? T.accent : T.lineStrong, sw: 1 }),
    K.circle({ cx: on ? x + w - h / 2 : x + h / 2, cy: y + h / 2, r: h / 2 - 4, fill: on ? T.accentInk : T.muted }),
  ].join('');
}

function slider(x, y, w, value) {
  return [
    r({ x, y, w, h: 3, r: 1.5, fill: T.surfaceRaised, stroke: T.line }),
    r({ x, y, w: Math.max(6, w * value), h: 3, r: 1.5, fill: 'url(#primaryBg)' }),
    K.circle({ cx: x + w * value, cy: y + 1.5, r: 14, fill: T.accent, opacity: 0.13, filter: 'url(#glowSoft)' }),
    K.circle({ cx: x + w * value, cy: y + 1.5, r: 7.5, fill: '#f9efe3' }),
    K.circle({ cx: x + w * value, cy: y + 1.5, r: 7.5, fill: 'none', stroke: T.accent, sw: 2 }),
  ].join('');
}

const primaryBtn = (x, y, w, label, h = 40, size = 13) =>
  K.button({ x, y, w, h, label, size, variant: 'primary', primaryFill: 'url(#primaryBg)', primaryText: T.accentInk, weight: 600, r: 10 }).svg;
const ghostBtn = (x, y, w, label, h = 40, size = 12.5) =>
  K.button({ x, y, w, h, label, size, variant: 'ghost', ghostStroke: T.lineStrong, text: T.text, r: 10 }).svg;

function divider(gapTop = 36, gapBottom = 36) {
  sh.y += gapTop;
  sh.raw(r({ x: pad, y: sh.y, w: INNER, h: 1, fill: T.line }), gapBottom);
}

/* =========================================================================
 * 封面
 * ========================================================================= */
sh.raw(aura(300, 140, 520, 'auraWarm', 0.35), 0);
sh.header({
  kicker: 'LINGPET / 灵伴 · 方案 B',
  title: '暖光夜桌',
  subtitle: '把桌宠当作深夜书桌上的一盏灯：深棕夜色、玻璃卡片、随状态换色的暖光。界面为陪伴让路，只在角色与状态上用力。',
  keywords: ['夜间', '暖光', '玻璃', '呼吸感'],
  palette: [T.accent, T.surface, T.text, T.done, T.error],
  familyTitle: F.display,
  familyKicker: F.mono,
  familyUI: F.ui,
  colors: { kicker: T.accent, title: T.text, subtitle: T.muted, chipFill: 'none', chipStroke: T.lineStrong, chipText: '#d8c9b8' },
  footer: 'WARM NIGHT DESK / 灵伴 2026 · 为透明窗口与长时间陪伴优化',
});

/* =========================================================================
 * 01 桌面浮层
 * ========================================================================= */
sh.section({ index: 1, title: '桌面浮层', note: '透明窗口 · 光随状态走 · 八态语言', color: T.text, noteColor: T.faint });

const sceneX = pad;
const sceneY = sh.y;
const sceneW = INNER;
const sceneH = 640;
const petW = 294;
const petH = Math.round(petW * 341 / 256);
const petCX = sceneX + sceneW - 292;
const petX = petCX - petW / 2;
const petY = sceneY + 104;

const scene = [];
scene.push(`<clipPath id="sceneClip"><rect x="${sceneX}" y="${sceneY}" width="${sceneW}" height="${sceneH}" rx="18"/></clipPath>`);
scene.push(el('g', { 'clip-path': 'url(#sceneClip)' }, [
  r({ x: sceneX, y: sceneY, w: sceneW, h: sceneH, fill: 'url(#desktopBg)' }),
  aura(sceneX + 360, sceneY + 560, 460, 'auraWarm', 0.14),
  aura(sceneX + sceneW - 160, sceneY + 90, 340, 'auraCool', 0.12),
  r({ x: sceneX, y: sceneY, w: sceneW, h: sceneH, fill: 'url(#dotGrid)' }),
].join('')));

// ── 桌面上半掩的编辑器
const edX = sceneX + 64;
const edY = sceneY + 66;
const edW = 540;
const edH = 386;
scene.push(el('g', { filter: 'url(#panelShadow)' }, [
  r({ x: edX, y: edY, w: edW, h: edH, r: 12, fill: '#0f1117', stroke: '#232733', sw: 1 }),
  r({ x: edX, y: edY, w: edW, h: 34, r: 12, fill: '#151821' }),
  r({ x: edX, y: edY + 24, w: edW, h: 10, fill: '#151821' }),
  K.circle({ cx: edX + 18, cy: edY + 17, r: 4, fill: '#3c4356' }),
  K.circle({ cx: edX + 32, cy: edY + 17, r: 4, fill: '#3c4356' }),
  K.circle({ cx: edX + 46, cy: edY + 17, r: 4, fill: '#3c4356' }),
  t({ x: edX + 68, y: edY + 21, s: 'renderer.js', size: 10, family: F.mono, fill: '#6d7688' }),
  t({ x: edX + 162, y: edY + 21, s: 'pet.js', size: 10, family: F.mono, fill: '#454b5c' }),
].join('')));
scene.push(r({ x: edX, y: edY + 34, w: 38, h: edH - 34, fill: '#12141b' }));
['workbench', 'search', 'gem', 'spark'].forEach((k, i) => {
  scene.push(glyph(k, edX + 11, edY + 50 + i * 34, 16, i === 0 ? T.accent : '#4b5263', i === 0 ? 1 : 0.8));
});
const codeColors = ['#5b7ea8', '#7d9a7c', '#a98b6a', '#8b729f', '#5f6b7a'];
const codeLines = [[0, 200], [1, 140], [2, 250], [3, 180], [4, 290], [1, 230], [2, 160], [0, 270], [3, 200], [4, 120], [2, 240], [1, 170]];
scene.push(codeLines.map(([ci, w], i) => {
  const y = edY + 60 + i * 25;
  const x = edX + 66 + (i % 4 === 0 ? 0 : 24);
  const len = Math.min(w, edW - 100);
  return [
    i === 5 ? r({ x: edX + 46, y: y - 13, w: edW - 56, h: 23, r: 4, fill: '#ffffff', fillOpacity: 0.035 }) : '',
    t({ x: edX + 50, y, s: String(i + 1), size: 9, family: F.mono, fill: '#3d4353' }),
    r({ x, y: y - 9, w: len, h: 6.5, r: 3.25, fill: codeColors[ci], opacity: 0.55 }),
    r({ x: x + len + 8, y: y - 9, w: 30, h: 6.5, r: 3.25, fill: '#8b729f', opacity: 0.3 }),
  ].join('');
}).join(''));
scene.push(r({ x: edX + 38, y: edY + edH - 26, w: edW - 38, h: 26, fill: '#101219' }));
scene.push(t({ x: edX + 52, y: edY + edH - 9, s: 'main · UTF-8 · js', size: 9, family: F.mono, fill: '#3f4552' }));
scene.push(t({ x: edX + edW - 14, y: edY + edH - 9, s: 'Ln 42, Col 18', size: 9, family: F.mono, fill: '#3f4552', anchor: 'end' }));

// ── 任务栏
scene.push(r({ x: sceneX, y: sceneY + sceneH - 42, w: sceneW, h: 42, fill: '#08080b', opacity: 0.9 }));
scene.push(r({ x: sceneX, y: sceneY + sceneH - 42, w: sceneW, h: 1, fill: '#ffffff', fillOpacity: 0.06 }));
['workbench', 'gem', 'search', 'spark'].forEach((k, i) => {
  const x = sceneX + 30 + i * 44;
  const y = sceneY + sceneH - 29;
  scene.push(i === 1 ? r({ x: x - 9, y: y - 8, w: 34, h: 34, r: 9, fill: '#ffffff', fillOpacity: 0.07 }) : '');
  scene.push(glyph(k, x, y, 16, i === 1 ? T.accent : '#5d6472', i === 1 ? 1 : 0.8));
});
scene.push(t({ x: sceneX + sceneW - 30, y: sceneY + sceneH - 21, s: '22:41', size: 11, family: F.mono, fill: '#5d6472', anchor: 'end' }));

// ── 桌宠本体
scene.push(aura(petCX, petY + petH * 0.54, 250, 'auraWarm', 0.95));
scene.push(el('ellipse', { cx: petCX, cy: petY + petH - 4, rx: 104, ry: 15, fill: '#000000', opacity: 0.45, filter: 'url(#glowSoft)' }));
scene.push(K.sprite({ name: 'deepseek-working', x: petX, y: petY, w: petW, h: petH }));

// ── 状态胶囊 / 互动气泡 / hover 操作条
scene.push(statePill(petCX + 30, petY - 44, 'working', { meta: 'cursor · 3.2s' }).svg);
const bx = petCX - 470;
const by = petY + 52;
scene.push(el('g', { filter: 'url(#cardShadow)' }, [
  r({ x: bx, y: by, w: 300, h: 104, r: 16, fill: 'url(#bubbleBg)' }),
  el('path', { d: `M ${bx + 268} ${by + 74} l 22 26 l 4 -28 z`, fill: '#f3e5d0' }),
  t({ x: bx + 22, y: by + 36, s: '改完了，要看看吗？', size: 15.5, family: F.display, weight: 600, fill: '#3a2b21' }),
  t({ x: bx + 22, y: by + 64, s: '3 个文件 · 已通过检查', size: 10.5, family: F.mono, fill: '#8a7561' }),
  t({ x: bx + 22, y: by + 86, s: '双击气泡 → 打开工作台', size: 10, family: F.ui, fill: '#a08a72' }),
].join('')));
const barY = petY + petH + 16;
const orbD = 44;
const barX = petCX - (orbD * 3 + 28) / 2;
scene.push([
  orb(barX, barY, orbD, { icon: 'workbench' }),
  orb(barX + orbD + 14, barY, orbD, { icon: 'swap' }),
  orb(barX + (orbD + 14) * 2, barY, orbD, { icon: 'minus' }),
  t({ x: petCX + 96, y: barY + 27, s: 'hover 才出现', size: 9.5, family: F.mono, fill: T.faint, ls: 1 }),
].join(''));

// ── 编号角标
const badges = [
  { x: petCX + 168, y: petY + 34, n: '1' },
  { x: petCX + 20, y: petY - 52, n: '2' },
  { x: bx + 306, y: by + 12, n: '3' },
  { x: barX + 20, y: barY + 46, n: '4' },
];
badges.forEach((b) => {
  scene.push(K.circle({ cx: b.x, cy: b.y, r: 9, fill: T.accent }));
  scene.push(t({ x: b.x, y: b.y + 0.5, s: b.n, size: 10, weight: 700, family: F.mono, fill: T.accentInk, anchor: 'middle', baseline: 'middle' }));
});
scene.push(r({ x: sceneX, y: sceneY, w: sceneW, h: sceneH, r: 18, fill: 'none', stroke: T.lineStrong, sw: 1 }));
sh.raw(scene.join(''), sceneH + 30);

// 图例
const legend = [
  ['1', '光晕', '状态色驱动，半径与节奏随状态变化'],
  ['2', '状态胶囊', '状态词 + 会话 + 耗时，玻璃底与呼吸灯'],
  ['3', '互动气泡', '只在需要你的时候说话，奶油纸感'],
  ['4', '操作条', 'hover 浮出：工作台 / 换角色 / 隐藏'],
];
sh.raw(legend.map(([n, title, desc], i) => {
  const x = pad + i * (INNER / 4);
  return [
    K.circle({ cx: x + 8, cy: sh.y + 10, r: 8, fill: T.accentSoft, stroke: T.line }),
    t({ x: x + 8, y: sh.y + 10.5, s: n, size: 9.5, weight: 700, family: F.mono, fill: T.accent, anchor: 'middle', baseline: 'middle' }),
    t({ x: x + 24, y: sh.y + 7, s: title, size: 11.5, weight: 600, family: F.ui, fill: T.text }),
    L({ x: x + 24, y: sh.y + 24, lines: K.wrap(desc, 10, INNER / 4 - 34), size: 10, lineHeight: 15, family: F.ui, fill: T.faint }),
  ].join('');
}).join(''), 52);

// 三态小样
const cards = [
  { state: 'thinking', aura: 'auraWarm', meta: 'thinking', note: '光晕收窄，呼吸 2.4s 加快；三点省略号循环' },
  { state: 'approval', aura: 'auraWarm', meta: 'approval', note: '琥珀透出，浮出确认卡（✓ / ✕），不接受超时' },
  { state: 'error', aura: 'auraRed', meta: 'error', note: '红光短促闪两次；气泡描边转红，附重试入口' },
];
const scW = (INNER - 40) / 3;
const scH = 272;
const scY = sh.y;
sh.raw(cards.map((card, i) => {
  const x = pad + i * (scW + 20);
  const cx = x + scW / 2;
  const color = T.state[card.state];
  const body = [
    `<clipPath id="clipState${i}"><rect x="${x}" y="${scY}" width="${scW}" height="${scH}" rx="16"/></clipPath>`,
    el('g', { 'clip-path': `url(#clipState${i})` }, [
      r({ x, y: scY, w: scW, h: scH, fill: 'url(#desktopBg)' }),
      aura(cx, scY + 158, 156, card.aura, 0.85),
      r({ x, y: scY, w: scW, h: scH, fill: 'url(#dotGrid)' }),
    ].join('')),
    t({ x: x + 18, y: scY + 26, s: card.meta, size: 9.5, family: F.mono, fill: color, ls: 1.4 }),
    K.sprite({ name: `deepseek-${card.state}`, x: cx - 60, y: scY + 44, w: 120, h: 160 }),
    statePill(cx - 56, scY + 214, card.state, { size: 11.5, h: 28 }),
  ];
  if (card.state === 'thinking') {
    body.push(r({ x: x + scW - 78, y: scY + 14, w: 60, h: 24, r: 12, fill: T.surfaceAlt, stroke: T.line }));
    [0, 1, 2].forEach((d) => body.push(K.circle({ cx: x + scW - 58 + d * 12, cy: scY + 26, r: 2.6, fill: T.accent, opacity: [0.9, 0.6, 0.35][d] })));
  }
  if (card.state === 'approval') {
    body.push(el('g', { filter: 'url(#controlShadow)' }, [
      r({ x: cx + 64, y: scY + 104, w: 158, h: 84, r: 12, fill: 'url(#pillBg)', stroke: T.lineStrong }),
      t({ x: cx + 78, y: scY + 128, s: '需要你确认一下', size: 11, weight: 600, family: F.ui, fill: T.text }),
      r({ x: cx + 78, y: scY + 142, w: 62, h: 24, r: 7, fill: T.accent }),
      t({ x: cx + 109, y: scY + 154, s: '允许', size: 10.5, weight: 600, family: F.ui, fill: T.accentInk, anchor: 'middle', baseline: 'middle' }),
      r({ x: cx + 148, y: scY + 142, w: 62, h: 24, r: 7, fill: 'none', stroke: T.lineStrong }),
      t({ x: cx + 179, y: scY + 154, s: '拒绝', size: 10.5, family: F.ui, fill: T.muted, anchor: 'middle', baseline: 'middle' }),
    ].join('')));
  }
  if (card.state === 'error') {
    body.push(el('g', { filter: 'url(#controlShadow)' }, [
      r({ x: cx + 64, y: scY + 108, w: 158, h: 74, r: 12, fill: '#241312', stroke: '#5e2c2a' }),
      K.circle({ cx: cx + 79, cy: scY + 130, r: 3.4, fill: T.error }),
      t({ x: cx + 89, y: scY + 134, s: '工具执行失败', size: 10.5, weight: 600, family: F.ui, fill: '#f3cfcd' }),
      t({ x: cx + 79, y: scY + 154, s: 'exit code 1', size: 9, family: F.mono, fill: '#a8807d' }),
      t({ x: cx + 208, y: scY + 158, s: '重试', size: 10, family: F.ui, fill: T.error, anchor: 'end' }),
    ].join('')));
  }
  body.push(t({ x, y: scY + scH + 26, s: card.note, size: 10.5, family: F.ui, fill: T.muted }));
  return body.join('');
}).join(''), scH + 62);

divider(10, 30);

/* =========================================================================
 * 02 快捷控制
 * ========================================================================= */
sh.section({ index: 2, title: '快捷控制', note: '右键弹层 · 贴着光标也要有质感', color: T.text, noteColor: T.faint });

const qcY = sh.y;
const popW = 356;
const popH = 566;
const popX = pad;
const pop = [
  el('g', { filter: 'url(#panelShadow)' }, [
    r({ x: popX, y: qcY, w: popW, h: popH, r: 18, fill: 'url(#winBg)', stroke: T.lineStrong }),
    rim(popX + 22, qcY + 1, popW - 44, 0.09),
  ].join('')),
  t({ x: popX + 22, y: qcY + 34, s: '灵伴 · 快捷控制', size: 14, weight: 600, family: F.ui, fill: T.text }),
  t({ x: popX + 22, y: qcY + 54, s: '4 只桌宠在运行', size: 10.5, family: F.mono, fill: T.faint }),
  glyph('close', popX + popW - 42, qcY + 20, 17, T.faint),
];
const pets = [
  { name: 'Cursor 桌宠', meta: 'Claude · 像素 · 已显示', sprite: 'claude-idle' },
  { name: 'DSH 桌宠', meta: 'DeepSeek · 像素 · 已显示', sprite: 'deepseek-idle' },
  { name: 'Codex 桌宠', meta: 'Claude · 像素 · 已显示', sprite: 'claude-thinking' },
  { name: '固定会话', meta: '鲸鱼娘 · 像素 · 已显示', sprite: 'deepseek-sleep' },
];
pets.forEach((p, i) => {
  const y = qcY + 70 + i * 58;
  const selected = i === 0;
  if (selected) pop.push(r({ x: popX + 12, y, w: popW - 24, h: 52, r: 12, fill: T.accentSoft, stroke: T.accent, sw: 1, strokeOpacity: 0.45 }));
  if (selected) pop.push(r({ x: popX + 12, y: y + 11, w: 2.5, h: 30, r: 1.25, fill: T.accent }));
  pop.push(r({ x: popX + 26, y: y + 7, w: 34, h: 38, r: 9, fill: selected ? '#2a211a' : T.surfaceRaised, stroke: T.line }));
  pop.push(K.sprite({ name: p.sprite, x: popX + 29, y: y + 9, w: 28, h: 34 }));
  pop.push(t({ x: popX + 74, y: y + 23, s: p.name, size: 12.5, weight: 600, family: F.ui, fill: T.text }));
  pop.push(t({ x: popX + 74, y: y + 40, s: p.meta, size: 9.5, family: F.ui, fill: T.faint }));
  if (selected) pop.push(statePill(popX + popW - 152, y + 13, 'working', { size: 9.5, h: 26, w: 72, dot: 3 }).svg);
  pop.push(toggle(popX + popW - 46, y + 17, true, { w: 30, h: 17 }));
});
pop.push(r({ x: popX + 22, y: qcY + 314, w: popW - 44, h: 1, fill: T.line }));
pop.push(t({ x: popX + 22, y: qcY + 344, s: '大小', size: 11.5, family: F.ui, fill: T.muted }));
pop.push(t({ x: popX + popW - 22, y: qcY + 344, s: '中 · 1.0x', size: 10, family: F.mono, fill: T.accent, anchor: 'end' }));
pop.push(slider(popX + 26, qcY + 362, popW - 52, 0.56));
['小', '中', '大'].forEach((s, i) => pop.push(t({ x: popX + 28 + i * (popW - 62) / 2, y: qcY + 388, s, size: 9.5, family: F.ui, fill: T.faint })));
pop.push(t({ x: popX + 22, y: qcY + 422, s: '显示桌宠', size: 11.5, family: F.ui, fill: T.text }));
pop.push(t({ x: popX + 22, y: qcY + 439, s: '关闭后仍保留在后台', size: 9.5, family: F.ui, fill: T.faint }));
pop.push(toggle(popX + popW - 62, qcY + 412, true));
pop.push(t({ x: popX + 22, y: qcY + 472, s: '会话跟随', size: 11.5, family: F.ui, fill: T.text }));
pop.push(t({ x: popX + 22, y: qcY + 489, s: 'Cursor / Codex / DSH 自动同步', size: 9.5, family: F.ui, fill: T.faint }));
pop.push(toggle(popX + popW - 62, qcY + 462, true));
pop.push(r({ x: popX + 22, y: qcY + 508, w: popW - 44, h: 1, fill: T.line }));
pop.push(primaryBtn(popX + 22, qcY + 520, popW - 44, '进入工作台', 36, 12.5));
sh.raw(pop.join(''), popH + 20);

// 控制条
const cbX = pad + popW + 40;
const cbY = qcY + 6;
const cbW = 330;
const cbH = 86;
sh.raw([
  el('g', { filter: 'url(#controlShadow)' }, [
    r({ x: cbX, y: cbY, w: cbW, h: cbH, r: 14, fill: 'url(#pillBg)', stroke: T.lineStrong }),
    rim(cbX + 18, cbY + 1, cbW - 36, 0.10),
  ].join('')),
  glyph('drag', cbX + 11, cbY + 35, 16, T.faint),
  statePill(cbX + 32, cbY + 12, 'working', { size: 11, h: 28, label: '执行工具' }).svg,
  t({ x: cbX + 32, y: cbY + 62, s: 'Cursor · cursor-task', size: 10, family: F.mono, fill: T.faint }),
  orb(cbX + cbW - 50, cbY + 25, 36, { icon: 'minus', stroke: T.line }),
  t({ x: cbX, y: cbY + cbH + 30, s: '拖拽控制条', size: 13, weight: 600, family: F.ui, fill: T.text }),
  L({ x: cbX, y: cbY + cbH + 52, lines: ['贴边细条，默认 25% 不透明度，hover 到 100%。', '圆点把手让「可拖」这件事可被看见。'], size: 10.5, lineHeight: 18, family: F.ui, fill: T.faint }),
].join(''), 0);

// 细节清单
const listX = cbX + cbW + 48;
const listW = pad + INNER - listX;
const details = [
  ['玻璃与描边', '1px 暖灰描边 + 顶部 1.5px 内高光，深背景下才有厚度；不用 backdrop-filter，改高不透明底色 + 渐变，省 GPU。'],
  ['发光只给状态', '只有状态灯与角色光环发光；按钮、卡片、选中态一律不发光，避免满屏光污染。'],
  ['滚动区', '超过 6 只桌宠时列表内部滚动，上下边缘各 24px 渐隐，滚动条 3px 半透明。'],
  ['命中区', '行高 58px，缩略图 38px；右键在光标处弹出，距屏幕边缘 12px 自动翻转。'],
];
sh.raw(details.map(([title, desc], i) => {
  const y = qcY + 40 + i * 116;
  return [
    r({ x: listX, y: y - 12, w: 46, h: 46, r: 13, fill: T.accentSoft, stroke: T.line }),
    t({ x: listX + 23, y: y + 12, s: String(i + 1).padStart(2, '0'), size: 11, family: F.mono, fill: T.accent, anchor: 'middle', baseline: 'middle' }),
    t({ x: listX + 62, y, s: title, size: 12.5, weight: 600, family: F.ui, fill: T.text }),
    L({ x: listX + 62, y: y + 22, lines: K.wrap(desc, 10.8, listW - 76), size: 10.8, lineHeight: 18, family: F.ui, fill: T.muted }),
  ].join('');
}).join(''), 0);

divider(10, 30);

/* =========================================================================
 * 03 工作台
 * ========================================================================= */
sh.section({ index: 3, title: '工作台', note: '1130×850 主界面 · 信息层级与焦点', color: T.text, noteColor: T.faint });

const winY = sh.y;
const winW = INNER;
const winH = 946;
const sideW = 280;
const cx = pad + sideW + 36;
const contentW = winW - sideW - 72;
const previewW = 520;
const colX = cx + previewW + 24;
const colW = contentW - previewW - 24;

const win = [];
win.push(`<clipPath id="winClip"><rect x="${pad}" y="${winY}" width="${winW}" height="${winH}" rx="18"/></clipPath>`);
win.push(el('g', { filter: 'url(#panelShadow)' }, [r({ x: pad, y: winY, w: winW, h: winH, r: 18, fill: 'url(#winBg)', stroke: T.lineStrong })]));
win.push(el('g', { 'clip-path': 'url(#winClip)' }, [
  r({ x: pad, y: winY, w: sideW, h: winH, fill: 'url(#sideBg)' }),
  r({ x: pad + sideW, y: winY, w: 1, h: winH, fill: T.line }),
  rim(pad + 20, winY + 1, winW - 40, 0.06),
].join('')));

// 侧栏：品牌
win.push(r({ x: pad + 30, y: winY + 30, w: 46, h: 46, r: 14, fill: 'url(#primaryBg)' }));
win.push(aura(pad + 53, winY + 52, 46, 'auraWarm', 0.7));
win.push(t({ x: pad + 53, y: winY + 63, s: '灵', size: 24, weight: 700, family: F.display, fill: T.accentInk, anchor: 'middle' }));
win.push(t({ x: pad + 90, y: winY + 53, s: '灵伴', size: 21, weight: 700, family: F.display, fill: T.text }));
win.push(t({ x: pad + 90, y: winY + 73, s: 'LINGPET', size: 8.5, family: F.mono, fill: T.faint, ls: 2.6 }));

// 侧栏：导航
[['桌宠工作台', true], ['桌宠市场', false]].forEach(([label, active], i) => {
  const y = winY + 122 + i * 46;
  if (active) {
    win.push(r({ x: pad + 18, y, w: 244, h: 40, r: 11, fill: '#ffffff', fillOpacity: 0.045 }));
    win.push(r({ x: pad + 18, y: y + 9, w: 2.5, h: 22, r: 1.25, fill: T.accent }));
    win.push(K.circle({ cx: pad + 22, cy: y + 20, r: 13, fill: T.accent, opacity: 0.16, filter: 'url(#glowSoft)' }));
  }
  win.push(t({ x: pad + 36, y: y + 25, s: label, size: 12.5, weight: active ? 600 : 400, family: F.ui, fill: active ? T.text : T.muted }));
});

// 侧栏：我的桌宠
win.push(t({ x: pad + 30, y: winY + 230, s: '我的桌宠', size: 10, family: F.mono, fill: T.faint, ls: 1.6 }));
win.push(t({ x: pad + 262, y: winY + 230, s: '4', size: 10, family: F.mono, fill: T.faint, anchor: 'end' }));
const sidePets = [
  { name: 'Cursor 桌宠', meta: 'Claude · 像素', sprite: 'claude-idle', active: true },
  { name: 'DSH 桌宠', meta: 'DeepSeek · 像素', sprite: 'deepseek-idle' },
  { name: 'Codex 桌宠', meta: 'Claude · 像素', sprite: 'claude-thinking' },
  { name: '固定会话', meta: '鲸鱼娘 · 像素', sprite: 'deepseek-sleep' },
];
sidePets.forEach((p, i) => {
  const y = winY + 248 + i * 60;
  if (p.active) win.push(r({ x: pad + 16, y, w: 248, h: 54, r: 12, fill: T.accentSoft, stroke: T.accent, sw: 1, strokeOpacity: 0.4 }));
  win.push(r({ x: pad + 28, y: y + 8, w: 32, h: 38, r: 8, fill: p.active ? '#2e241b' : T.surfaceRaised, stroke: T.line }));
  win.push(K.sprite({ name: p.sprite, x: pad + 31, y: y + 10, w: 26, h: 34 }));
  win.push(t({ x: pad + 70, y: y + 24, s: p.name, size: 12, weight: 600, family: F.ui, fill: p.active ? '#f7e6d2' : T.text }));
  win.push(t({ x: pad + 70, y: y + 41, s: p.meta, size: 9.5, family: F.ui, fill: T.faint }));
  win.push(t({ x: pad + 246, y: y + 32, s: '删除', size: 9, family: F.ui, fill: T.faint, anchor: 'end', opacity: p.active ? 1 : 0.55 }));
});

// 侧栏：底部
win.push(K.button({ x: pad + 20, y: winY + 806, w: 240, h: 40, label: '+ 新增桌宠', size: 12, variant: 'ghost', ghostStroke: T.lineStrong, text: T.text, r: 11 }).svg);
win.push(L({ x: pad + 26, y: winY + 878, lines: ['拖动桌宠可移动位置', '右键桌宠可打开快捷控制'], size: 9.5, lineHeight: 17, family: F.ui, fill: T.faint, opacity: 0.8 }));

// 主区：标题
win.push(t({ x: cx, y: winY + 46, s: '灵伴 / 桌宠管理', size: 9.5, family: F.mono, fill: T.faint, ls: 1.2 }));
win.push(t({ x: cx, y: winY + 88, s: '桌宠工作台', size: 30, weight: 700, family: F.display, fill: T.text }));
win.push(t({ x: cx, y: winY + 114, s: '选择一位伙伴，设置它的外观和跟随方式。', size: 12.5, family: F.ui, fill: T.muted }));
const connW = K.measure('Codex / Cursor / DSH 已连接 · 3', 11) + 40;
win.push(r({ x: pad + winW - 36 - connW, y: winY + 40, w: connW, h: 32, r: 16, fill: T.surfaceAlt, stroke: T.line }));
win.push(lantern(pad + winW - 36 - connW + 16, winY + 56, T.done, 3.4));
win.push(t({ x: pad + winW - 36 - connW + 28, y: winY + 57, s: 'Codex / Cursor / DSH 已连接 · 3', size: 11, family: F.ui, fill: T.muted, baseline: 'middle' }));

// 预览面板
const pvX = cx;
const pvY = winY + 140;
const pvH = 646;
win.push(panel(pvX, pvY, previewW, pvH, { r: 16, fill: T.surface, stroke: T.line }));
win.push(t({ x: pvX + 24, y: pvY + 34, s: '实时预览', size: 14.5, weight: 600, family: F.ui, fill: T.text }));
win.push(t({ x: pvX + previewW - 24, y: pvY + 34, s: '鲸鱼娘 / PIXEL 192', size: 9.5, family: F.mono, fill: T.faint, anchor: 'end' }));
const stX = pvX + 20;
const stY = pvY + 56;
const stW = previewW - 40;
const stH = 376;
win.push(`<clipPath id="stageClip"><rect x="${stX}" y="${stY}" width="${stW}" height="${stH}" rx="14"/></clipPath>`);
win.push(el('g', { 'clip-path': 'url(#stageClip)' }, [
  r({ x: stX, y: stY, w: stW, h: stH, fill: 'url(#stageBg)' }),
  aura(stX + stW / 2, stY + 252, 230, 'auraWarm', 0.9),
  K.circle({ cx: stX + stW / 2, cy: stY + 206, r: 168, fill: 'none', stroke: T.accent, strokeOpacity: 0.16, sw: 1, dash: '2 7' }),
  K.circle({ cx: stX + stW / 2, cy: stY + 206, r: 126, fill: 'none', stroke: T.accent, strokeOpacity: 0.10, sw: 1 }),
  el('ellipse', { cx: stX + stW / 2, cy: stY + 352, rx: 96, ry: 14, fill: '#000', opacity: 0.4, filter: 'url(#glowSoft)' }),
  r({ x: stX, y: stY, w: stW, h: stH, fill: 'url(#dotGrid)' }),
].join('')));
win.push(K.sprite({ name: 'deepseek-working', x: stX + stW / 2 - 104, y: stY + 44, w: 208, h: 274 }));
win.push(statePill(stX + stW / 2 - 76, stY + 330, 'working', { size: 11.5, h: 30, w: 152, label: '执行工具 · 2 个工具' }).svg);
win.push(t({ x: pvX + previewW / 2, y: pvY + 470, s: 'Cursor · 会话 cursor-task', size: 10, family: F.mono, fill: T.faint, anchor: 'middle' }));
win.push(primaryBtn(pvX + 24, pvY + 494, previewW - 48, '隐藏桌宠', 44, 13.5));
win.push(t({ x: pvX + 24, y: pvY + 580, s: '大小', size: 11.5, family: F.ui, fill: T.muted }));
win.push(t({ x: pvX + previewW - 24, y: pvY + 580, s: '中 · 1.0x', size: 10, family: F.mono, fill: T.accent, anchor: 'end' }));
win.push(slider(pvX + 26, pvY + 598, previewW - 52, 0.56));
['小', '中', '大'].forEach((s, i) => win.push(t({ x: pvX + 28 + i * (previewW - 56) / 2, y: pvY + 622, s, size: 9.5, family: F.ui, fill: T.faint })));

// 右列：tab
const tbY = winY + 140;
win.push(r({ x: colX, y: tbY, w: colW, h: 44, r: 12, fill: T.surfaceAlt, stroke: T.line }));
[['外观与显示', true], ['会话跟随', false]].forEach(([label, active], i) => {
  const w = (colW - 8) / 2;
  const x = colX + 4 + i * w;
  if (active) win.push(r({ x, y: tbY + 4, w, h: 36, r: 9, fill: T.surfaceRaised, stroke: T.lineStrong }));
  win.push(t({ x: x + w / 2, y: tbY + 23, s: label, size: 12, weight: active ? 600 : 400, family: F.ui, fill: active ? T.text : T.muted, anchor: 'middle', baseline: 'middle' }));
});

// 选择角色
win.push(t({ x: colX, y: winY + 222, s: '选择角色', size: 13.5, weight: 600, family: F.ui, fill: T.text }));
win.push(t({ x: colX + colW, y: winY + 222, s: '点击切换', size: 10, family: F.ui, fill: T.faint, anchor: 'end' }));
const roles = [
  { name: 'Claude', meta: '1 个形象', sel: false },
  { name: 'DeepSeek', meta: '1 个形象', sel: true },
  { name: 'ChatGPT', meta: '2 个形象', sel: false },
];
const cardW = (colW - 16) / 2;
const cardH = 92;
roles.forEach((role, i) => {
  const x = colX + (i % 2) * (cardW + 16);
  const y = winY + 240 + Math.floor(i / 2) * (cardH + 14);
  win.push(r({ x, y, w: cardW, h: cardH, r: 14, fill: role.sel ? '#2a211a' : T.surfaceAlt, stroke: role.sel ? T.accent : T.line, sw: role.sel ? 1.2 : 1, strokeOpacity: role.sel ? 0.8 : 1 }));
  if (role.sel) win.push(rim(x + 14, y + 1, cardW - 28, 0.12));
  win.push(t({ x: x + 20, y: y + 35, s: role.name, size: 13.5, weight: 600, family: F.ui, fill: role.sel ? '#f7e6d2' : T.text }));
  win.push(t({ x: x + 20, y: y + 56, s: role.meta, size: 10.5, family: F.ui, fill: T.faint }));
  if (role.sel) win.push(glyph('check', x + cardW - 34, y + 16, 16, T.accent));
});
const moreX = colX + (cardW + 16);
const moreY = winY + 240 + (cardH + 14);
win.push(r({ x: moreX, y: moreY, w: cardW, h: cardH, r: 14, fill: 'none', stroke: T.line, dash: '4 5' }));
win.push(glyph('plus', moreX + 20, moreY + 34, 16, T.faint));
win.push(t({ x: moreX + 44, y: moreY + 47, s: '更多角色', size: 12, family: F.ui, fill: T.faint, baseline: 'middle' }));
win.push(t({ x: moreX + 20, y: moreY + 74, s: '敬请期待', size: 9.5, family: F.mono, fill: T.faint, opacity: 0.8 }));

// 选择形象
win.push(t({ x: colX, y: winY + 494, s: '选择形象', size: 13.5, weight: 600, family: F.ui, fill: T.text }));
win.push(t({ x: colX + colW, y: winY + 494, s: '1 个已保留', size: 10, family: F.ui, fill: T.faint, anchor: 'end' }));
win.push(r({ x: colX, y: winY + 510, w: colW, h: 152, r: 14, fill: T.surfaceAlt, stroke: T.line }));
win.push(r({ x: colX + 14, y: winY + 524, w: 160, h: 124, r: 11, fill: 'url(#coverB)', stroke: T.line }));
win.push(aura(colX + 94, winY + 574, 76, 'auraWarm', 0.6));
win.push(K.sprite({ name: 'deepseek-hd', x: colX + 36, y: winY + 526, w: 116, h: 116 }));
win.push(r({ x: colX + 190, y: winY + 540, w: 58, h: 22, r: 6, fill: T.accent, fillOpacity: 0.16, stroke: T.accent, strokeOpacity: 0.55 }));
win.push(glyph('check', colX + 197, winY + 545, 11, T.accent));
win.push(t({ x: colX + 213, y: winY + 556, s: '已保存', size: 10, weight: 600, family: F.ui, fill: T.accent, baseline: 'middle' }));
win.push(t({ x: colX + 190, y: winY + 600, s: '鲸鱼娘', size: 15, weight: 600, family: F.ui, fill: T.text }));
win.push(t({ x: colX + 190, y: winY + 622, s: '原图 / 像素 · 512 × 512', size: 10, family: F.mono, fill: T.faint }));
['原图', '像素'].forEach((s, i) => {
  const x = colX + 190 + i * 78;
  win.push(r({ x, y: winY + 632, w: 68, h: 26, r: 8, fill: i === 1 ? T.accentSoft : 'none', stroke: i === 1 ? T.accent : T.lineStrong, sw: 1 }));
  win.push(t({ x: x + 34, y: winY + 646, s, size: 10, family: F.ui, fill: i === 1 ? T.accent : T.muted, anchor: 'middle', baseline: 'middle' }));
});

// 开关组
win.push(r({ x: colX, y: winY + 678, w: colW, h: 1, fill: T.line }));
[['全屏时自动隐藏', '避免游戏 / 演示时挡视线', true], ['始终置顶', '盖在其他窗口之上', true]].forEach(([label, desc, on], i) => {
  const y = winY + 694 + i * 48;
  win.push(t({ x: colX, y: y + 14, s: label, size: 12, family: F.ui, fill: T.text }));
  win.push(t({ x: colX, y: y + 32, s: desc, size: 10, family: F.ui, fill: T.faint }));
  win.push(toggle(colX + colW - 44, y + 8, on));
});
win.push(r({ x: colX, y: winY + 786, w: colW, h: 1, fill: T.line }));
win.push(K.button({ x: colX, y: winY + 802, w: 132, h: 30, label: '重置默认外观', size: 10, variant: 'ghost', ghostStroke: T.lineStrong, text: T.muted, r: 8 }).svg);
win.push(t({ x: colX + 146, y: winY + 822, s: '改动实时保存，不需要点确认', size: 9.5, family: F.ui, fill: T.faint }));
win.push(t({ x: pvX, y: winY + 886, s: '外观修改自动保存到本机', size: 9.5, family: F.mono, fill: T.faint, opacity: 0.75 }));
win.push(t({ x: pad + winW - 36, y: winY + 886, s: 'v0.4.14', size: 9.5, family: F.mono, fill: T.faint, anchor: 'end', opacity: 0.75 }));

sh.raw(win.join(''), winH + 44);

// 工作台要点
const wbNotes = [
  ['焦点在角色', '预览舞台占 520px 宽，角色更大、留白更多；其余控件退到 12px 字号与低对比。'],
  ['侧栏是「书架」', '选中态用左侧 2.5px 暖光条 + 轻微暖底，而不是整块高亮，保持夜间安静。'],
  ['字重分层', '衬线大标题（30px）+ 无衬线正文（12.5px）+ 等宽元信息（9.5px），三级足够。'],
];
sh.raw(wbNotes.map(([title, desc], i) => {
  const x = pad + i * (INNER / 3);
  return [
    t({ x, y: sh.y + 14, s: '0' + (i + 1), size: 10, family: F.mono, fill: T.accent, ls: 1.5 }),
    t({ x: x + 26, y: sh.y + 14, s: title, size: 11.5, weight: 600, family: F.ui, fill: T.text }),
    L({ x, y: sh.y + 36, lines: K.wrap(desc, 10.5, INNER / 3 - 36), size: 10.5, lineHeight: 17, family: F.ui, fill: T.muted }),
  ].join('');
}).join(''), 92);

divider(16, 30);

/* =========================================================================
 * 04 市场
 * ========================================================================= */
sh.section({ index: 4, title: '桌宠市场', note: '发现 · 投稿 · 查询 三态同一套语言', color: T.text, noteColor: T.faint });

const mkY = sh.y;
const mkH = 566;
const mk = [];
mk.push(`<clipPath id="mkClip"><rect x="${pad}" y="${mkY}" width="${winW}" height="${mkH}" rx="18"/></clipPath>`);
mk.push(el('g', { filter: 'url(#panelShadow)' }, [r({ x: pad, y: mkY, w: winW, h: mkH, r: 18, fill: 'url(#winBg)', stroke: T.lineStrong })]));
mk.push(el('g', { 'clip-path': 'url(#mkClip)' }, [rim(pad + 24, mkY + 1, winW - 48, 0.06)]));
mk.push(t({ x: cx, y: mkY + 44, s: '灵伴 / 社区', size: 9.5, family: F.mono, fill: T.faint, ls: 1.2 }));
mk.push(t({ x: cx, y: mkY + 84, s: '桌宠市场', size: 27, weight: 700, family: F.display, fill: T.text }));
mk.push(t({ x: cx, y: mkY + 108, s: '发现喜欢的伙伴，在这里预览、安装和分享。', size: 12, family: F.ui, fill: T.muted }));
mk.push(K.button({ x: pad + winW - 36 - 100, y: mkY + 34, w: 100, h: 34, label: '返回工作台', size: 11, variant: 'ghost', ghostStroke: T.lineStrong, text: T.muted, r: 9 }).svg);
[['发现桌宠', true], ['投稿作品', false], ['查询投稿', false]].forEach(([label, active], i) => {
  const x = cx + i * 96;
  mk.push(t({ x, y: mkY + 148, s: label, size: 12.5, weight: active ? 600 : 400, family: F.ui, fill: active ? T.accent : T.muted }));
  if (active) mk.push(r({ x, y: mkY + 158, w: K.measure(label, 12.5), h: 2, r: 1, fill: T.accent }));
});
mk.push(r({ x: cx, y: mkY + 176, w: contentW, h: 1, fill: T.line }));
mk.push(r({ x: cx, y: mkY + 198, w: 460, h: 40, r: 10, fill: T.surfaceAlt, stroke: T.line }));
mk.push(glyph('search', cx + 14, mkY + 210, 16, T.faint));
mk.push(t({ x: cx + 40, y: mkY + 224, s: '搜索桌宠、作者或介绍', size: 11.5, family: F.ui, fill: T.faint, baseline: 'middle' }));
mk.push(K.button({ x: cx + 476, y: mkY + 198, w: 78, h: 40, label: '搜索', size: 11.5, variant: 'primary', primaryFill: T.surfaceRaised, primaryText: T.text, r: 10 }).svg);
mk.push(K.button({ x: cx + 566, y: mkY + 198, w: 124, h: 40, label: '导入本地包', size: 11.5, variant: 'ghost', ghostStroke: T.lineStrong, text: T.text, r: 10 }).svg);
mk.push(t({ x: cx + contentW, y: mkY + 214, s: '安装方式', size: 10, family: F.ui, fill: T.faint, anchor: 'end' }));
mk.push(r({ x: cx + contentW - 172, y: mkY + 202, w: 168, h: 32, r: 8, fill: T.surfaceAlt, stroke: T.line }));
mk.push(t({ x: cx + contentW - 158, y: mkY + 223, s: '新增一只桌宠', size: 11, family: F.ui, fill: T.muted, baseline: 'middle' }));
mk.push(glyph('chevron', cx + contentW - 32, mkY + 214, 14, T.faint));

const cardsData = [
  { name: '鲸鱼娘 · 深海水手', author: 'by @兰台', dl: '3.2k', tag: '像素 · 8 态', cover: 'coverA', sprite: 'deepseek-idle' },
  { name: '青墨龙灵', author: 'by @墨白', dl: '2.7k', tag: '像素 · 8 态', cover: 'coverC', sprite: 'white-dragon-hd' },
  { name: '白龙 · 雪原信使', author: 'by @白泽', dl: '1.9k', tag: '原图 · 8 态', cover: 'coverB', sprite: 'deepseek-hd' },
];
const mcW = (contentW - 32) / 3;
const mcH = 300;
cardsData.forEach((c, i) => {
  const x = cx + i * (mcW + 16);
  const y = mkY + 258;
  mk.push(r({ x, y, w: mcW, h: mcH, r: 16, fill: T.surfaceAlt, stroke: T.line }));
  mk.push(`<clipPath id="mcover${i}"><rect x="${x + 1}" y="${y + 1}" width="${mcW - 2}" height="182" rx="15"/></clipPath>`);
  mk.push(el('g', { 'clip-path': `url(#mcover${i})` }, [
    r({ x, y, w: mcW, h: 184, fill: `url(#${c.cover})` }),
    aura(x + mcW / 2, y + 108, 150, i === 1 ? 'auraCool' : 'auraWarm', 0.55),
    r({ x, y, w: mcW, h: 184, fill: 'url(#dotGrid)' }),
  ].join('')));
  mk.push(K.sprite({ name: c.sprite, x: x + mcW / 2 - 62, y: y + 6, w: 124, h: 166 }));
  mk.push(r({ x: x + 14, y: y + 150, w: K.measure(c.tag, 9.5) + 18, h: 22, r: 11, fill: '#000000', fillOpacity: 0.42, stroke: T.lineStrong }));
  mk.push(t({ x: x + 23, y: y + 165, s: c.tag, size: 9.5, family: F.ui, fill: T.muted, baseline: 'middle' }));
  mk.push(t({ x: x + 18, y: y + 220, s: c.name, size: 13.5, weight: 600, family: F.ui, fill: T.text }));
  mk.push(t({ x: x + 18, y: y + 242, s: c.author, size: 10.5, family: F.ui, fill: T.faint }));
  mk.push(t({ x: x + 18, y: y + 276, s: `↓ ${c.dl}`, size: 10, family: F.mono, fill: T.faint }));
  mk.push(K.button({ x: x + mcW - 92, y: y + 254, w: 74, h: 30, label: '安装', size: 11, variant: 'primary', primaryFill: i === 0 ? 'url(#primaryBg)' : T.surfaceRaised, primaryText: i === 0 ? T.accentInk : T.text, r: 8 }).svg);
});
sh.raw(mk.join(''), mkH + 40);

divider(20, 30);

/* =========================================================================
 * 05 周边表面
 * ========================================================================= */
sh.section({ index: 5, title: '周边表面', note: 'DSH 设置面板 · 市场网站 · 同一套 token', color: T.text, noteColor: T.faint });

const surY = sh.y;
const dshW = 632;
const dshH = 528;
const siteX = pad + dshW + 40;
const siteW = INNER - dshW - 40;
const siteH = 528;

const dsh = [
  panel(pad, surY, dshW, dshH, { r: 18, fill: T.surface, stroke: T.line }),
  t({ x: pad + 32, y: surY + 40, s: 'LINGPET / 灵伴', size: 9.5, family: F.mono, fill: T.accent, ls: 2.4 }),
  t({ x: pad + 32, y: surY + 84, s: '你的会话伙伴', size: 26, weight: 700, family: F.display, fill: T.text }),
  L({ x: pad + 32, y: surY + 112, lines: K.wrap('让桌宠陪伴每一次思考与创作，在工作台管理形象和会话跟随。', 11.5, dshW - 64), size: 11.5, lineHeight: 19, family: F.ui, fill: T.muted }),
  r({ x: pad + 32, y: surY + 152, w: dshW - 64, h: 152, r: 14, fill: T.surfaceAlt, stroke: T.line }),
  lantern(pad + 52, surY + 180, T.done, 4),
  t({ x: pad + 66, y: surY + 185, s: '桌宠运行状态', size: 12.5, weight: 600, family: F.ui, fill: T.text }),
  t({ x: pad + 52, y: surY + 210, s: '桌宠正在运行，随时打开工作台调整形象。', size: 10.5, family: F.ui, fill: T.muted }),
  ghostBtn(pad + 52, surY + 242, 96, '启动桌宠', 32, 11),
  ghostBtn(pad + 158, surY + 242, 96, '关闭全部', 32, 11),
  primaryBtn(pad + 264, surY + 242, 108, '打开工作台', 32, 11),
  r({ x: pad + 32, y: surY + 320, w: dshW - 64, h: 132, r: 14, fill: T.surfaceAlt, stroke: T.line }),
  t({ x: pad + 52, y: surY + 348, s: '会话偏好', size: 12.5, weight: 600, family: F.ui, fill: T.text }),
  t({ x: pad + 52, y: surY + 376, s: '自动启动桌宠', size: 11, family: F.ui, fill: T.text }),
  t({ x: pad + 52, y: surY + 394, s: 'DSH 运行时自动唤起桌宠', size: 9.5, family: F.ui, fill: T.faint }),
  toggle(pad + dshW - 92, surY + 366, true),
  r({ x: pad + 52, y: surY + 406, w: dshW - 104, h: 1, fill: T.line }),
  t({ x: pad + 52, y: surY + 430, s: '显示子 Agent', size: 11, family: F.ui, fill: T.text }),
  t({ x: pad + 52, y: surY + 447, s: '将子 Agent 的会话状态一起交给桌宠监控', size: 9.5, family: F.ui, fill: T.faint }),
  toggle(pad + dshW - 92, surY + 418, false),
  L({ x: pad + 32, y: surY + 486, lines: ['面板注入宿主设置页：底色一律 color-mix(in srgb, currentColor 4%, transparent)，', '强调色由 --lp-accent 覆盖，深浅色主题都成立。'], size: 9.5, lineHeight: 15, family: F.mono, fill: T.faint }),
];
sh.raw(dsh.join(''), 0);

const site = [];
site.push(el('g', { filter: 'url(#panelShadow)' }, [r({ x: siteX, y: surY, w: siteW, h: siteH, r: 16, fill: '#100d0b', stroke: T.lineStrong })]));
site.push(`<clipPath id="siteClip"><rect x="${siteX}" y="${surY}" width="${siteW}" height="${siteH}" rx="16"/></clipPath>`);
site.push(el('g', { 'clip-path': 'url(#siteClip)' }, [
  r({ x: siteX, y: surY, w: siteW, h: 40, fill: '#1a1512' }),
  r({ x: siteX, y: surY + 40, w: siteW, h: 1, fill: T.line }),
].join('')));
site.push(K.circle({ cx: siteX + 20, cy: surY + 20, r: 4, fill: '#4a3a2c' }));
site.push(K.circle({ cx: siteX + 34, cy: surY + 20, r: 4, fill: '#4a3a2c' }));
site.push(K.circle({ cx: siteX + 48, cy: surY + 20, r: 4, fill: '#4a3a2c' }));
site.push(r({ x: siteX + 66, y: surY + 9, w: 236, h: 22, r: 6, fill: '#120f0d', stroke: T.line }));
site.push(t({ x: siteX + 78, y: surY + 23, s: 'lingpet.market', size: 9.5, family: F.mono, fill: T.faint, baseline: 'middle' }));
site.push(t({ x: siteX + 32, y: surY + 76, s: '灵伴', size: 16, weight: 700, family: F.display, fill: T.text }));
site.push(t({ x: siteX + 72, y: surY + 76, s: 'LINGPET', size: 7.5, family: F.mono, fill: T.faint, ls: 1.6 }));
['发现', '投稿', '查询', '文档'].forEach((s, i) => site.push(t({ x: siteX + siteW - 230 + i * 46, y: surY + 76, s, size: 10.5, family: F.ui, fill: i === 0 ? T.text : T.faint })));
site.push(aura(siteX + siteW - 130, surY + 190, 210, 'auraWarm', 0.55));
site.push(t({ x: siteX + 32, y: surY + 150, s: '陪你把代码写完的', size: 26, weight: 700, family: F.display, fill: T.text }));
site.push(t({ x: siteX + 32, y: surY + 188, s: '像素伙伴', size: 26, weight: 700, family: F.display, fill: T.accent }));
site.push(L({ x: siteX + 32, y: surY + 218, lines: ['八种状态跟着你的会话走，', '不打扰，但一直在。'], size: 11, lineHeight: 19, family: F.ui, fill: T.muted }));
site.push(K.sprite({ name: 'deepseek-idle', x: siteX + siteW - 208, y: surY + 96, w: 156, h: 208 }));
site.push(K.button({ x: siteX + 32, y: surY + 258, w: 118, h: 36, label: '下载灵伴', size: 11.5, variant: 'primary', primaryFill: 'url(#primaryBg)', primaryText: T.accentInk, r: 9 }).svg);
site.push(K.button({ x: siteX + 160, y: surY + 258, w: 96, h: 36, label: '逛市场', size: 11.5, variant: 'ghost', ghostStroke: T.lineStrong, text: T.text, r: 9 }).svg);
['鲸鱼娘', '青墨龙灵', '白龙信使'].forEach((name, i) => {
  const w = (siteW - 64 - 24) / 3;
  const x = siteX + 32 + i * (w + 12);
  site.push(r({ x, y: surY + 322, w, h: 170, r: 12, fill: T.surfaceAlt, stroke: T.line }));
  site.push(r({ x: x + 1, y: surY + 323, w: w - 2, h: 104, r: 11, fill: `url(#${['coverA', 'coverC', 'coverB'][i]})` }));
  site.push(aura(x + w / 2, surY + 376, 62, i === 1 ? 'auraCool' : 'auraWarm', 0.6));
  site.push(K.sprite({ name: ['deepseek-idle', 'white-dragon-hd', 'deepseek-hd'][i], x: x + w / 2 - 34, y: surY + 330, w: 68, h: 94 }));
  site.push(t({ x: x + 14, y: surY + 450, s: name, size: 11.5, weight: 600, family: F.ui, fill: T.text }));
  site.push(t({ x: x + 14, y: surY + 468, s: '↓ 3.2k · 像素', size: 9, family: F.mono, fill: T.faint }));
});
sh.raw(site.join(''), 0);
sh.y = surY + dshH + 26;

divider(20, 30);

/* =========================================================================
 * 06 设计语言
 * ========================================================================= */
sh.section({ index: 6, title: '设计语言', note: '可直接落成 CSS 变量', color: T.text, noteColor: T.faint });

// 色彩
sh.raw(t({ x: pad, y: sh.y + 14, s: '01 色彩', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 34);
const palette = [
  ['bg', T.bg, '页面底色', '最外层，极弱暖点阵'],
  ['surface', T.surface, '面板', '卡片、弹层主体'],
  ['surfaceAlt', T.surfaceAlt, '次级面', '输入框、内嵌卡'],
  ['line', T.line, '分隔线', '1px，暖灰'],
  ['text', T.text, '正文', '暖白，非纯白'],
  ['muted', T.muted, '次级文字', '描述、辅助'],
  ['faint', T.faint, '弱文字', '时间戳、版本号'],
  ['accent', T.accent, '主强调', '灯色，只用小面积'],
  ['accentSoft', T.accentSoft, '强调底', '选中态背景'],
  ['accentInk', T.accentInk, '强调上的字', '主按钮文字'],
  ['cool', T.cool, '冷色对比', '极少用，平衡暖调'],
  ['done', T.done, '成功', '状态语义'],
];
sh.raw(palette.map(([name, hex, role, use], i) => {
  const col = i % 6;
  const row = Math.floor(i / 6);
  const w = (INNER - 5 * 12) / 6;
  const x = pad + col * (w + 12);
  const y = sh.y + row * 118;
  return [
    r({ x, y, w, h: 62, r: 10, fill: hex, stroke: T.line }),
    t({ x, y: y + 82, s: name, size: 10, family: F.mono, fill: T.text }),
    t({ x: x + w, y: y + 82, s: hex.toUpperCase(), size: 9, family: F.mono, fill: T.faint, anchor: 'end' }),
    t({ x, y: y + 99, s: role, size: 9.5, family: F.ui, fill: T.muted }),
    t({ x, y: y + 114, s: use, size: 9, family: F.ui, fill: T.faint }),
  ].join('');
}).join(''), 2 * 118 + 16);

// 状态色
sh.raw(t({ x: pad, y: sh.y + 16, s: '02 状态色（八态）', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 36);
sh.raw(Object.entries(T.state).map(([state, hex], i) => {
  const w = (INNER - 7 * 10) / 8;
  const x = pad + i * (w + 10);
  const y = sh.y;
  return [
    r({ x, y, w, h: 42, r: 8, fill: T.surfaceAlt, stroke: T.line }),
    K.circle({ cx: x + 22, cy: y + 21, r: 18, fill: hex, opacity: 0.18, filter: 'url(#glowSoft)' }),
    K.circle({ cx: x + 22, cy: y + 21, r: 7, fill: hex }),
    t({ x: x + 40, y: y + 17, s: STATE_LABEL[state], size: 10.5, weight: 600, family: F.ui, fill: T.text }),
    t({ x: x + 40, y: y + 32, s: hex.toUpperCase(), size: 8.5, family: F.mono, fill: T.faint }),
  ].join('');
}).join(''), 66);

// 字阶
sh.raw(t({ x: pad, y: sh.y + 16, s: '03 字阶', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 36);
const typeRows = [
  ['display', '暖光夜桌', 30, 700, F.display, 'Noto Serif SC', '页面主标题 / 品牌'],
  ['h2', '你的会话伙伴', 20, 700, F.display, 'Noto Serif SC', '卡片与分区标题'],
  ['h3', '桌宠工作台', 15, 600, F.ui, 'Microsoft YaHei', '区块标题'],
  ['body', '选择一位伙伴，设置它的外观和跟随方式。', 12.5, 400, F.ui, 'Microsoft YaHei', '正文 / 描述'],
  ['meta', 'Cursor · 会话 cursor-task', 10, 400, F.ui, 'Microsoft YaHei', '元信息'],
  ['mono', 'thinking · 3.2s · 0.4.14', 9.5, 400, F.mono, 'Consolas', '状态、版本、数字'],
];
sh.raw(typeRows.map(([name, sample, size, weight, family, fontName, use], i) => {
  const y = sh.y + i * 58;
  return [
    i === 0 ? '' : r({ x: pad, y: y - 20, w: INNER, h: 1, fill: T.line, opacity: 0.6 }),
    t({ x: pad, y: y + 18, s: name, size: 9.5, family: F.mono, fill: T.accent, ls: 1 }),
    t({ x: pad + 96, y: y + 20, s: sample, size, weight, family, fill: T.text }),
    t({ x: pad + INNER - 300, y: y + 18, s: `${size}px / ${weight} / ${fontName}`, size: 9.5, family: F.mono, fill: T.faint, anchor: 'end' }),
    t({ x: pad + INNER, y: y + 18, s: use, size: 9.5, family: F.ui, fill: T.muted, anchor: 'end' }),
  ].join('');
}).join(''), typeRows.length * 58 + 16);

// 形状 / 光影 / 纹理
sh.raw(t({ x: pad, y: sh.y + 18, s: '04 形状 · 光影 · 纹理', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 36);
const tiles = [
  ['圆角', 'radius'],
  ['描边与内高光', 'border'],
  ['阴影与发光', 'shadow'],
  ['纹理', 'texture'],
];
const tileW = (INNER - 3 * 16) / 4;
sh.raw(tiles.map(([title, kind], i) => {
  const x = pad + i * (tileW + 16);
  const y = sh.y;
  const body = [
    r({ x, y, w: tileW, h: 176, r: 14, fill: T.surfaceAlt, stroke: T.line }),
    t({ x: x + 18, y: y + 28, s: title, size: 11.5, weight: 600, family: F.ui, fill: T.text }),
  ];
  if (kind === 'radius') {
    [6, 12, 18, 26].forEach((rad, d) => body.push(r({ x: x + 18 + d * 60, y: y + 48, w: 46, h: 46, r: rad, fill: 'none', stroke: T.lineStrong, sw: 1.5 })));
    body.push(t({ x: x + 18, y: y + 118, s: '窗口 18 / 面板 16 / 卡片 12', size: 9.5, family: F.mono, fill: T.faint }));
    body.push(t({ x: x + 18, y: y + 134, s: '控件 10 / 胶囊 999，不用 0 圆角', size: 9.5, family: F.mono, fill: T.faint }));
  }
  if (kind === 'border') {
    body.push(r({ x: x + 18, y: y + 48, w: tileW - 36, h: 44, r: 10, fill: T.surface, stroke: T.lineStrong }));
    body.push(rim(x + 28, y + 49, tileW - 56, 0.14));
    body.push(r({ x: x + 18, y: y + 102, w: tileW - 36, h: 44, r: 10, fill: T.accentSoft, stroke: T.accent, strokeOpacity: 0.6 }));
    body.push(t({ x: x + 18, y: y + 162, s: '描边永远 1px，选中才加到 1.2px', size: 9, family: F.ui, fill: T.faint }));
  }
  if (kind === 'shadow') {
    body.push(el('g', { filter: 'url(#cardShadow)' }, [r({ x: x + 20, y: y + 52, w: 74, h: 44, r: 10, fill: T.surface })]));
    body.push(el('g', { filter: 'url(#glowSoft)' }, [K.circle({ cx: x + 132, cy: y + 74, r: 17, fill: T.accent, opacity: 0.5 })]));
    body.push(K.circle({ cx: x + 132, cy: y + 74, r: 5, fill: T.accentLight }));
    body.push(el('g', { filter: 'url(#panelShadow)' }, [r({ x: x + 162, y: y + 52, w: 62, h: 44, r: 10, fill: T.surface })]));
    body.push(t({ x: x + 18, y: y + 126, s: '深色里靠「面更亮 + 顶光」造深度', size: 9, family: F.ui, fill: T.faint }));
    body.push(t({ x: x + 18, y: y + 142, s: '发光只给状态，不给按钮', size: 9, family: F.ui, fill: T.faint }));
  }
  if (kind === 'texture') {
    body.push(r({ x: x + 18, y: y + 48, w: tileW - 36, h: 50, r: 8, fill: T.surface, stroke: T.line }));
    body.push(r({ x: x + 18, y: y + 48, w: tileW - 36, h: 50, r: 8, fill: 'url(#dotGrid)' }));
    body.push(r({ x: x + 18, y: y + 106, w: tileW - 36, h: 50, r: 8, fill: T.surface, stroke: T.line }));
    body.push(r({ x: x + 18, y: y + 106, w: tileW - 36, h: 50, r: 8, fill: 'url(#scan)' }));
    body.push(t({ x: x + 18, y: y + 170, s: '纹理只做呼吸感，不加噪点图', size: 9, family: F.ui, fill: T.faint }));
  }
  return body.join('');
}).join(''), 176 + 28);

// 动效
sh.raw(t({ x: pad, y: sh.y + 18, s: '05 动效', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 36);
const motion = [
  ['状态切换', 240, 'cubic-bezier(.2,.8,.2,1)', '光晕色相 + 胶囊文字交叉淡入'],
  ['气泡出现', 320, 'cubic-bezier(.34,1.4,.64,1)', '从角色方向滑入 8px + 轻微过冲'],
  ['光晕呼吸', 4000, 'ease-in-out 无限', '缩放 0.96 → 1.04，thinking 时 2.4s'],
  ['按钮 hover', 140, 'ease-out', '亮度 +6%，上移 1px，不加位移大动画'],
];
sh.raw(motion.map(([name, dur, ease, desc], i) => {
  const y = sh.y + i * 46;
  const barW = 400;
  const filled = Math.max(0.05, Math.min(1, dur / 4000));
  return [
    t({ x: pad, y: y + 14, s: name, size: 11.5, weight: 600, family: F.ui, fill: T.text }),
    r({ x: pad + 100, y: y + 8, w: barW, h: 6, r: 3, fill: T.surfaceRaised }),
    r({ x: pad + 100, y: y + 8, w: Math.max(10, barW * filled), h: 6, r: 3, fill: 'url(#primaryBg)' }),
    t({ x: pad + 100 + barW + 14, y: y + 14, s: `${dur}ms · ${ease}`, size: 9, family: F.mono, fill: T.faint }),
    t({ x: pad + INNER, y: y + 14, s: desc, size: 9.5, family: F.ui, fill: T.muted, anchor: 'end' }),
  ].join('');
}).join(''), motion.length * 46 + 16);

// 落地映射
sh.raw(t({ x: pad, y: sh.y + 18, s: '06 落地映射', size: 12.5, weight: 600, family: F.ui, fill: T.text }), 36);
const mapRows = [
  ['desktop/ui-theme.css', ':root 换 12 个色值 + --radius 16px + 衬线 display 字体'],
  ['desktop/pet.css', '状态胶囊改玻璃胶囊；新增 .aura 光环层；@keyframes breathe'],
  ['desktop/settings.css', '侧栏选中态改左侧光条；预览舞台加光环与虚线环；卡片圆角收到 12/14'],
  ['client/client.js', '注入样式改用 currentColor + --lp-accent 派生，去掉硬编码 #d79d76'],
];
const mapH = 38 + mapRows.length * 34;
sh.raw([
  r({ x: pad, y: sh.y, w: INNER, h: mapH, r: 14, fill: '#100d0b', stroke: T.line }),
  rim(pad + 20, sh.y + 1, INNER - 40, 0.06),
  t({ x: pad + 24, y: sh.y + 30, s: '/* 方案 B 的 CSS 变量草案，可直接粘进 desktop/ui-theme.css */', size: 9.5, family: F.mono, fill: T.faint }),
  mapRows.map(([file, desc], i) => {
    const y = sh.y + 58 + i * 34;
    const tokens = ['--bg: #0b0908', '--surface: #171210', '--line: #33291f', '--text: #f6efe6'];
    return [
      t({ x: pad + 24, y, s: tokens[i % 4] + ';', size: 9.5, family: F.mono, fill: i % 2 === 0 ? T.accent : T.muted }),
      t({ x: pad + 470, y, s: `/* ${file} → ${desc} */`, size: 9.5, family: F.mono, fill: T.faint }),
    ].join('');
  }).join(''),
].join(''), mapH + 24);

sh.raw(t({ x: pad, y: sh.y, s: 'WARM NIGHT DESK · 暖光夜桌 — 灵伴视觉改版方案 B · Lead 设计 · 其余方案见 01 / 03 / 04 目录', size: 9.5, family: F.mono, fill: T.faint, ls: 0.6 }), 0);

const res = await sh.finish(path.join(HERE, 'board.png'));
console.log('board.png ok', res);
