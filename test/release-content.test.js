import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {releaseAssets,copyHostDependencies} from '../scripts/release-content.mjs';
import {PACKAGE_ROOT} from '../src/paths.js';

test('release allowlist contains only Claude pixel assets and application icons',async()=>{
 const files=await releaseAssets(PACKAGE_ROOT),pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.deepEqual(pkg.files.filter(f=>f.startsWith('assets/')).sort(),files);
 for(const asset of ['deepseek-h3','chatgpt-white-dragon-h3','chatgpt-dragon'])assert.ok(!files.some(file=>file.includes(asset)));
 assert.ok(!files.some(file=>file.includes('/original/')));
 for(const file of files)assert.doesNotMatch(file,/reference|provenance|base\.png|assets\/(deepseek|chatgpt|gemini)\//);
 assert.ok(files.includes('assets/claude/actions-v2/atlas.png'));assert.ok(files.includes('assets/interactions/claude/click.png'));
});

async function fixture(t){
 const base=await mkdtemp(path.join(process.cwd(),'.test-data-release-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const source=path.join(base,'source'),target=path.join(base,'target');await mkdir(source);await mkdir(target);
 const pkg={name:'lingpet',dependencies:{'@deepseek-ai/schemastery':'1.0.0'}};
 for(const folder of [source,target])await writeFile(path.join(folder,'package.json'),JSON.stringify(pkg));
 async function module(name,extra={},parent=source){const folder=path.join(parent,'node_modules',name);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'package.json'),JSON.stringify({name,version:'1.0.0',main:'index.js',...extra}));await writeFile(path.join(folder,'index.js'),'module.exports=1');return folder;}
 for(const name of ['electron','pngjs','yauzl','yazl','@modelcontextprotocol/sdk','@modelcontextprotocol/ext-apps','zod'])await module(name);
 return {source,target,module};
}
test('dependency closure uses package root behind export maps, keeps nested versions, licenses and native files',async t=>{
 const {source,target,module}=await fixture(t);
 const sdk=await module('@modelcontextprotocol/sdk',{exports:{'./package.json':'./dist/cjs/package.json','.':'./dist/cjs/index.js'},dependencies:{leaf:'2'},optionalDependencies:{'missing-platform-module':'1'}});
 await mkdir(path.join(sdk,'dist/cjs'),{recursive:true});await writeFile(path.join(sdk,'dist/cjs/package.json'),'{"type":"commonjs"}');await writeFile(path.join(sdk,'dist/cjs/index.js'),'module.exports=1');
 await module('electron',{dependencies:{leaf:'1'}});await module('leaf');const nested=await module('leaf',{version:'2.0.0'},sdk);
 for(const name of ['native.node','LICENSE','debug.js.map','index.d.ts'])await writeFile(path.join(nested,name),'fixture');
 await copyHostDependencies(source,target);
 const leaf=path.join(target,'node_modules/@modelcontextprotocol/sdk/node_modules/leaf');
 assert.equal(JSON.parse(await readFile(path.join(leaf,'package.json'),'utf8')).version,'2.0.0');
 assert.equal(JSON.parse(await readFile(path.join(target,'node_modules/leaf/package.json'),'utf8')).version,'1.0.0');
 for(const name of ['native.node','LICENSE'])assert.ok((await stat(path.join(leaf,name))).isFile());
 for(const name of ['debug.js.map','index.d.ts'])await assert.rejects(stat(path.join(leaf,name)),{code:'ENOENT'});
 assert.equal(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).dependencies['@deepseek-ai/schemastery'],undefined);
});
test('missing required dependencies fail packaging rather than producing a broken standalone package',async t=>{
 const {source,target,module}=await fixture(t);await module('electron',{dependencies:{'missing-required':'1'}});
 await assert.rejects(copyHostDependencies(source,target),{code:'MODULE_NOT_FOUND'});
});

test('default packages omit Electron binaries but retain downloader metadata and other dist folders',async t=>{
 const {source,target,module}=await fixture(t),electron=await module('electron',{dependencies:{'runtime-downloader':'1'}});
 await mkdir(path.join(electron,'dist'),{recursive:true});await writeFile(path.join(electron,'dist/electron.exe'),'binary');
 await writeFile(path.join(electron,'path.txt'),'electron.exe');await writeFile(path.join(electron,'checksums.json'),'{}');
 const downloader=await module('runtime-downloader');await mkdir(path.join(downloader,'dist'));await writeFile(path.join(downloader,'dist/index.js'),'module.exports=1');
 await copyHostDependencies(source,target);
 const installed=path.join(target,'node_modules/electron');
 for(const file of ['dist','path.txt'])await assert.rejects(stat(path.join(installed,file)),{code:'ENOENT'});
 for(const file of ['checksums.json','package.json'])assert.ok((await stat(path.join(installed,file))).isFile());
 assert.ok((await stat(path.join(target,'node_modules/runtime-downloader/dist/index.js'))).isFile());
});
