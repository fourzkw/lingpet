#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {normalizeCursorEvent} from '../src/cursor-observer.js';
import {forwardCursorEvent} from '../src/cursor-service.js';
import {cursorLeaseAllowed} from '../src/cursor-lease.js';

let raw,hook=process.argv[2],stage='input';
try{
  let size=0;const chunks=[];
  for await(const chunk of process.stdin){size+=chunk.length;if(size>8*1024*1024)throw new Error('Hook input too large');chunks.push(chunk);}
  stage='json';
  raw=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));
  // The argument selects the registered hook; never interpret input as shell code.
  const event=normalizeCursorEvent({...raw,hook_event_name:hook||raw.hook_event_name});
  stage='forward';
  if(event&&await cursorLeaseAllowed(dataDirectory()))await forwardCursorEvent(dataDirectory(),event);
}catch(error){process.stderr.write(`[board-pet] Cursor hook failed at ${stage} (${error.code||error.name||'unknown'}).\n`);}
// Cursor treats empty output as no decision for fail-open hooks. Do not return
// an allow/deny decision from an observer (verified against Cursor 3.24.12).
if(hook==='beforeSubmitPrompt')process.stdout.write('{"continue":true}\n');
else if(hook!=='preToolUse')process.stdout.write('{}\n');
