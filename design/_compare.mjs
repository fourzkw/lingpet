/**
 * 生成四方案对比图：design/compare.png
 * 用法：node design/_compare.mjs
 * 依赖：design/lib/svgkit.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import * as K from './lib/svgkit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const sharp = K.getSharp();

const ITEMS = [
  { slug: '01-pixel-workshop', no: '01', name: '像素工坊', code: 'PIXEL WORKSHOP', line: '把界面做成一块 8-bit 卡带菜单：2px 硬描边、位移硬投影、0 圆角。' },
  { slug: '02-warm-night', no: '02', name: '暖光夜桌', code: 'WARM NIGHT DESK', line: '桌宠是深夜书桌上的灯：暖棕夜色、玻璃卡片、随状态换色的光晕。' },
  { slug: '03-paper-journal', no: '03', name: '纸感手账', code: 'PAPER JOURNAL', line: '屏幕是一只摊开的手账：暖纸、朱砂印章、胶带与贴纸角色。' },
  { slug: '04-terminal-pulse', no: '04', name: '终端脉动', code: 'TERMINAL PULSE', line: '桌宠是一个可爱的 CLI 进程：statusline、方括号标签、键帽与光标。' },
];

const SLOT_W = 776;
const SLOT_H = 460;
const COLS = [16, 808];
const ROWS = [196, 712];
const W = 1600;
const H = 1250;

const crops = [];
for (const it of ITEMS) {
  const src = path.join(HERE, 'proposals', it.slug, 'board.png');
  try {
    const meta = await sharp(src).metadata();
    const buf = await sharp(src)
      .extract({ left: 0, top: 0, width: meta.width, height: Math.min(880, meta.height) })
      .resize({ width: SLOT_W })
      .png()
      .toBuffer();
    crops.push({ ...it, buf });
  } catch (err) {
    console.log(`skip ${it.slug}: ${err.message}`);
  }
}

const labelSvg = crops.map((c, i) => {
  const x = COLS[i % 2];
  const y = ROWS[Math.floor(i / 2)];
  return [
    K.text({ x, y: y - 42, s: c.no, size: 11, family: "'Consolas',monospace", fill: '#f0a860', ls: 2 }),
    K.text({ x: x + 32, y: y - 42, s: c.name, size: 22, weight: 700, family: "'Noto Serif SC','Microsoft YaHei',serif", fill: '#f6efe6' }),
    K.text({ x: x + 32 + K.measure(c.name, 22) + 16, y: y - 42, s: c.code, size: 10, family: "'Consolas',monospace", fill: '#7e7061', ls: 1.6 }),
    K.text({ x, y: y - 18, s: c.line, size: 11.5, family: "'Microsoft YaHei',sans-serif", fill: '#b4a494' }),
  ].join('');
}).join('');

const bgSvg = K.svgDoc({
  width: W,
  height: H,
  bg: '#0b0908',
  body: [
    K.text({ x: 16, y: 46, s: 'LINGPET / 灵伴', size: 11, family: "'Consolas',monospace", fill: '#f0a860', ls: 3 }),
    K.text({ x: 16, y: 92, s: '四种视觉方向', size: 44, weight: 700, family: "'Noto Serif SC','Microsoft YaHei',serif", fill: '#f6efe6' }),
    K.text({ x: 16, y: 124, s: '同一套信息架构、四个气质方向：像素工坊 / 暖光夜桌 / 纸感手账 / 终端脉动。完整板图见 design/proposals/<编号>/board.png。', size: 12.5, family: "'Microsoft YaHei',sans-serif", fill: '#b4a494' }),
    K.text({ x: W - 16, y: 124, s: 'BEFORE → AFTER · 2026-10 · deepseek-flash', size: 10, family: "'Consolas',monospace", fill: '#7e7061', anchor: 'end' }),
    labelSvg,
  ].join(''),
});

const layers = [];
crops.forEach((c, i) => {
  layers.push({
    input: c.buf,
    left: COLS[i % 2],
    top: ROWS[Math.floor(i / 2)],
  });
});

await sharp(Buffer.from(bgSvg))
  .composite(layers)
  .png()
  .toFile(path.join(HERE, 'compare.png'));

const meta = await sharp(path.join(HERE, 'compare.png')).metadata();
console.log('compare.png ok', meta.width, 'x', meta.height, 'items', crops.length);
