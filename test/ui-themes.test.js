import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePetConfig} from '../src/pet-registry.js';
import {UI_THEMES,normalizeTheme,requireTheme} from '../src/ui-themes.js';

test('existing pet configurations get paper theme without changing pets or login preference',()=>{
 const initial=migratePetConfig({character:'deepseek',x:-180,y:220,petVisible:false,launchAtLogin:true});
 assert.equal(initial.global.theme,'paper-journal');assert.equal(initial.global.launchAtLogin,true);
 const pets=structuredClone(initial.pets);
 for(const theme of UI_THEMES){const loaded=migratePetConfig({...initial,global:{...initial.global,theme:theme.id}});assert.equal(loaded.global.theme,theme.id);assert.deepEqual(loaded.pets,pets);assert.deepEqual(migratePetConfig(loaded),loaded);}
});
test('unknown persisted themes recover to paper; invalid IPC selections reject',()=>{
 assert.equal(normalizeTheme('missing'),'paper-journal');assert.equal(migratePetConfig({schemaVersion:2,pets:[],global:{theme:'missing'}}).global.theme,'paper-journal');
 for(const value of [null,{},'missing','__proto__'])assert.throws(()=>requireTheme(value));
});
