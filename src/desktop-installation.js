import path from 'node:path';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {json} from './integrations/files.js';

export async function desktopInstallation(dir){
  const value=await json(path.join(dir,'desktop-install.json'),null);
  if(!value)return null;
  if(value.format!==1||typeof value.root!=='string'||!path.isAbsolute(value.root))throw Error('本体安装记录损坏，请重新运行安装程序修复');
  const executable=path.join(value.root,'LingPet.exe');await access(executable);
  return {...value,executable,bridge:path.join(value.root,'LingPetBridge.exe')};
}
export async function startInstalledDesktop(dir,{dashboard=false,explicit=false}={}){
  const install=await desktopInstallation(dir);if(!install)return false;
  if(!explicit)return true;
  const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(install.executable,dashboard?['--dashboard']:[],{env,detached:true,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return true;
}
