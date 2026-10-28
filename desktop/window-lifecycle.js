// BrowserWindow.webContents itself throws after the native window is destroyed.
// Optional chaining only handles missing references, not destroyed Electron objects.
export function liveContents(win){
  if(!win||win.isDestroyed())return null;
  const contents=win.webContents;
  return contents&&!contents.isDestroyed()?contents:null;
}

export function isWindowSender(event,...windows){
  const sender=event?.sender;
  if(!sender||sender.isDestroyed())return false;
  return windows.some(win=>liveContents(win)===sender);
}

// A successful navigation alone does not mean Chromium has painted a frame.
// Register before loadFile so even a warm-cache first paint cannot be missed.
export async function loadPaintedWindow(win,file,options){
  let onPaint,onClose;
  const painted=new Promise((resolve,reject)=>{
    onPaint=resolve;
    onClose=()=>reject(new Error('窗口在首次绘制前已关闭'));
    win.once('ready-to-show',onPaint);
    win.once('closed',onClose);
  });
  try{await Promise.all([painted,win.loadFile(file,options)]);}
  finally{
    win.removeListener('ready-to-show',onPaint);
    win.removeListener('closed',onClose);
  }
}

export function showLoadedWindow(win){
  if(!liveContents(win))return;
  if(win.isMinimized())win.restore();
  win.show();win.focus();
}
