import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Only malformed JSON/configuration is recoverable. Permission and disk errors
// must surface instead of silently replacing a user's settings with defaults.
export class SettingsStore {
  constructor(dir,normalize){
    this.file=path.join(dir,'settings.json');this.backup=this.file+'.bak';
    this.normalize=normalize;this.queue=Promise.resolve();this.recovery=null;
  }
  decode(text){
    try{const raw=JSON.parse(text);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('配置需为对象');if(raw.schemaVersion!==undefined&&![1,2].includes(raw.schemaVersion))throw new Error('不支持的配置版本');return this.normalize(raw);}
    catch(cause){throw Object.assign(new Error('桌宠配置内容损坏',{cause}),{code:'INVALID_SETTINGS'});}
  }
  async read(file){
    try{const text=await readFile(file,'utf8');try{return {text,config:this.decode(text)};}catch(error){if(error.code==='INVALID_SETTINGS')return {text,invalid:true};throw error;}}
    catch(error){if(error.code==='ENOENT')return {missing:true};throw error;}
  }
  async atomic(file,text){
    const temp=file+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,text,{flag:'wx',mode:0o600});await rename(temp,file);}
    finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async preserve(text,label='corrupt'){
    const file=this.file+'.'+label+'-'+Date.now()+'-'+randomUUID()+'.json';
    await writeFile(file,text,{flag:'wx',mode:0o600});return path.basename(file);
  }
  async load(){
    await mkdir(path.dirname(this.file),{recursive:true});
    const current=await this.read(this.file);
    if(current.config){
      this.legacy=JSON.parse(current.text).schemaVersion!==2;
      if(this.legacy)await this.preserve(current.text,'v1-backup');
      // Seed the backup on the first successful launch, without replacing a
      // previous valid revision that the user may want to restore.
      const backup=await this.read(this.backup);
      if(!backup.config)await this.atomic(this.backup,JSON.stringify(current.config,null,2));
      return current.config;
    }
    const backup=await this.read(this.backup);
    if(current.missing&&backup.missing)return this.normalize({});
    const preserved=current.invalid?await this.preserve(current.text):null;
    if(backup.invalid)await this.preserve(backup.text,'backup-corrupt');
    const config=backup.config??this.normalize({});
    this.recovery={source:backup.config?'backup':'defaults',preserved};
    await this.atomic(this.file,JSON.stringify(config,null,2));
    await this.atomic(this.backup,JSON.stringify(config,null,2));
    return config;
  }
  serialize(task){
    const result=this.queue.then(task);this.queue=result.catch(()=>{});return result;
  }
  save(config){
    const text=JSON.stringify(config,null,2);this.decode(text);
    return this.serialize(async()=>{
      const current=await this.read(this.file);
      if(current.config&&JSON.stringify(current.config,null,2)===text){
        if(!(await this.read(this.backup)).config)await this.atomic(this.backup,text);
        if(current.text!==text)await this.atomic(this.file,text);
        return;
      }
      if(current.config)await this.atomic(this.backup,JSON.stringify(current.config,null,2));
      else if(current.invalid)await this.preserve(current.text);
      else if(!(await this.read(this.backup)).config)await this.atomic(this.backup,text);
      await this.atomic(this.file,text);
    });
  }
  restore(){
    return this.serialize(async()=>{
      const backup=await this.read(this.backup);
      if(!backup.config)throw new Error('没有可用的配置备份');
      const current=await this.read(this.file);
      const preserved=current.text!==undefined?await this.preserve(current.text,'before-restore'):null;
      await this.atomic(this.file,JSON.stringify(backup.config,null,2));
      this.recovery={source:'manual',preserved};return backup.config;
    });
  }
}
