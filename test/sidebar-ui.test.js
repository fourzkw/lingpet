import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('Codex UI keeps runtime explanation visible and renders progress while a background start is pending',async()=>{
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:true,disabled:false,value:null,classList:{toggle(){}},replaceChildren(){},removeAttribute(key){delete this[key];}});return elements.get(id);};
 let response={running:false,pets:[],runtime:{phase:'missing',message:'首次启动需要联网下载 Electron'}};
 let tick,app;
 class App{constructor(){app=this;}async connect(){}getHostContext(){return {};}async callServerTool(){return {structuredContent:response};}}
 const context={App,applyDocumentTheme(){},applyHostStyleVariables(){},document:{getElementById:element,createElement:()=>({append(){}})},setInterval:fn=>{tick=fn;return 1;},clearInterval(){}};
 const source=(await readFile(new URL('../desktop/sidebar-app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
 await vm.runInNewContext('(async()=>{'+source+'})()',context);
 assert.match(element('runtimeDetail').textContent,/首次启动/);
 response={running:false,pending:true,pets:[],runtime:{phase:'downloading',percent:42,message:'正在下载 Electron：42%'}};
 await element('start').onclick();assert.equal(element('runtimeProgress').hidden,false);assert.equal(element('runtimeProgress').value,42);assert.equal(element('start').disabled,true);
 response={running:false,pending:true,pets:[],runtime:{phase:'extracting',message:'正在解压 Electron'}};
 tick();await new Promise(r=>setImmediate(r));assert.match(element('runtimeDetail').textContent,/解压/);assert.equal(element('runtimeProgress').value,undefined);
 response={running:true,pending:false,pets:[],runtime:{phase:'ready',message:'Electron 已准备就绪，复用本地运行时'}};
 tick();await new Promise(r=>setImmediate(r));assert.match(element('runtimeDetail').textContent,/复用/);assert.equal(element('runtimeProgress').hidden,true);
 app.onteardown();
});
