import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runtimeProgress,readRuntimeProgress} from '../src/runtime-progress.js';
import {runtimeExecutable} from '../src/bootstrap.js';
import {createPetControl} from '../src/pet-control.js';

async function temp(t){const dir=await mkdtemp(path.resolve('output/runtime-progress-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('progress exposes bytes without inventing a percentage for unknown length, and publishes stages in order',async t=>{
 const dir=await temp(t),logs=[];let now=0;
 const progress=runtimeProgress(dir,'45.0.0',{logger:{info:m=>logs.push(m)},now:()=>now});
 await progress.stage('downloading','连接下载服务');
 await progress.progress({transferred:1048576,total:null});
 let status=await readRuntimeProgress(dir);assert.equal(status.percent,null);assert.match(status.message,/1.0 MB/);
 now=500;await progress.progress({transferred:2097152,total:4194304});
 status=await readRuntimeProgress(dir);assert.equal(status.percent,50);assert.equal(status.total,4194304);
 const control=createPetControl({dir,readEndpoint:async()=>null});
 assert.equal((await control.status()).runtime.percent,50);
 const pending=progress.progress({transferred:3000000,total:4194304});
 await progress.stage('extracting','正在解压');await pending;
 assert.equal((await readRuntimeProgress(dir)).phase,'extracting');assert.ok(logs.some(m=>m.includes('50%')));
});

test('real bootstrap wires download progress and reports extraction and readiness without requiring an Electron binary',async t=>{
 const root=await temp(t),dir=path.join(root,'data');
 const put=async(file,text)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
 await put(path.join(root,'package.json'),'{}');
 const electron=path.join(root,'node_modules/electron');
 await put(path.join(electron,'package.json'),JSON.stringify({name:'electron',version:'45.0.0'}));
 await put(path.join(electron,'checksums.json'),'{}');
 const fake=async(name,source)=>{
   const target=path.join(electron,'node_modules',name);
   await put(path.join(target,'package.json'),JSON.stringify({name,main:'index.cjs'}));
   await put(path.join(target,'index.cjs'),source);
 };
 await fake('@electron/get',`exports.downloadArtifact=async options=>{require('node:assert/strict').equal(options.downloadOptions.quiet,true);await options.downloadOptions.getProgressCallback({transferred:50,total:100});return 'fixture.zip';};`);
 await fake('@electron-internal/extract-zip',`exports.extract=async(file,{dir})=>{const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');const status=JSON.parse(await fs.readFile(path.resolve(dir,'../..','runtime-status.json'),'utf8'));assert.equal(status.phase,'extracting');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron'),'fixture');};`);
 const executable=await runtimeExecutable(dir,{root});
 assert.equal((await readRuntimeProgress(dir)).phase,'ready');
 assert.equal(await runtimeExecutable(dir,{root}),executable);
});
