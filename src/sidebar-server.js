import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {registerAppTool,registerAppResource,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {createPetControl} from './sidebar-control.js';
import {dataDirectory} from './paths.js';
import {CreationService} from './creation/service.js';
import {registerCreationTools} from './creation/tools.js';

export const SIDEBAR_URI='ui://board-pet/control.html';
export function createSidebarServer(control=createPetControl(dataDirectory()),creation=new CreationService(dataDirectory())){
  const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#94ac81" d="M7 13 5 3l9 6h4l9-6-2 10v9c0 9-18 9-18 0Z"/><circle cx="12" cy="18" r="2"/><circle cx="21" cy="18" r="2"/></svg>');
  const server=new McpServer({name:'board-pet',version:'0.4.4',title:'灵伴桌宠',icons:[{src:icon,mimeType:'image/svg+xml',sizes:['any']} ]});
  const result=async action=>{
    try{return {content:[],structuredContent:await control.run(action)};}
    catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
  };
  registerAppTool(server,'board_pet_open',{
    title:'灵伴桌宠',description:'打开灵伴桌宠管理面板，查看状态并手动启动或关闭桌宠。',inputSchema:{},
    annotations:{readOnlyHint:true,openWorldHint:false},
    _meta:{ui:{resourceUri:SIDEBAR_URI},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}},
  },()=>result('status'));
  server.registerTool('board_pet_control',{
    title:'管理桌宠',description:'由桌宠管理面板调用，启动桌宠、关闭全部桌宠或打开工作台。',
    inputSchema:{action:z.enum(['start','stop','settings','status'])},
    annotations:{destructiveHint:false,openWorldHint:false},_meta:{ui:{visibility:['app']}},
  },({action})=>result(action));
  registerAppResource(server,'灵伴桌宠管理',SIDEBAR_URI,{},async()=>({contents:[{
    uri:SIDEBAR_URI,mimeType:RESOURCE_MIME_TYPE,text:await readFile(new URL('../desktop/sidebar-app.html',import.meta.url),'utf8'),
    _meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{preferredDisplayMode:'fullscreen',availableDisplayModes:['fullscreen','inline']}},
  }]}));
  registerCreationTools(server,creation);
  return server;
}





