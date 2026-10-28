import path from 'node:path';
import * as K from './lib/svgkit.mjs';

const [src, outDir, sliceArg] = process.argv.slice(2);
const sliceH = Number(sliceArg || 1500);
const sharp = K.getSharp();
const meta = await sharp(src).metadata();
const W = meta.width;
const H = meta.height;
let i = 1;
for (let y = 0; y < H; y += sliceH) {
  const h = Math.min(sliceH, H - y);
  const out = path.join(outDir, `slice-${String(i).padStart(2, '0')}.png`);
  await K.cropPng(src, { x: 0, y, w: W, h }, out);
  console.log(out, W, h);
  i += 1;
}
console.log('total slices', i - 1, 'size', W, H);
