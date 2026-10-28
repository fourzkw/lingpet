import test from 'node:test';
import assert from 'node:assert/strict';
import {petWindowSize,positionPetWindow,beginPetDrag} from '../desktop/window-geometry.js';
import {PET_SCALES} from '../src/pet-display.js';

test('holding a stationary pointer never repeatedly moves or resizes the window',()=>{
  const win={getPosition:()=>[120,80],setBounds(){assert.fail('stationary drag must not change bounds');}};
  const move=beginPetDrag(win,{x:150,y:100},1);
  for(let i=0;i<750;i++)assert.equal(move({x:150,y:100}),false);
});

test('dragging keeps the intended size despite native DPI rounding drift',()=>{
  for(const scale of PET_SCALES){
    const calls=[],size=petWindowSize(scale);
    let actual={x:-300,y:80,width:size.width+1,height:size.height+1};
    const win={getPosition:()=>[actual.x,actual.y],setBounds(bounds,animate){
      assert.equal(animate,false);calls.push(bounds);
      // Emulate an OS size that rounds upward after every move.
      actual={...bounds,width:bounds.width+1,height:bounds.height+1};
    }};
    const move=beginPetDrag(win,{x:-280,y:100},scale);
    for(let i=1;i<=750;i++){
      assert.equal(move({x:-280+i,y:100-i}),true);
      assert.deepEqual(calls.at(-1),{x:-300+i,y:80-i,...size});
      assert.equal(move({x:-280+i,y:100-i}),false);
    }
    assert.equal(calls.length,750);
    assert.equal(actual.width,size.width+1,'native rounding cannot accumulate');
  }
});

test('positioning and a subsequent drag use the selected pet size and fresh pointer origin',()=>{
  let bounds;
  const win={getPosition:()=>[bounds.x,bounds.y],setBounds:value=>{bounds=value;}};
  positionPetWindow(win,-250.2,100.8,1.25);
  assert.deepEqual(bounds,{x:-250,y:101,width:338,height:388});
  beginPetDrag(win,{x:-200,y:150},1.25)({x:-180,y:140});
  assert.deepEqual(bounds,{x:-230,y:91,width:338,height:388});
  beginPetDrag(win,{x:50,y:60},1.25)({x:55,y:70});
  assert.deepEqual(bounds,{x:-225,y:101,width:338,height:388});
});
