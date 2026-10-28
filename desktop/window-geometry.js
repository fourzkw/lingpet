export function petWindowSize(scale){
  return {width:Math.round(270*scale),height:Math.round(310*scale)};
}

export function positionPetWindow(win,x,y,scale){
  // Supply the intended DIP size on every move. Reusing a native window's size
  // through setPosition can accumulate rounding errors at fractional Windows DPI.
  win.setBounds({x:Math.round(x),y:Math.round(y),...petWindowSize(scale)},false);
}

export function beginPetDrag(win,cursor,scale){
  const [originX,originY]=win.getPosition();
  const startX=cursor.x,startY=cursor.y;
  let lastX=originX,lastY=originY;
  return current=>{
    const x=Math.round(originX+current.x-startX),y=Math.round(originY+current.y-startY);
    if(x===lastX&&y===lastY)return false;
    positionPetWindow(win,x,y,scale);
    lastX=x;lastY=y;
    return true;
  };
}
