import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {atomicRename} from '../atomic-directory.js';

export async function optional(file){try{return await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export const digest=value=>createHash('sha256').update(value??'').digest('hex');
export async function atomic(file,value){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,value,{mode:0o600});await atomicRename(temp,file);}
export async function json(file,fallback){const value=await optional(file);return value===null?fallback:JSON.parse(value.replace(/^\uFEFF/,''));}
export function inside(root,file){const relative=path.relative(path.resolve(root),path.resolve(file));return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
