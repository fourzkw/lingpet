// Crop the shipped 8-state atlases into single transparent PNGs for design mockups.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'design/assets');
fs.mkdirSync(outDir, { recursive: true });

function readPng(rel) {
  return PNG.sync.read(fs.readFileSync(path.join(root, rel)));
}
function nearest(png, tw, th) {
  const out = new PNG({ width: tw, height: th });
  for (let y = 0; y < th; y++) {
    const sy = Math.min(png.height - 1, Math.floor((y * png.height) / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(png.width - 1, Math.floor((x * png.width) / tw));
      const si = (sy * png.width + sx) * 4;
      const di = (y * tw + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}
function crop(png, sx, sy, sw, sh) {
  const out = new PNG({ width: sw, height: sh });
  PNG.bitblt(png, out, sx, sy, sw, sh, 0, 0);
  return out;
}
function write(name, png) {
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
  return `${name} ${png.width}x${png.height}`;
}

const STATES = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];
const made = [];

// DeepSeek: plain 4x2 grid, cell = w/4 x h/2.
const ds = readPng('assets/deepseek/states.png');
const dsCellW = Math.floor(ds.width / 4);
const dsCellH = Math.floor(ds.height / 2);
for (const [i, state] of STATES.entries()) {
  const cell = crop(ds, (i % 4) * dsCellW, Math.floor(i / 4) * dsCellH, dsCellW, dsCellH);
  const scaled = nearest(cell, 256, Math.round((256 * dsCellH) / dsCellW));
  made.push(write(`deepseek-${state}.png`, scaled));
}

// Claude: rows are offset (see desktop/pixel-pet.js baseFor).
const cl = readPng('assets/claude/states.png');
const clCellW = Math.floor(cl.width / 4);
const clCellH = Math.round((cl.height * 336) / 1024);
for (const [i, state] of STATES.entries()) {
  const sy = Math.round((cl.height * (i < 4 ? 120 : 560)) / 1024);
  const cell = crop(cl, (i % 4) * clCellW, sy, clCellW, clCellH);
  const scaled = nearest(cell, 256, Math.round((256 * clCellH) / clCellW));
  made.push(write(`claude-${state}.png`, scaled));
}

// High-resolution original character renders (transparent, for glow / hero use).
for (const [rel, name] of [['assets/deepseek-h3/base.png', 'deepseek-hd.png'], ['assets/chatgpt-white-dragon-h3/base.png', 'white-dragon-hd.png']]) {
  const png = readPng(rel);
  const target = 512;
  made.push(write(name, nearest(png, target, Math.round((target * png.height) / png.width))));
}

console.log(made.join('\n'));
