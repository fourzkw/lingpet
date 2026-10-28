const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('quickControls',{
  get:()=>ipcRenderer.invoke('pet:quick-get'),
  act:body=>ipcRenderer.invoke('pet:quick-action',body),
  close:()=>ipcRenderer.send('pet:quick-close'),
  onUpdate:callback=>{const listener=()=>callback();ipcRenderer.on('pet:quick-update',listener);return()=>ipcRenderer.removeListener('pet:quick-update',listener);},
});
