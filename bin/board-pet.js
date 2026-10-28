#!/usr/bin/env node
import { ensureRuntime } from '../src/bootstrap.js';
import { dataDirectory } from '../src/paths.js';
import { readEndpoint, request } from '../src/bridge-client.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const command=process.argv[2]||'start',dir=dataDirectory();
if(command==='control') {
  let existing;
  try{existing=JSON.parse(await readFile(path.join(dir,'control-panel.json'),'utf8'));const url=new URL(existing.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw new Error('invalid');const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(1000)});if(response.status!==303)existing=null;}catch{existing=null;}
  if(existing)console.log(existing.url);
  else {
    const child=spawn(process.execPath,[fileURLToPath(new URL('./control-panel.js',import.meta.url))],{env:process.env,detached:true,windowsHide:true,stdio:['ignore','pipe','inherit']});
    const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('控制面板启动超时'));},10000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('控制面板启动失败'));});child.stdout.once('data',data=>{clearTimeout(timer);resolve(data.toString().trim());});});
    child.stdout.destroy();child.unref();console.log(url);
  }
} else if(command==='doctor') {
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  console.log(`Board Pet ${pkg.version} / protocol 1`);console.log(`平台: ${process.platform}/${process.arch}`);console.log(`Node: ${process.version}`);console.log(`数据目录: ${dir}`);
  const endpoint=await readEndpoint(dir);
  try{if(!endpoint)throw new Error('尚未启动');await request(endpoint,'/health');console.log('桌宠连接: 正常');}catch{console.log('桌宠连接: 未运行或连接失效');}
  try{const state=JSON.parse(await readFile(path.join(dir,'runtime-status.json'),'utf8'));console.log(`运行时准备: ${state.phase}${state.message?' / '+state.message:''}`);}catch{}
} else if(['start','demo','settings'].includes(command)) {
  await ensureRuntime(dir,{demo:command==='demo',dashboard:command==='settings',explicit:true});console.log('已请求启动桌宠。设置可从托盘菜单打开。');
} else {console.error('用法: board-pet [control|start|settings|demo|doctor]');process.exitCode=1;}
