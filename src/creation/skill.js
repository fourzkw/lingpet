import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function registerCreationSkill(ctx){
  const file=fileURLToPath(new URL('../../skills/board-pet-creator/SKILL.md',import.meta.url));
  async function load(signal){
    const raw=await readFile(file,{encoding:'utf8',signal}),match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if(!match)throw new Error('桌宠创作 Skill 元数据缺失');
    const name=match[1].match(/^name:\s*(.+)$/m)?.[1].trim(),description=match[1].match(/^description:\s*(.+)$/m)?.[1].trim();
    return {name,description,source:'bundled',provider:'board-pet',path:file,resourceBase:{kind:'directory',path:path.dirname(file)},invocation:{modelInvocable:true,userInvocable:true},content:match[2]};
  }
  ctx.skills.registerProvider(control=>({name:'board-pet',list:async options=>{const definition=await load(options.signal||control.signal);const {content,...summary}=definition;return [{...summary,rank:600,locator:definition.name}];},get:async(_candidate,options)=>load(options.signal||control.signal)}));
}
