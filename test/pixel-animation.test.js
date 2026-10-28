import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {animatePixels,pixelateRGBA,animationFrame,FRAME_COUNT,FRAME_MS,PIXEL_SIZE,STATES} from '../desktop/pixel-pet.js';
const hash=pixels=>createHash('sha256').update(pixels).digest('hex');
function fixture(){
  const data=new Uint8ClampedArray(PIXEL_SIZE*PIXEL_SIZE*4);
  for(let y=16;y<113;y++)for(let x=16;x<113;x++){
    const i=(y*128+x)*4;data.set([x*2,y*2,(x+y)%256,255],i);
  }
  return data;
}
test('pixel conversion preserves colors with fine quantization and binary transparency',()=>{
  const input=new Uint8ClampedArray([211,135,63,255,90,120,160,127,33,66,99,128]);
  assert.deepEqual([...pixelateRGBA(input)],[208,136,64,255,0,0,0,0,32,64,96,255]);
  assert.equal(input[0],211);
});
test('animation clock advances and loops',()=>{
  assert.equal(animationFrame(0),0);assert.equal(animationFrame(FRAME_MS),1);
  assert.equal(animationFrame(FRAME_COUNT*FRAME_MS),0);
  for(const time of [-200,NaN,Infinity])assert.equal(animationFrame(time),0);
});
for(const character of ['claude','deepseek']){
  test(`${character}: all eight animations preserve the exact source pose at frame zero`,()=>{
    const source=fixture(),original=hash(source);
    for(const state of STATES){
      assert.deepEqual(animatePixels(source,character,state,0),source);
      const frames=new Set(Array.from({length:FRAME_COUNT},(_,f)=>hash(animatePixels(source,character,state,f))));
      assert.ok(frames.size>=4,`${state}: ${frames.size} distinct frames`);
      assert.deepEqual(animatePixels(source,character,state,FRAME_COUNT),source);
    }
    assert.equal(hash(source),original,'original art is never modified');
  });
  test(`${character}: local parts move while the breathing phase is identical`,()=>{
    const source=fixture();
    // Frames 2 and 14 have the same slow phase but opposite typing phase.
    const a=animatePixels(source,character,'working',2),b=animatePixels(source,character,'working',14);
    assert.notEqual(hash(a),hash(b));
    const colors=new Set();for(let i=0;i<source.length;i+=4)colors.add(source.slice(i,i+4).join(','));
    for(let i=0;i<a.length;i+=4)assert.ok(colors.has(a.slice(i,i+4).join(',')),'all pixels sampled from source art');
  });
}
