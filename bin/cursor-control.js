#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {cursorDirectory} from '../src/cursor-service.js';
const endpoint=await readEndpoint(cursorDirectory(dataDirectory()));
try{
  if(!endpoint)throw new Error('Cursor bridge offline');
  const command=process.argv[2]||'status';
  if(command==='stop'){await request(endpoint,'/quit',{});console.log('Cursor bridge stopped; shared pet remains running.');}
  else if(command==='status'){const health=await request(endpoint,'/health');console.log(JSON.stringify({running:true,pid:endpoint.pid,sessions:health.sessions}));}
  else throw new Error('Usage: cursor-control.js [status|stop]');
}catch{console.log('Cursor bridge offline.');process.exitCode=process.argv[2]==='stop'?0:1;}
