import {createHash} from 'node:crypto';
import {BUILTIN_CHARACTERS} from '../characters.js';

// Older official appearance packs used the appearance package ID as a role.
// Match those stable IDs, never display names or arbitrary manifest strings.
export function packageRole(pet){
 if(pet?.character)return pet.character;
 for(const role of BUILTIN_CHARACTERS)if(role.appearances.some(a=>pet?.id==='lingpet-'+a.asset))return {id:role.id,name:role.name,description:role.description};
}

export function packageCharacter(pet,source){
 const role=packageRole(pet);
 if(role&&BUILTIN_CHARACTERS.some(c=>c.id===role.id))return role.id;
 const namespace=source?.github?.repoId?`github:${source.github.repoId}`:`local:${pet.author}`;
 return 'community-'+createHash('sha256').update(namespace+'/'+(role?.id||pet.id)).digest('hex').slice(0,24);
}

export function normalizePackageCharacter(entry){
 const role=packageRole(entry.package);
 if(!entry.community||entry.projectId||!role)return entry;
 const character=packageCharacter(entry.package,entry.source);
 return {...entry,character,characterName:role.name,characterDescription:role.description,package:{...entry.package,character:role},aliases:[...(entry.aliases||[]),...(character!==entry.character?[{id:entry.id,character:entry.character}]:[])]};
}
