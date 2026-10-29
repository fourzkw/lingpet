import {createVideoPlayer} from './video-player.js';
export function optionalVideo(root){
 let player,pending;
 const load=()=>pending??=import(new URL('manifest.js',root).href).then(({default:manifest})=>player=createVideoPlayer(root,manifest));
 return {
  async readyState(state='idle',variant='pixel'){await load();await player.readyState(state,variant);},
  paint(ctx,state,elapsed,width,height,variant='pixel'){if(!player){void load().catch(()=>{});return false;}player.paint(ctx,state,elapsed,width,height,variant);return true;}
 };
}
