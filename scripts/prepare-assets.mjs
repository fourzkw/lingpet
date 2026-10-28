import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'assets','claude'),{recursive:true});await mkdir(path.join(root,'assets','deepseek'),{recursive:true});
await copyFile(path.join(root,'output','design','claude-pixel-v1','frames.json'),path.join(root,'assets','claude','frames.json'));
await import('./build-brand.mjs');
console.log('Claude 点阵数据和托盘图标已准备。DeepSeek 透明状态图放置于 assets/deepseek/states.png。');
