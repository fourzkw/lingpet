import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';
import {PetRegistry} from '../src/pet-registry.js';
const require=createRequire(import.meta.url),electron=require('electron');
const dir=await mkdtemp(path.join(PACKAGE_ROOT,'.test-data-settings-ui-'));
const config=new PetRegistry({}).config;config.pets[0].name='恢复前的伙伴';
const out=path.join(PACKAGE_ROOT,'artifacts/settings-recovery-smoke');await mkdir(out,{recursive:true});
try{
  await writeFile(path.join(dir,'settings.json'),'{broken');
  await writeFile(path.join(dir,'settings.json.bak'),JSON.stringify(config));
  const env={...process.env,BOARD_PET_DATA_DIR:dir,BOARD_PET_SMOKE:'settings-recovery'};
  delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  delete env.BOARD_PET_LIFECYCLE_SMOKE;delete env.BOARD_PET_MULTI_SMOKE;
  const child=spawn(electron,[path.join(PACKAGE_ROOT,'scripts/settings-recovery-smoke.mjs')],{env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>child.kill(),60000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
  if(code!==0)throw new Error('配置恢复桌面验收失败：'+code);
}finally{
  if(path.dirname(path.resolve(dir))!==path.resolve(PACKAGE_ROOT)||!path.basename(dir).startsWith('.test-data-settings-ui-'))throw new Error('无效测试目录');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
