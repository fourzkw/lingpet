// Exercise the shipped downloader in an isolated directory, then reuse its cache.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),dir=await mkdtemp(path.resolve('output/runtime-download-'));
await assert.rejects(stat(path.join(root,'node_modules/electron/dist')),{code:'ENOENT'});
const {runtimeExecutable}=await import(pathToFileURL(path.join(root,'src/bootstrap.js')));
const executable=await runtimeExecutable(dir,{root});
assert.ok(executable.startsWith(dir+path.sep));assert.ok((await stat(executable)).size>1000000);
assert.equal((await readFile(executable)).subarray(0,2).toString(),'MZ');
assert.equal(JSON.parse(await readFile(path.join(dir,'runtime-status.json'),'utf8')).phase,'ready');
assert.equal(await runtimeExecutable(dir,{root}),executable);
const report={root,dir,executable,bundledElectron:false,downloadedAndVerified:true,cacheReused:true};
await writeFile(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
