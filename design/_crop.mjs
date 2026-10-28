import * as K from './lib/svgkit.mjs';

const [src, out, x, y, w, h] = process.argv.slice(2);
await K.cropPng(src, { x: Number(x), y: Number(y), w: Number(w), h: Number(h) }, out);
const sharp = K.getSharp();
const meta = await sharp(out).metadata();
console.log(`ok ${out} ${meta.width}x${meta.height}`);
