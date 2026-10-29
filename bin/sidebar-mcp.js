#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createSidebarServer} from '../src/sidebar-server.js';
import {BridgeClient} from '../src/bridge-client.js';
import {dataDirectory} from '../src/paths.js';
import {describeRelease} from '../src/release.js';
import {randomUUID} from 'node:crypto';
import {createPetControl} from '../src/sidebar-control.js';
// Report plugin connectivity before the first Hook without inventing sessions
// or automatically starting the desktop when the user has closed it.
const source=process.argv.includes('--host=cursor')?'cursor':'codex',dir=dataDirectory();
const bridge=new BridgeClient({dir,instanceId:source+'-panel-'+randomUUID(),source,channel:'management',release:describeRelease(),logger:{warn(){}}});
const server=createSidebarServer(createPetControl(dir,{backgroundStart:true,source}));
server.server.onclose=()=>void bridge.close();
await server.connect(new StdioServerTransport());
bridge.start();
const shutdown=async()=>{await bridge.close();await server.close();};
process.stdin.once('end',()=>void shutdown());
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void shutdown());
