import test from 'node:test';
import assert from 'node:assert/strict';
import {createPetGestures,createPetReaction} from '../desktop/pet-interaction.js';

const point=(x,time,extra={})=>({x,y:20,time,hit:true,head:true,buttons:0,...extra});
test('head stroke distances scale with pet size and sensitivity without reducing reversal requirement',()=>{
  for(const scale of [.5,1,1.5])for(const sensitivity of ['gentle','normal','sensitive']){
    const factor=scale*({gentle:1.4,normal:1,sensitive:.7}[sensitivity]),g=createPetGestures();
    for(const [i,x] of [0,30*factor,0,30*factor].entries())assert.equal(g.move(point(x,i*100,{scale,sensitivity})),i===3?'pet':null);
  }
  const g=createPetGestures();for(const [i,x]of [0,10,0,10].entries())assert.equal(g.move(point(x,i*100,{scale:1.5,sensitivity:'gentle'})),null);
});
test('a light tap responds without starting a drag; small jitter is tolerated',()=>{
  const gestures=createPetGestures();
  assert.equal(gestures.down(point(30,0)),true);
  assert.equal(gestures.move(point(33,50,{buttons:1})),null);
  assert.equal(gestures.up({time:100}),'click');
  gestures.down(point(30,200));assert.equal(gestures.up({time:250}),null,'rapid repeat is limited');
});

test('movement starts one drag and release never also triggers a click',()=>{
  const gestures=createPetGestures();gestures.down(point(30,0));
  assert.equal(gestures.move(point(37,20,{buttons:1})),'drag');
  assert.equal(gestures.move(point(60,40,{buttons:1})),null);
  assert.equal(gestures.up({time:100}),'drop');
  gestures.down(point(30,200));gestures.move(point(45,250,{buttons:1}));
  assert.equal(gestures.cancel(),true);assert.equal(gestures.up({time:300}),null);
});

test('background, right click and a stationary long press do not respond',()=>{
  const gestures=createPetGestures();
  assert.equal(gestures.down(point(30,0,{hit:false})),false);
  assert.equal(gestures.down(point(30,0,{button:2})),false);
  assert.equal(gestures.up({time:50}),null);
  gestures.down(point(30,100));assert.equal(gestures.up({time:700}),null);
});

test('head strokes need deliberate back and forth movement; jitter and one pass are ignored',()=>{
  const gestures=createPetGestures();
  for(let i=0;i<12;i++)assert.equal(gestures.move(point(30+i%2,i*10)),null);
  assert.equal(gestures.move(point(65,150)),null);
  assert.equal(gestures.move(point(30,250)),null);
  assert.equal(gestures.move(point(65,350)),'pet');
  assert.equal(gestures.move(point(30,400)),null,'cooldown');
});

test('leaving the head, holding a button, or pausing breaks a stroke',()=>{
  for(const breakPoint of [{head:false},{buttons:1},{time:1000}]){
    const gestures=createPetGestures();gestures.move(point(30,0));gestures.move(point(70,100));
    gestures.move(point(30,200,breakPoint));
    assert.equal(gestures.move(point(70,1100)),null);
  }
});

test('reactions are local, expire, and yield immediately to an incoming session state',()=>{
  const reaction=createPetReaction(),data={animationKey:'session:working',settings:{variant:'original'},current:{state:'working'}};
  reaction.start('click',100,data,1800);
  const frame=reaction.frame(150,data,900);
  assert.equal(frame.data.current.state,'input');assert.equal(frame.elapsed,50);
  assert.equal(frame.data.settings.variant,'original');assert.equal(data.current.state,'working');
  assert.equal(reaction.frame(1900,data,2650).data,data);
  reaction.start('pet',2000,data,5250);
  assert.equal(reaction.frame(2100,data,2800).data.current.state,'done');
  const incoming={...data,animationKey:'session:approval',current:{state:'approval'}};
  assert.equal(reaction.frame(2150,incoming,0).data,incoming);
  assert.equal(reaction.current(2200,data),null);
});
