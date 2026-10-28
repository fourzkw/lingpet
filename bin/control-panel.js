#!/usr/bin/env node
import {startControlPanel} from '../src/control-panel.js';
import {dataDirectory} from '../src/paths.js';
const panel=await startControlPanel(dataDirectory());
console.log(panel.url);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await panel.close();process.exit();});
