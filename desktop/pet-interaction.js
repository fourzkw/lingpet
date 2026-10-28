// Distinguish a tap from a drag, and recognize deliberate hover strokes.
// Coordinates are CSS pixels so behavior is stable across render resolutions.
export function createPetGestures(){
  let press=null,stroke=null,lastReaction=-Infinity;
  function resetStroke(){stroke=null;}
  function cancel(){const wasDragging=Boolean(press?.dragging);press=null;resetStroke();return wasDragging;}
  return {
    down({x,y,time,hit,button=0}){
      resetStroke();
      if(button!==0||!hit)return false;
      press={x,y,time,dragging:false};return true;
    },
    move({x,y,time,head,buttons=0,scale=1,sensitivity='normal'}){
      if(press){
        if(!press.dragging&&Math.hypot(x-press.x,y-press.y)>=6){press.dragging=true;return 'drag';}
        return null;
      }
      if(buttons||!head||time-lastReaction<1000){resetStroke();return null;}
      if(!stroke||time-stroke.time>450||time-stroke.start>1800){stroke={x,anchor:x,time,start:time,direction:0,turns:0,distance:0};return null;}
      const factor=Math.max(.5,Math.min(1.5,scale))*({gentle:1.4,normal:1,sensitive:.7}[sensitivity]??1);
      const dx=x-stroke.anchor;stroke.time=time;
      if(Math.abs(dx)<8*factor)return null;
      const direction=Math.sign(dx);
      if(stroke.direction&&direction!==stroke.direction)stroke.turns++;
      stroke.direction=direction;stroke.distance+=Math.abs(dx);stroke.anchor=x;
      if(stroke.turns>=2&&stroke.distance>=70*factor){lastReaction=time;resetStroke();return 'pet';}
      return null;
    },
    up({time}){
      const current=press;press=null;resetStroke();
      if(!current)return null;
      if(current.dragging)return 'drop';
      if(time-current.time>500||time-lastReaction<500)return null;
      lastReaction=time;return 'click';
    },
    cancel,
  };
}

// Local animation override: session updates remain authoritative and are never
// written back as demo or follow state. A real state change ends the interaction.
export function createPetReaction(){
  let active=null,sequence=0;
  return {
    start(kind,now,data,duration){active={kind,start:now,until:now+duration,key:data.animationKey,id:++sequence};},
    cancel(){active=null;},
    current(now,data){
      if(active&&(now>=active.until||data.animationKey!==active.key))active=null;
      return active;
    },
    frame(now,data,elapsed){
      const current=this.current(now,data);
      return current?{data:{...data,interaction:current.kind,current:{...data.current,state:current.kind==='pet'?'done':'input'},animationKey:`interaction:${current.id}`},elapsed:now-current.start}:{data,elapsed};
    },
  };
}
