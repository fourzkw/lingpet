#!/usr/bin/env node
import {dataDirectory} from '../src/paths.js';
import {startCodexService} from '../src/codex-service.js';
const service=await startCodexService(dataDirectory());
if(service)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void service.close());
