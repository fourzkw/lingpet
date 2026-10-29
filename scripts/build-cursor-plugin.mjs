import {cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {copyReleaseRuntime,copyHostDependencies} from './release-content.mjs';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

// A fresh output directory keeps old package files out of a new release.
const destination=path.resolve(process.argv[2]||path.join(PACKAGE_ROOT,'artifacts','lingpet-cursor-'+Date.now()));
await mkdir(destination,{recursive:false});
await cp(path.join(PACKAGE_ROOT,'cursor-plugin'),destination,{recursive:true});
const manifestFile=path.join(destination,'.cursor-plugin/plugin.json'),manifest=JSON.parse(await readFile(manifestFile,'utf8'));manifest.version=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'package.json'),'utf8')).version;await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
const runtime=path.join(destination,'runtime');await mkdir(runtime);
const resources=await copyReleaseRuntime(PACKAGE_ROOT,runtime);
await cp(path.join(PACKAGE_ROOT,'skills'),path.join(destination,'skills'),{recursive:true});
// Cursor plugin MCP discovery uses mcp.json, with explicit plugin-root expansion.
await writeFile(path.join(destination,'mcp.json'),JSON.stringify({mcpServers:{'board-pet':{command:'node',args:['${CURSOR_PLUGIN_ROOT}/runtime/bin/sidebar-mcp.js','--host=cursor'],cwd:'${CURSOR_PLUGIN_ROOT}'}}},null,2));
const dependencies=await copyHostDependencies(PACKAGE_ROOT,runtime);
await writeFile(path.join(destination,'build.json'),JSON.stringify({format:1,node:process.version,platform:process.platform,arch:process.arch,...resources,...dependencies},null,2));
console.log(destination);
