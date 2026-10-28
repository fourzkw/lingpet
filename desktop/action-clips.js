// Shared frame clock for authored character actions and one-time entrances.
export function clipDuration(clip){return clip.durations.reduce((sum,ms)=>sum+ms,0);}
export function clipCandidates(clip){return [clip,...(clip.alternatives||[])];}
export function maxClipDuration(clip){return Math.max(...clipCandidates(clip).map(clipDuration));}
export function validClipSet(clip){
  return !!clip&&typeof clip==='object'&&(!('selection' in clip)||['random','round-robin'].includes(clip.selection))&&
    (!('alternatives' in clip)||(Array.isArray(clip.alternatives)&&clip.alternatives.length<=7&&clip.alternatives.every(c=>c&&typeof c==='object'&&!('alternatives' in c)&&!('selection' in c)&&c.loop===clip.loop)));
}
// One clock per player, shared by original/pixel renders. A non-looping action
// chooses only on entry; looping alternatives change at whole-clip boundaries.
export function createClipSelector({random=Math.random}={}){
  const previous=new Map();let active;
  function choose(state,clip){
    const count=clipCandidates(clip).length,last=previous.get(state);
    let index=0;
    if(count>1){
      if(clip.selection==='round-robin')index=last===undefined?0:(last+1)%count;
      else {const choices=count-(last===undefined?0:1);index=Math.min(choices-1,Math.floor(Math.max(0,random())*choices));if(last!==undefined&&index>=last)index++;}
    }
    previous.set(state,index);return index;
  }
  return (state,clip,elapsed,entryKey)=>{
    const time=Math.max(0,Number.isFinite(elapsed)?elapsed:0),candidates=clipCandidates(clip);
    if(!active||active.state!==state||active.entryKey!==entryKey||time<active.time){active={state,entryKey,time,start:0,index:choose(state,clip)};}
    let selected=candidates[active.index];
    if(candidates.length>1&&clip.loop){
      // Bound work after a suspended window; resume at a fresh cycle.
      let steps=0;
      while(time-active.start>=clipDuration(selected)){
        active.start+=clipDuration(selected);active.index=choose(state,clip);selected=candidates[active.index];
        if(++steps>=256){active.start=time;break;}
      }
    }
    active.time=time;return {clip:selected,index:active.index,elapsed:time-active.start};
  };
}
export function clipFrame(clip,elapsed){
  let time=Math.max(0,Number.isFinite(elapsed)?elapsed:0),duration=clipDuration(clip);
  if(time>=duration){
    if(!clip.loop)return clip.frames.at(-1);
    const intro=clip.durations.slice(0,clip.loopFrom??0).reduce((sum,ms)=>sum+ms,0);
    time=intro+(time-duration)%(duration-intro);
  }
  for(let i=0;i<clip.frames.length;i++){
    if(time<clip.durations[i])return clip.frames[i];
    time-=clip.durations[i];
  }
  return clip.frames.at(-1);
}
