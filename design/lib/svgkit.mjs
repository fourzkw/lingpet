/**
 * 灵伴 LingPet 视觉方案 · SVG 设计板工具库
 *
 * 背景：本机沙箱无法启动 Chromium（命名管道被禁），因此方案稿不走浏览器截图路线。
 * 这里用 SVG 直接画设计板，再用 sharp（内置 librsvg + pango + fontconfig）栅格化成 PNG。
 * 已验证可用：渐变 / feGaussianBlur 发光 / feDropShadow / stroke-dasharray / pattern /
 * 中文（Microsoft YaHei、Noto Serif SC）/ Consolas / data-URI 贴图 / dominant-baseline。
 *
 * 用法见 design/proposals/spec.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // design/lib
export const ROOT = path.resolve(HERE, '..', '..');
export const ASSETS = path.join(ROOT, 'design', 'assets');

/* ---------------------------------------------------------------------------
 * sharp（从 DSH 的依赖里借，项目本身不安装它）
 * ------------------------------------------------------------------------- */
const DSH_MODULES = 'C:/Users/86476/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules';
let _sharp = null;
export function getSharp() {
  if (!_sharp) {
    const req = createRequire(path.join(DSH_MODULES, 'sharp', 'dist', 'index.cjs'));
    _sharp = req(path.join(DSH_MODULES, 'sharp', 'dist', 'index.cjs'));
  }
  return _sharp;
}

/* ---------------------------------------------------------------------------
 * 基础工具
 * ------------------------------------------------------------------------- */
export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)' */
export function hexA(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 在 hex 基础上提亮/压暗，amount -1..1 */
export function shade(hex, amount) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const mix = (c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------------------------
 * 贴图（像素角色）
 * ------------------------------------------------------------------------- */
const uriCache = new Map();
export function spriteUri(name) {
  if (uriCache.has(name)) return uriCache.get(name);
  const file = path.join(ASSETS, name.endsWith('.png') ? name : name + '.png');
  if (!fs.existsSync(file)) throw new Error('sprite not found: ' + file);
  const uri = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  uriCache.set(name, uri);
  return uri;
}

/** 可用的像素角色贴图 */
export const SPRITES = {
  deepseek: ['deepseek-idle', 'deepseek-thinking', 'deepseek-working', 'deepseek-input', 'deepseek-approval', 'deepseek-done', 'deepseek-error', 'deepseek-sleep'],
  claude: ['claude-idle', 'claude-thinking', 'claude-working', 'claude-input', 'claude-approval', 'claude-done', 'claude-error', 'claude-sleep'],
  hd: ['deepseek-hd', 'white-dragon-hd'],
};
export const STATES = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];

/* ---------------------------------------------------------------------------
 * 图元
 * ------------------------------------------------------------------------- */
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '')
    .map(([k, v]) => `${k}="${typeof v === 'number' ? round(v) : esc(v)}"`)
    .join(' ');

const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

export function el(name, a = {}, children = '') {
  const open = `<${name}${Object.keys(a).length ? ' ' + attrs(a) : ''}`;
  if (children === '' || children === undefined || children === null) return open + '/>';
  return `${open}>${children}</${name}>`;
}

/**
 * 矩形。r = 圆角；fill/stroke 可给渐变 url(#id)；
 * glow/filter 用 <filter> id；dash='6 6'。
 */
export function rect(o = {}) {
  return el('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h,
    rx: o.r || undefined,
    fill: o.fill ?? 'none',
    'fill-opacity': o.fillOpacity,
    stroke: o.stroke,
    'stroke-width': o.sw,
    'stroke-opacity': o.strokeOpacity,
    'stroke-dasharray': o.dash,
    'stroke-linecap': o.linecap,
    opacity: o.opacity,
    filter: o.filter,
    transform: o.transform,
  });
}

export function circle(o = {}) {
  return el('circle', {
    cx: o.cx, cy: o.cy, r: o.r,
    fill: o.fill ?? 'none',
    'fill-opacity': o.fillOpacity,
    stroke: o.stroke, 'stroke-width': o.sw, 'stroke-opacity': o.strokeOpacity,
    opacity: o.opacity, filter: o.filter,
  });
}

export function line(x1, y1, x2, y2, o = {}) {
  return el('line', { x1, y1, x2, y2, stroke: o.stroke, 'stroke-width': o.sw ?? 1, 'stroke-opacity': o.strokeOpacity, 'stroke-dasharray': o.dash, 'stroke-linecap': o.linecap || 'round' });
}

/**
 * 单行文字。x/y 为基线；如需垂直居中给 baseline:'middle'。
 * family 可以是字体栈字符串。
 */
export function text(o = {}) {
  const body = esc(o.s ?? o.text ?? '');
  return el('text', {
    x: o.x, y: o.y,
    'font-family': o.family,
    'font-size': o.size ?? 13,
    'font-weight': o.weight,
    fill: o.fill ?? '#ffffff',
    'fill-opacity': o.fillOpacity,
    'text-anchor': o.anchor,
    'dominant-baseline': o.baseline,
    'letter-spacing': o.ls,
    opacity: o.opacity,
    filter: o.filter,
    transform: o.transform,
    'font-style': o.italic ? 'italic' : undefined,
  }, body);
}

/** 多行文字：lines 为数组，起点 y 是第一行基线 */
export function lines(o = {}) {
  const lh = o.lineHeight ?? Math.round((o.size ?? 13) * 1.6);
  return o.lines.map((s, i) => text({ ...o, lines: undefined, s, y: o.y + i * lh })).join('');
}

/** 粗略宽度估算（em）：CJK = 1，ASCII ≈ 0.56 */
export function measure(s, size) {
  let em = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0x2e80) em += 1;
    else if ('iljt.,:;!|\'`'.includes(ch)) em += 0.32;
    else if ('mwMW'.includes(ch)) em += 0.9;
    else if (ch === ' ') em += 0.3;
    else em += 0.58;
  }
  return em * size;
}

/** 按像素宽度换行（中英混排），返回字符串数组 */
export function wrap(s, size, maxWidth) {
  const out = [];
  let cur = '';
  for (const ch of String(s)) {
    if (ch === '\n') { out.push(cur); cur = ''; continue; }
    if (measure(cur + ch, size) > maxWidth && cur) {
      // 尽量不在 ASCII 单词中间断行
      const m = /[A-Za-z0-9_.-]+$/.exec(cur);
      if (m && /[A-Za-z0-9_.-]/.test(ch) && m[0].length > 1) {
        const head = cur.slice(0, cur.length - m[0].length);
        out.push(head);
        cur = m[0];
      } else {
        out.push(cur);
        cur = '';
      }
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** 段落：按宽度自动换行 */
export function para(o = {}) {
  const size = o.size ?? 13;
  const lh = o.lineHeight ?? Math.round(size * 1.7);
  const ls = wrap(o.s, size, o.w);
  return lines({ ...o, lines: ls, size, lineHeight: lh });
}

/** 圆形/胶囊标签 */
export function pill(o = {}) {
  const h = o.h ?? 26;
  const r = o.r ?? h / 2;
  const size = o.size ?? 12;
  const width = o.w ?? measure(o.label ?? '', size) + (o.dot ? 34 : 24);
  const cy = (o.y ?? 0) + h / 2;
  const anchorX = o.align === 'left' ? (o.x ?? 0) + 12 : (o.x ?? 0) + (o.dot ? 23 : 12);
  const parts = [
    rect({ x: o.x, y: o.y, w: width, h, r, fill: o.fill, stroke: o.stroke, sw: o.sw, dash: o.dash, opacity: o.opacity }),
  ];
  if (o.dot) parts.push(circle({ cx: (o.x ?? 0) + 13, cy, r: o.dotR ?? 3.5, fill: o.dotColor ?? o.labelColor }));
  parts.push(text({
    x: o.dot ? (o.x ?? 0) + 22 : anchorX,
    y: cy,
    s: o.label,
    size,
    fill: o.labelColor,
    family: o.family,
    weight: o.weight,
    baseline: 'middle',
    anchor: o.anchor,
    ls: o.ls,
  }));
  return { svg: parts.join(''), w: width, h };
}

/**
 * 按钮（三种变体由调用方给色）：
 * variant: 'primary' | 'ghost' | 'quiet'
 */
export function button(o = {}) {
  const h = o.h ?? 38;
  const size = o.size ?? 13;
  const w = o.w ?? Math.max(h * 1.4, measure(o.label ?? '', size) + (o.icon ? 46 : 36));
  const x = o.x ?? 0;
  const y = o.y ?? 0;
  const variant = o.variant ?? 'ghost';
  const fill =
    variant === 'primary' ? o.primaryFill : variant === 'quiet' ? (o.quietFill ?? 'none') : (o.ghostFill ?? 'none');
  const stroke = variant === 'primary' ? o.primaryStroke : o.ghostStroke;
  const color = variant === 'primary' ? o.primaryText : variant === 'quiet' ? (o.quietText ?? o.text) : o.text;
  return {
    svg: [
      rect({ x, y, w, h, r: o.r ?? 10, fill, stroke, sw: o.sw ?? 1, filter: o.filter }),
      text({ x: x + w / 2, y: y + h / 2, s: o.label, size, fill: color, family: o.family, weight: o.weight ?? 500, anchor: 'middle', baseline: 'middle', ls: o.ls }),
    ].join(''),
    w, h,
  };
}

/** 角色贴图 */
export function sprite(o = {}) {
  const w = o.w ?? 200;
  const h = o.h ?? Math.round(w * 1.33);
  return el('image', {
    x: o.x, y: o.y, width: w, height: h,
    href: spriteUri(o.name),
    opacity: o.opacity,
    filter: o.filter,
    preserveAspectRatio: 'xMidYMid meet',
    transform: o.transform,
  });
}

/* ---------------------------------------------------------------------------
 * 设计板（Sheet）
 * ------------------------------------------------------------------------- */
export const BOARD_WIDTH = 1600;

/**
 * createSheet({ theme })
 * theme: { fonts:{display,ui,mono}, color:{...}, ... } 仅透传，工具库不强制结构。
 *
 * sh.raw(svgString)           —— 追加任意 SVG
 * sh.header({...})            —— 封面带
 * sh.section({title,note})    —— 分节标题，返回小节内容起始 y
 * sh.y                        —— 当前游标
 * sh.finish(outPng)           —— 渲染 PNG，返回 {file,width,height}
 */
export function createSheet(opts = {}) {
  const width = opts.width ?? BOARD_WIDTH;
  const pad = opts.pad ?? 64;
  const theme = opts.theme ?? {};
  const parts = [];
  let y = pad;

  const sh = {
    width,
    pad,
    theme,
    parts,
    get y() { return y; },
    set y(v) { y = v; },
    /** 画布内可用宽度 */
    get inner() { return width - pad * 2; },
    raw(svg, advance = 0) { parts.push(svg); y += advance; return sh; },
    gap(n = 40) { y += n; return sh; },
    /** 分节：左侧编号 + 标题 + 说明，返回内容起点 */
    section({ title, note, index, color, noteColor, family, size = 20, noteSize = 13, line }) {
      const start = y;
      if (line) parts.push(line);
      if (index !== undefined) {
        parts.push(text({ x: pad, y: y + size, s: String(index).padStart(2, '0'), size: size - 4, family: theme.fonts?.mono, fill: color, opacity: 0.7, ls: 2 }));
      }
      const tx = index !== undefined ? pad + 44 : pad;
      parts.push(text({ x: tx, y: y + size, s: title, size, weight: 650, family: family ?? theme.fonts?.ui, fill: color }));
      if (note) parts.push(text({ x: width - pad, y: y + size, s: note, size: noteSize, family: theme.fonts?.ui, fill: noteColor, anchor: 'end' }));
      y += size + 26;
      return start;
    },
    header({ kicker, title, subtitle, keywords = [], palette = [], footer, familyTitle, familyKicker, familyUI, colors = {} }) {
      return headerBlock(sh, { kicker, title, subtitle, keywords, palette, footer, familyTitle, familyKicker, familyUI, colors });
    },
    finish: null,
  };

  sh.finish = async (outPng, renderOpts = {}) => {
    const height = Math.ceil(y + pad * 0.6);
    const svg = svgDoc({ width, height, body: parts.join('\n'), defs: opts.defs ?? '', bg: opts.bg });
    const file = await renderSvg(svg, outPng, renderOpts);
    return { file, width, height };
  };

  return sh;
}

function headerBlock(sh, o) {
  const c = o.colors ?? {};
  const pad = sh.pad;
  const w = sh.width - pad * 2;
  const top = sh.y;
  sh.raw(text({ x: pad, y: top + 8, s: o.kicker ?? 'LINGPET / 灵伴', size: 11, family: o.familyKicker ?? sh.theme.fonts?.mono, fill: c.kicker, ls: 3 }), 0);
  const titleY = top + 8 + 62;
  sh.raw(text({ x: pad, y: titleY, s: o.title, size: 60, weight: 700, family: o.familyTitle ?? sh.theme.fonts?.display, fill: c.title }), 0);
  let yy = titleY + 40;
  if (o.subtitle) {
    const ls = wrap(o.subtitle, 17, w * 0.62);
    sh.raw(lines({ x: pad, y: yy + 14, lines: ls, size: 17, lineHeight: 30, family: o.familyUI ?? sh.theme.fonts?.ui, fill: c.subtitle }), 0);
    yy += ls.length * 30;
  }
  // 色彩卡
  if (o.palette?.length) {
    const sw = 74;
    const startX = sh.width - pad - o.palette.length * (sw + 10) + 10;
    o.palette.forEach((hex, i) => {
      const x = startX + i * (sw + 10);
      sh.raw(rect({ x, y: top + 6, w: sw, h: 46, r: 10, fill: hex }), 0);
      sh.raw(text({ x, y: top + 68, s: hex.toUpperCase(), size: 9, family: sh.theme.fonts?.mono, fill: c.subtitle, opacity: 0.7 }), 0);
    });
  }
  // 关键词
  if (o.keywords?.length) {
    let x = pad;
    const py = yy + 22;
    o.keywords.forEach((k) => {
      const p = pill({ x, y: py, label: k, size: 12, fill: c.chipFill, stroke: c.chipStroke, labelColor: c.chipText, family: o.familyUI ?? sh.theme.fonts?.ui });
      sh.raw(p.svg, 0);
      x += p.w + 10;
    });
    yy = py + 26 + 24;
  }
  if (o.footer) {
    sh.raw(text({ x: pad, y: yy + 10, s: o.footer, size: 11, family: sh.theme.fonts?.mono, fill: c.subtitle, opacity: 0.6 }), 0);
    yy += 24;
  }
  sh.y = yy + 26;
  return sh;
}

/* ---------------------------------------------------------------------------
 * 文档 & 渲染
 * ------------------------------------------------------------------------- */
export function svgDoc({ width, height, defs = '', body = '', bg }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${defs}</defs>
${bg ? rect({ x: 0, y: 0, w: width, h: height, fill: bg, transform: undefined }) : ''}
${body}
</svg>`;
}

/** SVG 字符串 -> PNG；scale=2 输出 2 倍图 */
export async function renderSvg(svg, outPng, { scale = 1 } = {}) {
  const sharp = getSharp();
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  // sharp 的 SVG 默认按 72 DPI 解析：density 72 * scale 才是 1:1 输出
  const buf = await sharp(Buffer.from(svg), { density: Math.round(72 * scale) }).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outPng, buf);
  return { file: outPng, bytes: buf.length };
}

/** 裁剪 PNG 局部，方便放大审阅 */
export async function cropPng(src, { x = 0, y = 0, w, h, scale = 1 }, outPng) {
  const sharp = getSharp();
  const pipe = sharp(src).extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const buf = scale === 1
    ? await pipe.png().toBuffer()
    : await pipe.resize({ width: Math.round(w * scale), kernel: 'lanczos3' }).png().toBuffer();
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  fs.writeFileSync(outPng, buf);
  return outPng;
}

/** 拼接多张 PNG 成横向对比图（等高缩放） */
export async function montage(files, outPng, { width = 1600, gap = 24, bg = '#0b0b0f', labels = [] } = {}) {
  const sharp = getSharp();
  const metas = await Promise.all(files.map(async (f) => ({ f, m: await sharp(f).metadata() })));
  const heights = metas.map(({ m }) => Math.round(width * (m.height / m.width)));
  // 若总高过大，按固定列宽缩减
  const totalH = heights.reduce((a, b) => a + b + gap, gap);
  const composites = [];
  let y = gap;
  for (let i = 0; i < metas.length; i++) {
    const buf = await sharp(metas[i].f).resize({ width }).png().toBuffer();
    composites.push({ input: buf, left: 0, top: y });
    y += heights[i] + gap;
  }
  const buf = await sharp({ create: { width, height: totalH, channels: 4, background: bg } })
    .composite(composites)
    .png()
    .toBuffer();
  fs.writeFileSync(outPng, buf);
  return outPng;
}
