import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const plugin=process.argv[2]||path.join(os.homedir(),'.codex/plugins/cache/board-pet-local/board-pet/local');
const manifest=JSON.parse(await readFile(path.join(plugin,'plugin.json'),'utf8'));
const config=JSON.parse(await readFile(path.join(plugin,'.mcp.json'),'utf8')).mcpServers['board-pet'];
const client=new Client({name:'board-pet-package-test',version:'0.3.1'});
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:config.args,cwd:plugin,stderr:'pipe'}));
  const {tools}=await client.listTools();const entry=tools.find(t=>t.name==='board_pet_open');
  assert.ok(entry._meta['openai/ui'].entrypoints.some(e=>e.type==='global'));
  const resource=await client.readResource({uri:entry._meta.ui.resourceUri});assert.match(resource.contents[0].text,/关闭全部桌宠/);
  const result=await client.callTool({name:entry.name,arguments:{}});assert.equal(typeof result.structuredContent.running,'boolean');
  const summary={version:manifest.version,transport:'stdio',entrypoints:entry._meta['openai/ui'].entrypoints,tools:tools.map(t=>t.name),resourceBytes:Buffer.byteLength(resource.contents[0].text),running:result.structuredContent.running};
  await mkdir('artifacts/sidebar-package-smoke',{recursive:true});await writeFile('artifacts/sidebar-package-smoke/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await client.close();}
