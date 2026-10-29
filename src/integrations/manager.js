import path from 'node:path';
import os from 'node:os';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {optional,json,atomic,digest} from './files.js';
import {createAdapterPackage,hookCommand} from './packages.js';
import {withInstallLock} from '../install-lock.js';
import {CURSOR_HOOKS} from '../cursor-observer.js';
import {removeCursorHooks} from '../cursor-hook-config.js';
import {compareVersions} from '../shared-runtime.js';
import {CODEX_INSTALL_HINT} from './guidance.js';

const run=promisify(execFile),sources=['dsh','cursor','codex'];
export class IntegrationManager{
  constructor({dir,root,bridge,version,home=os.homedir(),execute=run}){Object.assign(this,{dir,root,bridge,version,home,execute});this.base=path.join(dir,'integrations');this.file=path.join(this.base,'registry.json');this.live=new Map();}
  async records(){const data=await json(this.file,{format:1,items:[]});if(data.format!==1||!Array.isArray(data.items))throw Error('Agent 接入记录损坏，请从备份恢复');return data.items;}
  async save(items){await atomic(this.file,JSON.stringify({format:1,items},null,2));}
  async discover(){
    const records=await this.records(),result=[];
    for(const source of sources){
      const config=source==='codex'?(process.env.CODEX_HOME||path.join(this.home,'.codex')):source==='cursor'?path.join(this.home,'.cursor'):(process.env.DSH_HOME||path.join(this.home,'.dsh'));
      let detected=false;try{await access(config);detected=true;}catch{}
      let executable;const candidates=source==='cursor'?[]:[path.join(process.env.APPDATA||path.join(this.home,'AppData/Roaming'),'npm',source+'.cmd'),...(process.env.PATH||'').split(path.delimiter).flatMap(folder=>[path.join(folder,source+'.exe'),path.join(folder,source+'.cmd')])];
      for(const candidate of candidates)try{await access(candidate);executable=candidate;break;}catch{}
      result.push({source,config,detected,executable});
    }
    return {targets:result,items:records.map(item=>this.public(item))};
  }
  async plan({source,config,executable,profile='web'}){
    if(!sources.includes(source))throw Error('不支持的 Agent');
    if(!config||source!=='cursor'&&!executable){
      const detected=(await this.discover()).targets.find(item=>item.source===source);
      config=config||detected?.config;executable=executable||detected?.executable;
    }
    if(source!=='cursor'&&!executable)throw Error('未找到 '+(source==='dsh'?'DSH':'Codex')+' 命令，请先安装宿主后重试，或在高级选项中指定命令位置');
    if(typeof config!=='string'||!path.isAbsolute(config)||config===path.parse(config).root)throw Error('请选择宿主的绝对配置目录');
    if(source!=='cursor'&&(!executable||!path.isAbsolute(executable)||!['.exe','.cmd','.bat'].includes(path.extname(executable).toLowerCase())))throw Error('请选择宿主命令的 exe、cmd 或 bat 文件');
    if(source==='dsh'&&!/^[a-zA-Z0-9_-]{1,64}$/.test(profile))throw Error('无效 DSH profile');
    const items=await this.records(),existing=items.find(item=>item.source===source&&path.resolve(item.config).toLowerCase()===path.resolve(config).toLowerCase()&&(source!=='dsh'||item.profile===profile));
    const id=existing?.id||randomUUID(),packageRoot=path.join(this.base,'packages',id,this.version+'-'+randomUUID());
    const plan={id,source,config:path.resolve(config),executable,profile,packageRoot,version:this.version,previous:existing||null};
    if(source==='cursor'){
      const file=path.join(config,'hooks.json'),before=await optional(file),raw=before?JSON.parse(before.replace(/^\uFEFF/,'')):{},value=removeCursorHooks(raw,path.join(config,'plugins/local/board-pet')).value;
      if(value.version!==undefined&&value.version!==1||value.hooks!==undefined&&(!value.hooks||typeof value.hooks!=='object'||Array.isArray(value.hooks)))throw Error('Cursor Hooks 格式不兼容');
      const hooks={...value.hooks};
      for(const event of CURSOR_HOOKS){if(hooks[event]!==undefined&&!Array.isArray(hooks[event]))throw Error('Cursor Hook 列表无效');hooks[event]=[...(hooks[event]||[]).filter(row=>row.command!==hookCommand(this.bridge,id,event)),{command:hookCommand(this.bridge,id,event)}];}
      plan.changes=[{file,before,after:JSON.stringify({...value,version:1,hooks},null,2)+'\n',hash:digest(before)}];
      const mcpFile=path.join(config,'mcp.json'),mcpBefore=await optional(mcpFile),mcp=mcpBefore?JSON.parse(mcpBefore):{};
      if(mcp.mcpServers!==undefined&&(!mcp.mcpServers||typeof mcp.mcpServers!=='object'||Array.isArray(mcp.mcpServers)))throw Error('Cursor MCP 配置无效');
      plan.changes.push({file:mcpFile,before:mcpBefore,hash:digest(mcpBefore),after:JSON.stringify({...mcp,mcpServers:{...mcp.mcpServers,['lingpet-'+id]:{command:this.bridge,args:['mcp',id]}}},null,2)+'\n'});
    }else plan.changes=[];
    plan.steps=source==='cursor'?['写入轻量接入包','合并灵伴 Hooks，保留其他 Hooks','在 Cursor 重载窗口后发送一条消息']:source==='codex'?['准备轻量插件市场','调用 Codex 注册市场并安装插件',CODEX_INSTALL_HINT]:['准备轻量 DSH 插件','调用所选 DSH profile 安装插件','请重启 DSH，再发送一条消息验证接入。'];
    return plan;
  }
  async executeHost(item,args){
    const env={...process.env};if(item.source==='codex')env.CODEX_HOME=item.config;
    if(item.source==='dsh')env.DSH_HOME=item.config;
    // npm host shims still need Node; provide the same private runtime as the bridge.
    const active=await json(path.join(path.dirname(this.bridge),'active.json'),null);
    const hostPath=process.env.PATH||'';for(const key of Object.keys(env))if(key.toUpperCase()==='PATH')delete env[key];
    const runtime=active?.active&&/^[\w.-]+$/.test(active.active)?path.join(path.dirname(this.bridge),'versions',active.active):null;
    env.Path=runtime?[runtime,hostPath,path.join(runtime,'package-manager')].filter(Boolean).join(path.delimiter):hostPath;
    const execute=async(file,args,options)=>{try{return await this.execute(file,args,options);}catch(error){
      const detail=[error.stdout,error.stderr].filter(value=>typeof value==='string'&&value.trim()).join('\n').trim();
      if(detail)throw Error(detail.includes('ERR_PNPM_UNEXPECTED_STORE')?'DSH 的 pnpm 依赖存储与当前版本不兼容。请使用安装该 DSH 环境时的 pnpm 版本后重试。\n'+detail:detail);
      throw error;
    }};
    // CMD scripts need an explicit shell; reject expansion/metacharacters before quoting.
    if(/\.(cmd|bat)$/i.test(item.executable)){
      const all=[item.executable,...args];if(all.some(value=>/["%\r\n&|<>^!]/.test(value)))throw Error('宿主命令路径不支持特殊字符，请选择 exe 或更换路径');
      return execute(process.env.COMSPEC||'cmd.exe',['/d','/s','/c','"'+all.map(value=>'"'+value+'"').join(' ')+'"'],{env,windowsHide:true,windowsVerbatimArguments:true,timeout:60000,maxBuffer:1024*1024});
    }
    return execute(item.executable,args,{env,windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  }
  async install(input){
    await mkdir(this.base,{recursive:true});
    return withInstallLock(path.join(this.base,'install.lock'),async()=>{
      const plan=await this.plan(input),items=await this.records(),transaction=path.join(this.base,'transactions',randomUUID());await mkdir(transaction,{recursive:true});
      const token=plan.previous?.token||randomBytes(32).toString('hex'),controlToken=plan.previous?.controlToken||randomBytes(32).toString('hex');
      const item={id:plan.id,source:plan.source,config:plan.config,executable:plan.executable,profile:plan.profile,packageRoot:plan.packageRoot,version:this.version,token,controlToken,enabled:false,state:'installing',nextSteps:plan.steps.at(-1),transaction};
      const checkpoint=async()=>{await atomic(path.join(transaction,'transaction.json'),JSON.stringify({plan,state:item.state},null,2));await this.save([...items.filter(row=>row.id!==item.id),item]);};
      await checkpoint();
      try{
        await mkdir(item.config,{recursive:true});
        await createAdapterPackage({...item,destination:item.packageRoot,bridge:this.bridge,templateRoot:this.root,dir:this.dir});
        for(const change of plan.changes){if(digest(await optional(change.file))!==change.hash)throw Error('宿主配置已变化，请重新安装');await atomic(path.join(transaction,path.basename(change.file)+'.before'),change.before??'');await atomic(change.file,change.after);}
        if(item.source==='codex'){
          await this.installCodex(item,plan.previous);
        }else if(item.source==='dsh')await this.executeHost(item,['plugin','--profile',item.profile,'add','file:'+item.packageRoot]);
        await atomic(path.join(this.base,'clients',item.id+'.json'),JSON.stringify({format:1,id:item.id,source:item.source,token,controlToken,dir:this.dir}));
        item.enabled=true;item.state='installed';await checkpoint();return this.public(item);
      }catch(error){
        item.state='partial';item.error=String(error.message).slice(0,3000);
        for(const change of plan.changes)if(await optional(change.file)===change.after)await atomic(change.file,change.before??'{}\n');
        await checkpoint();throw Error('接入未完成：'+item.error+'。记录已保留，可修复或卸载。');
      }
    });
  }
  async installCodex(item,previous){
    const name='lingpet-'+item.id,selector='board-pet@'+name;
    let before=null,removed=false,registered=false;
    if(previous){
      const {stdout}=await this.executeHost(item,['plugin','marketplace','list','--json']);
      const listing=JSON.parse(stdout);
      if(!Array.isArray(listing.marketplaces))throw Error('无法读取 Codex 插件市场列表');
      before=listing.marketplaces.find(market=>market.name===name)||null;
      if(before&&(typeof before.root!=='string'||!path.isAbsolute(before.root)))throw Error('Codex 接入市场来源无效');
    }
    try{
      const same=before&&path.resolve(before.root).toLowerCase()===path.resolve(item.packageRoot).toLowerCase();
      if(before&&!same){await this.executeHost(item,['plugin','marketplace','remove',name]);removed=true;}
      if(!same){await this.executeHost(item,['plugin','marketplace','add',item.packageRoot]);registered=true;}
      await this.executeHost(item,['plugin','add',selector]);
    }catch(error){
      if(removed)try{
        if(registered)await this.executeHost(item,['plugin','marketplace','remove',name]);
        await this.executeHost(item,['plugin','marketplace','add',before.root]);
        await this.executeHost(item,['plugin','add',selector]);
      }catch(restoreError){throw Error(error.message+'；原接入市场恢复未完成：'+restoreError.message);}
      throw error;
    }
  }
  public({token,controlToken,...item}){
    let updateAvailable=false;
    if(item.state==='installed')try{updateAvailable=compareVersions(item.version,this.version)<0;}catch{}
    return {...item,updateAvailable,availableVersion:this.version,connection:this.live.get(item.id)||null};
  }
  async authorize(token,control=false){return (await this.records()).find(item=>item.enabled&&(control?item.controlToken:item.token)===token);}
  note(id,details){this.live.set(id,{...this.live.get(id),...details,updatedAt:Date.now()});}
  async inspect(id){
    const item=(await this.records()).find(item=>item.id===id);if(!item)throw Error('接入不存在');
    let filesReady=true;try{await access(path.join(item.packageRoot,'lingpet-adapter.json'));}catch{filesReady=false;}
    let registered=null;if(item.source==='cursor'){const value=await json(path.join(item.config,'hooks.json'),{});registered=CURSOR_HOOKS.every(event=>value.hooks?.[event]?.some(row=>row.command===hookCommand(this.bridge,id,event)));}
    return {...this.public(item),filesReady,registered};
  }
  async remove(id){
    await mkdir(this.base,{recursive:true});return withInstallLock(path.join(this.base,'install.lock'),async()=>{
      const items=await this.records(),item=items.find(row=>row.id===id);if(!item)throw Error('接入不存在');
      item.enabled=false;await this.save(items);this.live.delete(id);
      try{
        if(item.source==='cursor'){
          const file=path.join(item.config,'hooks.json'),before=await optional(file);if(before){const value=JSON.parse(before.replace(/^\uFEFF/,''));for(const event of CURSOR_HOOKS)if(Array.isArray(value.hooks?.[event])){value.hooks[event]=value.hooks[event].filter(row=>row.command!==hookCommand(this.bridge,id,event));if(!value.hooks[event].length)delete value.hooks[event];}if(await optional(file)!==before)throw Error('宿主配置已变化，请重试');await atomic(path.join(item.transaction,'hooks.before-remove.json'),before);await atomic(file,JSON.stringify(value,null,2)+'\n');}
          const mcpFile=path.join(item.config,'mcp.json'),mcpBefore=await optional(mcpFile);if(mcpBefore){const value=JSON.parse(mcpBefore),entry=value.mcpServers?.['lingpet-'+id];if(entry?.command===this.bridge&&entry.args?.[0]==='mcp'&&entry.args?.[1]===id){delete value.mcpServers['lingpet-'+id];if(await optional(mcpFile)!==mcpBefore)throw Error('MCP 配置已变化，请重试');await atomic(path.join(item.transaction,'mcp.before-remove.json'),mcpBefore);await atomic(mcpFile,JSON.stringify(value,null,2)+'\n');}}
        }else if(item.source==='codex'){
          await this.executeHost(item,['plugin','remove','board-pet@lingpet-'+id]);
          await this.executeHost(item,['plugin','marketplace','remove','lingpet-'+id]);
        }else await this.executeHost(item,['plugin','--profile',item.profile,'remove','lingpet-agent']);
        item.state='removed';item.nextSteps='如宿主仍在运行，请重新加载以卸载已加载组件';delete item.error;await this.save(items);return this.public(item);
      }catch(error){item.state='remove-pending';item.error=String(error.message).slice(0,600);await this.save(items);throw Error('已停止接收事件，宿主清理尚未完成：'+item.error);}
    });
  }
}
