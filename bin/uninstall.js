#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {uninstallLingPet} from '../src/uninstall.js';
const flags=process.argv.slice(process.argv[2]==='uninstall'?3:2),allowed=new Set(['--apply','--archive-data']);
if(flags.some(f=>!allowed.has(f)))throw Error('用法：node bin/uninstall.js [--apply] [--archive-data]；不带 --apply 仅预览');
console.log(JSON.stringify(await uninstallLingPet({dir:dataDirectory(),apply:flags.includes('--apply'),archiveData:flags.includes('--archive-data')}),null,2));
