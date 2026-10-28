#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {startCursorService} from '../src/cursor-service.js';
const service=await startCursorService(dataDirectory());
if(service){for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void service.close());}
