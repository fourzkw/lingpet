import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {MarketService} from '../src/market/service.js';
import {loadCustomAppearances} from '../src/creation/catalog.js';
import {setCustomAppearances,appearanceInfo} from '../src/characters.js';
import {PetRegistry} from '../src/pet-registry.js';
const [base,id,file,dir]=process.argv.slice(2);const bytes=await readFile(file);await mkdir(dir,{recursive:true});const service=new MarketService(dir,{fetcher:async(url,options)=>String(url).startsWith('https://github.com/')?new Response(bytes):fetch(url,options)});await service.configure(base);assert.equal((await service.list()).pets.length,1);const installed=await service.install(id);setCustomAppearances(await loadCustomAppearances(dir));const r=new PetRegistry({}),old=structuredClone(r.pets[0]),pet=r.create({name:installed.appearance.package.name,character:installed.appearance.character,appearance:installed.appearance.id});assert.equal(appearanceInfo(pet).custom,true);assert.deepEqual(r.pets[0],old);assert.equal(installed.appearance.source.versionId,id);console.log(JSON.stringify({valid:true,goReviewed:true,nodeInstalled:true,sha256:installed.appearance.sha256,character:pet.character}));
