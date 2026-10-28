import {createVideoPlayer} from './video-player.js';
import manifest from '../assets/deepseek-h3/actions-v1/manifest.js';
const player=createVideoPlayer(new URL('../assets/deepseek-h3/actions-v1/',import.meta.url),manifest);
export const readyDeepseekVideoState=player.readyState;
export function paintDeepseekVideo(ctx,state,elapsed,width,height,variant='pixel'){player.paint(ctx,state,elapsed,width,height,variant);}
