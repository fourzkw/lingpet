import {cp,readFile,mkdir,rename,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installCursorUserHooks} from '../src/cursor-hook-config.js';

const from=path.resolve(process.argv[2]||''),root=path.resolve(os.homedir(),'.cursor/plugins/local'),target=path.join(root,'board-pet');
if(!process.argv[2])throw new Error('Usage: node scripts/install-cursor-plugin.mjs <built-plugin-directory>');
const manifest=JSON.parse(await readFile(path.join(from,'.cursor-plugin/plugin.json'),'utf8'));
if(manifest.name!=='board-pet')throw new Error('Not a board-pet Cursor plugin');
await access(path.join(from,'runtime/bin/cursor-hook.js'));await access(path.join(from,'runtime/node_modules/electron/package.json'));
await mkdir(root,{recursive:true});
// Both resolved paths stay inside the explicitly selected local plugin directory.
if(path.dirname(target)!==root)throw new Error('Invalid plugin destination');
let existing,inPlace=false;try{existing=JSON.parse(await readFile(path.join(target,'.cursor-plugin/plugin.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(existing){
  if(existing.name!=='board-pet')throw new Error('Destination belongs to a different plugin');
  const backup=path.join(root,'board-pet.backup-'+Date.now());
  // Keep backups outside local discovery to avoid registering their hooks twice.
  const backupRoot=path.resolve(root,'../board-pet-backups');await mkdir(backupRoot,{recursive:true});
  const backupTarget=path.join(backupRoot,path.basename(backup));
  if(path.dirname(backupTarget)!==backupRoot)throw new Error('Invalid backup destination');
  try{await rename(target,backupTarget);}catch(error){
    if(!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
    // Windows may hold the plugin directory as a Hook process cwd. Snapshot it
    // before replacing owned files in place; no other plugin paths are touched.
    await cp(target,backupTarget,{recursive:true,errorOnExist:true,force:false});inPlace=true;
  }
}
await cp(from,target,{recursive:true,errorOnExist:!inPlace,force:inPlace});
await installCursorUserHooks(path.join(os.homedir(),'.cursor/hooks.json'),target);
console.log('Installed: '+target+'\nRestart Cursor, then start a new Agent conversation.');
