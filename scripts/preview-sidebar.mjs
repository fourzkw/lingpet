import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const source=`import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const frame=document.getElementById('app');
const bridge=new AppBridge(null,{name:'Board Pet UI QA',version:'1'},{serverTools:{}},{hostContext:{theme:'dark',displayMode:'fullscreen',availableDisplayModes:['fullscreen']}});
let running=false;
const state=()=>({content:[],structuredContent:{running,pets:running?[{id:'test',name:'测试桌宠',enabled:true,visible:true}]:[]}});
bridge.oncalltool=async params=>{const action=params.arguments?.action;if(action==='start'||action==='settings')running=true;if(action==='stop')running=false;return state();};
bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{}});await bridge.sendToolResult(state());};
await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.src='/app';`;
const output=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'qa.js'},bundle:true,write:false,format:'esm',platform:'browser',minify:true});
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body style="margin:0;background:#14171d;color:#999;font:12px sans-serif"><div style="padding:8px">界面验收环境 · 使用模拟桌宠状态</div><iframe id="app" sandbox="allow-scripts allow-same-origin" style="border:0;width:100%;height:90vh"></iframe><script type="module" src="/host.js"></script></body></html>');}
  else if(req.url==='/host.js'){res.setHeader('Content-Type','text/javascript');res.end(output.outputFiles[0].text);}
  else if(req.url==='/app'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile('desktop/sidebar-app.html'));}
  else{res.statusCode=404;res.end();}
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
