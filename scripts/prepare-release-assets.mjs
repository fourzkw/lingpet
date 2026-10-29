import {readFile,writeFile} from 'node:fs/promises';
import {releaseAssets} from './release-content.mjs';
import {PACKAGE_ROOT} from '../src/paths.js';
const pkg=JSON.parse(await readFile('package.json','utf8'));
pkg.files=[...pkg.files.filter(name=>name!=='assets'&&!name.startsWith('assets/')),...await releaseAssets(PACKAGE_ROOT)];
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Prepared explicit production asset allowlist.');
