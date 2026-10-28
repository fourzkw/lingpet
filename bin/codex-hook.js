#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {normalizeCodexEvent} from '../src/codex-observer.js';
import {forwardCodexEvent} from '../src/codex-service.js';
try{
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>8*1024*1024)throw new Error('Hook input too large');chunks.push(chunk);}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));
  const event=normalizeCodexEvent({...raw,hook_event_name:process.argv[2]||raw.hook_event_name});
  if(event)await forwardCodexEvent(dataDirectory(),event);
}catch(error){process.stderr.write(`[board-pet] Codex observer unavailable (${error.code||error.name||'unknown'}).\n`);}
// Empty decisions preserve all approval and continuation policies. Never print context.
process.stdout.write('{}\n');
