import {createVideoPlayer} from './video-player.js';
import manifest from '../assets/chatgpt-white-dragon-h3/actions-v1/manifest.js';
const player=createVideoPlayer(new URL('../assets/chatgpt-white-dragon-h3/actions-v1/',import.meta.url),manifest);
export const readyWhiteDragonVideoState=player.readyState;
export function paintWhiteDragonVideo(ctx,state,elapsed,width,height,variant='pixel'){player.paint(ctx,state,elapsed,width,height,variant);}
