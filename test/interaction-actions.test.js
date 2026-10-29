import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {interactionDuration,readyInteraction,paintInteraction,readyInteractionManifest} from '../desktop/interaction-actions.js';
import {createPetReaction} from '../desktop/pet-interaction.js';

const assets=['claude','deepseek-h3','chatgpt-white-dragon-h3','chatgpt-dragon'];
for(const asset of assets)test(`${asset} has distinct complete one-shot click and pet assets`,async()=>{
  await readyInteractionManifest(asset);
  const root=path.resolve('assets/interactions',asset),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  const sources=JSON.parse(await readFile(path.join(root,'provenance.json'),'utf8'));
  assert.notEqual(sources.tasks.click,sources.tasks.pet,'two independent generation tasks');
  assert.notEqual(sources.inputs.idle.sha256,sources.inputs.done.sha256,'different generated videos');
  const sheets=[];
  for(const kind of ['click','pet']){
    const clip=manifest.clips[kind];assert.equal(clip.loop,false);
    assert.ok(interactionDuration(asset,kind)>=1500);assert.ok(clip.frames.length>=20);
    for(const variant of manifest.variants){
      const tile=variant==='original'?manifest.original.tileSize:manifest.tileSize,folder=variant==='original'?manifest.original.directory:'';
      const bytes=await readFile(path.join(root,folder,clip.file)),sheet=PNG.sync.read(bytes);sheets.push(bytes);
      assert.equal(sheet.width,tile*manifest.columns);assert.equal(sheet.height,tile*Math.ceil(clip.sourceFrames/manifest.columns));
      let ink=0,clear=0,soft=0;
      for(let i=3;i<sheet.data.length;i+=4){const alpha=sheet.data[i];if(alpha>0)ink++;else clear++;if(alpha>0&&alpha<255)soft++;}
      if(variant==='pixel')assert.equal(soft,0,'pixel alpha is binary');
      assert.ok(ink>tile*tile,'animation contains a visible character');assert.ok(clear>tile*tile,'background stays transparent');
    }
  }
  assert.notDeepEqual(sheets[0],sheets[manifest.variants.length],'click does not reuse pet frames');
});

test('dedicated playback uses its own sheets and clock, leaving session state intact',async t=>{
  const old=globalThis.Image;t.after(()=>globalThis.Image=old);globalThis.Image=class{async decode(){}};
  const data={animationKey:'session:working',settings:{variant:'pixel'},current:{state:'working'}},reaction=createPetReaction();
  reaction.start('pet',100,data,interactionDuration('claude','pet'));
  const frame=reaction.frame(300,data,1500);assert.equal(frame.data.interaction,'pet');assert.equal(data.current.state,'working');
  await readyInteraction('claude','pet');
  const draws=[],ctx={drawImage(image,...args){draws.push({url:image.src,args});}};
  assert.equal(paintInteraction(ctx,'claude',frame.data.interaction,frame.elapsed,256,256,'pixel',frame.data.animationKey),true);
  assert.match(draws[0].url,/interactions\/claude\/pet\.png$/);
  assert.equal(paintInteraction(ctx,'custom:other','pet',0,256,256,'pixel','test'),false);
  assert.equal(interactionDuration('custom:other','pet'),null);
});
